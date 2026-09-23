(function(){
"use strict";
const CHAIN="0x61";
const SIGNER="0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
const POOL="0xACf30D531C2DAc92a99a917d41Fa98ce7FBbED17";
const WBNB="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const BUSD="0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee";
const ROUTER="0x1b81D678ffb9C0263b24A97847620C99d213eB14";
const QUOTER="0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2";
const TWAP_ADAPTER="0xdE15B270d40C4CD5B8fd9C0405c9099d3441C523";
const FEE=100;
const AMOUNT_IN=1000000000000n; // 0.000001 WBNB
const MIN_NATIVE_RESERVE=300000000000000000n;
const STORAGE_KEY="lqc-7-7-7f-cardinality-materialization-v1";
const $=id=>document.getElementById(id);

const erc20=new ethers.Interface([
 "function balanceOf(address) view returns(uint256)",
 "function allowance(address,address) view returns(uint256)",
 "function approve(address,uint256) returns(bool)"
]);
const poolIface=new ethers.Interface([
 "function token0() view returns(address)",
 "function token1() view returns(address)",
 "function fee() view returns(uint24)",
 "function liquidity() view returns(uint128)",
 "function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint8,bool)"
]);
const quoterIface=new ethers.Interface([
 "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)"
]);
const routerIface=new ethers.Interface([
 "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256 amountOut)"
]);
const wbnbIface=new ethers.Interface(["function deposit() payable"]);
const twapIface=new ethers.Interface([
 "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"
]);

let account="",busy=false,nextAction=null,liveQuote=0n,liveMinimum=0n;

function status(m,t="info"){$("status").textContent=m;$("status").dataset.type=t}
async function req(method,params=[]){if(!window.ethereum)throw Error("TokenPocket DApp 브라우저에서 열어주세요.");return window.ethereum.request({method,params})}
async function call(to,iface,fn,args=[]){
 const data=iface.encodeFunctionData(fn,args);
 const raw=await req("eth_call",[{to,data},"latest"]);
 return iface.decodeFunctionResult(fn,raw);
}
async function balanceOf(token){return (await call(token,erc20,"balanceOf",[SIGNER]))[0]}
async function allowance(){return (await call(WBNB,erc20,"allowance",[SIGNER,ROUTER]))[0]}

async function baseState(){
 if((await req("eth_chainId")).toLowerCase()!==CHAIN)throw Error("BSC Testnet(chain 97)이 아닙니다.");
 for(const a of [POOL,WBNB,BUSD,ROUTER,QUOTER,TWAP_ADAPTER]){
   const code=await req("eth_getCode",[a,"latest"]); if(!code||code==="0x")throw Error("필수 계약 runtime code 없음: "+a);
 }
 const [t0,t1,fee,liq,slot]=await Promise.all([
   call(POOL,poolIface,"token0"),call(POOL,poolIface,"token1"),call(POOL,poolIface,"fee"),
   call(POOL,poolIface,"liquidity"),call(POOL,poolIface,"slot0")
 ]);
 const token0=ethers.getAddress(t0[0]),token1=ethers.getAddress(t1[0]);
 if(![token0,token1].includes(ethers.getAddress(WBNB))||![token0,token1].includes(ethers.getAddress(BUSD)))throw Error("Pool pair 불일치");
 if(Number(fee[0])!==FEE)throw Error("Pool fee 불일치");
 if(liq[0]<=0n)throw Error("Pool liquidity가 0입니다.");
 const cardinality=Number(slot[3]),cardinalityNext=Number(slot[4]);
 if(cardinalityNext<8)throw Error("cardinalityNext가 8 미만입니다. 7/7-7E부터 다시 확인하세요.");
 return {token0,token1,fee:Number(fee[0]),liquidity:liq[0].toString(),cardinality,cardinalityNext};
}

async function quote(){
 const raw=await req("eth_call",[{to:QUOTER,data:quoterIface.encodeFunctionData("quoteExactInputSingle",[{
   tokenIn:WBNB,tokenOut:BUSD,amountIn:AMOUNT_IN,fee:FEE,sqrtPriceLimitX96:0
 }])},"latest"]);
 const decoded=quoterIface.decodeFunctionResult("quoteExactInputSingle",raw);
 const amountOut=decoded[0];
 if(amountOut<=0n)throw Error("Quoter 결과가 0입니다.");
 liveQuote=amountOut;
 liveMinimum=amountOut*99n/100n;
 return {amountOut:amountOut.toString(),minimumOut:liveMinimum.toString()};
}

async function twapReady(){
 try{
   const r=await call(TWAP_ADAPTER,twapIface,"latestRoundData");
   return {ready:true,answer:r[1].toString(),updatedAt:r[3].toString()};
 }catch(e){return {ready:false,error:e.shortMessage||e.message||String(e)}}
}

async function refresh(){
 nextAction=null;
 for(const id of ["wrap","approve","swap"])$(id).disabled=true;
 const state=await baseState();
 const [wbnb,busd,approved,native,twap]=await Promise.all([
   balanceOf(WBNB),balanceOf(BUSD),allowance(),req("eth_getBalance",[SIGNER,"latest"]),twapReady()
 ]);
 $("state").textContent=JSON.stringify({...state,wbnbBalance:wbnb.toString(),busdBalance:busd.toString(),allowance:approved.toString(),twapAdapter:twap},null,2);
 if(state.cardinality>=2&&twap.ready){
   status("cardinality>=2 및 TWAP Adapter latestRoundData PASS. 추가 상태변화가 필요하지 않습니다.","ok"); return;
 }
 if(localStorage.getItem(STORAGE_KEY)){
   status("이 브라우저에서 이미 최소 상태변화 거래를 실행했습니다. 중복 스왑을 차단합니다. 1번 검증만 다시 실행하세요.","warn"); return;
 }
 if(busy)return;
 if(wbnb<AMOUNT_IN){
   const n=BigInt(native);
   if(n-AMOUNT_IN<MIN_NATIVE_RESERVE)throw Error("WBNB 래핑 후 0.3 tBNB 보호 잔액을 유지할 수 없습니다.");
   nextAction="wrap";$("wrap").disabled=false;
   status("WBNB가 부족합니다. 2번에서 정확히 0.000001 tBNB만 WBNB로 래핑하세요.","ok"); return;
 }
 if(approved>AMOUNT_IN)throw Error("기존 Router WBNB 승인이 최소 입력량보다 큽니다. 추가 거래를 중단하고 승인 상태를 정리해야 합니다.");
 if(approved<AMOUNT_IN){
   nextAction="approve";$("approve").disabled=false;
   status("WBNB 잔액 확인 완료. 3번에서 정확히 0.000001 WBNB만 Router에 승인하세요.","ok"); return;
 }
 const q=await quote();
 $("quote").textContent=JSON.stringify(q,null,2);
 nextAction="swap";$("swap").disabled=false;
 status("Live Quoter PASS. 4번 최소 WBNB→BUSD 스왑 1회만 준비됐습니다.","ok");
}

async function waitReceipt(hash){
 for(let i=0;i<90;i++){const r=await req("eth_getTransactionReceipt",[hash]);if(r)return r;await new Promise(x=>setTimeout(x,4000))}
 throw Error("영수증 확인 지연. 다시 보내지 말고 거래 해시를 보관하세요.");
}
async function send(action,label,txFactory){
 await refresh();
 if(nextAction!==action)throw Error("현재 상태와 맞지 않는 단계입니다. 활성화된 버튼만 누르세요.");
 const accounts=await req("eth_accounts");
 if(!accounts[0]||accounts[0].toLowerCase()!==SIGNER.toLowerCase())throw Error("승인된 Deployer 지갑이 아닙니다.");
 const tx=typeof txFactory==="function"?txFactory():txFactory;
 const gas=await req("eth_estimateGas",[tx]);
 busy=true;for(const id of ["wrap","approve","swap"])$(id).disabled=true;
 status(label+" 확인창입니다. 네트워크/주소/수량을 확인하세요.");
 const hash=await req("eth_sendTransaction",[{...tx,gas}]);
 $("tx").textContent=hash;
 const receipt=await waitReceipt(hash);
 if(BigInt(receipt.status)!==1n)throw Error(label+" 거래 실패");
 if(action==="swap")localStorage.setItem(STORAGE_KEY,hash);
 busy=false;
 await refresh();
}
async function run(fn){try{await fn()}catch(e){busy=false;status(e.message||String(e),"error")}}

$("connect").onclick=()=>run(async()=>{
 const accounts=await req("eth_requestAccounts");account=accounts[0]||"";
 if(account.toLowerCase()!==SIGNER.toLowerCase())throw Error("TokenPocket Deployer 지갑 0xDe05…6FB로 연결하세요.");
 $("wallet").textContent=account;await refresh();
});
$("wrap").onclick=()=>run(()=>send("wrap","0.000001 tBNB → WBNB 래핑",{from:SIGNER,to:WBNB,value:"0x"+AMOUNT_IN.toString(16),data:wbnbIface.encodeFunctionData("deposit")}));
$("approve").onclick=()=>run(()=>send("approve","WBNB 0.000001 정확 승인",{from:SIGNER,to:WBNB,value:"0x0",data:erc20.encodeFunctionData("approve",[ROUTER,AMOUNT_IN])}));
$("swap").onclick=()=>run(()=>send("swap","최소 WBNB→BUSD Pool state-change",()=>({
 from:SIGNER,to:ROUTER,value:"0x0",data:routerIface.encodeFunctionData("exactInputSingle",[{
   tokenIn:WBNB,tokenOut:BUSD,fee:FEE,recipient:SIGNER,
   deadline:BigInt(Math.floor(Date.now()/1000)+1200),amountIn:AMOUNT_IN,amountOutMinimum:liveMinimum,sqrtPriceLimitX96:0
 }])
})));
$("pool").textContent=POOL;$("adapter").textContent=TWAP_ADAPTER;$("signer").textContent=SIGNER;
})();