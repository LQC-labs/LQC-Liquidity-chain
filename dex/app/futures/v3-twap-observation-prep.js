(function(){
"use strict";
const CHAIN="0x61";
const POOL="0xACf30D531C2DAc92a99a917d41Fa98ce7FBbED17";
const INDEX="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const QUOTE="0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee";
const APPROVED_SIGNER="0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
const TARGET_NEXT=8;
const LOOKBACK=1800;
const $=id=>document.getElementById(id);
const abi=[
 "function token0() view returns(address)",
 "function token1() view returns(address)",
 "function liquidity() view returns(uint128)",
 "function slot0() view returns(uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
 "function observe(uint32[] secondsAgos) view returns(int56[] tickCumulatives,uint160[] secondsPerLiquidityCumulativeX128s)",
 "function increaseObservationCardinalityNext(uint16 observationCardinalityNext)"
];
const iface=new ethers.Interface(abi);
let account=null,busy=false,ready=false;

function status(m,t="info"){$("status").textContent=m;$("status").dataset.type=t}
async function req(method,params=[]){
 if(!window.ethereum)throw Error("TokenPocket DApp 브라우저에서 열어주세요.");
 return window.ethereum.request({method,params});
}
async function call(fn,args=[]){
 const data=iface.encodeFunctionData(fn,args);
 const raw=await req("eth_call",[{to:POOL,data},"latest"]);
 return iface.decodeFunctionResult(fn,raw);
}
function samePair(a,b){
 const x=[a.toLowerCase(),b.toLowerCase()].sort();
 const y=[INDEX.toLowerCase(),QUOTE.toLowerCase()].sort();
 return x[0]===y[0]&&x[1]===y[1];
}
async function inspect(){
 if((await req("eth_chainId")).toLowerCase()!==CHAIN)throw Error("BSC Testnet(chain 97)이 아닙니다.");
 const code=await req("eth_getCode",[POOL,"latest"]);
 if(!code||code==="0x")throw Error("대상 V3 Pool runtime code가 없습니다.");
 const [t0,t1,liq,slot]=await Promise.all([call("token0"),call("token1"),call("liquidity"),call("slot0")]);
 const token0=ethers.getAddress(t0[0]),token1=ethers.getAddress(t1[0]);
 if(!samePair(token0,token1))throw Error("고정된 Pool의 token pair가 WBNB/BUSD와 일치하지 않습니다.");
 const liquidity=liq[0],cardinality=Number(slot[3]),cardinalityNext=Number(slot[4]),unlocked=slot[6];
 if(liquidity<=0n)throw Error("Pool liquidity가 0입니다.");
 if(slot[0]===0n||unlocked!==true)throw Error("Pool이 초기화/활성 상태가 아닙니다.");
 let observeReady=false,observeError="";
 try{await call("observe",[[LOOKBACK,0]]);observeReady=true}catch(e){observeError=e.shortMessage||e.message||String(e)}
 return {token0,token1,liquidity:liquidity.toString(),cardinality,cardinalityNext,observeReady,observeError};
}
function render(result){
 $("state").textContent=JSON.stringify(result,null,2);
 if(result.observeReady){
   ready=false;$("prepare").disabled=true;
   status("이미 1800초 TWAP observe가 가능합니다. 추가 cardinality 거래가 필요하지 않습니다.","ok");
   return;
 }
 if(result.cardinalityNext>=TARGET_NEXT){
   ready=false;$("prepare").disabled=true;
   status("cardinalityNext는 이미 목표 이상입니다. 실제 observationCardinality가 증가하려면 이후 별도 pool state-change가 필요합니다. 자동 스왑은 실행하지 않습니다.","warn");
   return;
 }
 ready=true;$("prepare").disabled=false;
 status("읽기 검증 통과. observationCardinalityNext만 "+TARGET_NEXT+"로 늘릴 준비가 됐습니다. 이 거래는 유동성/토큰을 이동하지 않습니다.","ok");
}
async function connect(){
 try{
   busy=true;ready=false;$("prepare").disabled=true;
   const accounts=await req("eth_requestAccounts");
   account=accounts[0]||"";
   if(account.toLowerCase()!==APPROVED_SIGNER.toLowerCase())throw Error("승인된 Futures Deployer 지갑으로 연결하세요.");
   $("wallet").textContent=account;
   render(await inspect());
 }catch(e){status(e.message||String(e),"error")}
 finally{busy=false}
}
async function prepare(){
 if(busy||!ready)return;
 try{
   busy=true;$("prepare").disabled=true;
   const accounts=await req("eth_accounts");
   if(!accounts[0]||accounts[0].toLowerCase()!==APPROVED_SIGNER.toLowerCase())throw Error("연결 지갑이 변경됐습니다.");
   const before=await inspect();
   if(before.observeReady)throw Error("이미 TWAP-ready입니다. 거래를 보내지 않습니다.");
   if(before.cardinalityNext>=TARGET_NEXT)throw Error("이미 cardinalityNext 목표 이상입니다.");
   const data=iface.encodeFunctionData("increaseObservationCardinalityNext",[TARGET_NEXT]);
   const tx={from:APPROVED_SIGNER,to:POOL,value:"0x0",data};
   const gas=await req("eth_estimateGas",[tx]);
   status("TokenPocket 확인창에서 BSC Testnet, 대상 Pool, value 0 tBNB를 확인한 뒤 승인하세요.");
   const hash=await req("eth_sendTransaction",[{...tx,gas}]);
   $("tx").textContent=hash;
   let receipt=null;
   for(let i=0;i<90&&!receipt;i++){receipt=await req("eth_getTransactionReceipt",[hash]);if(!receipt)await new Promise(r=>setTimeout(r,4000))}
   if(!receipt)throw Error("영수증 확인이 지연됩니다. 다시 누르지 말고 거래 해시를 보관하세요.");
   if(BigInt(receipt.status)!==1n)throw Error("cardinalityNext 증가 거래가 실패했습니다.");
   const after=await inspect();
   $("state").textContent=JSON.stringify(after,null,2);
   if(after.cardinalityNext<TARGET_NEXT)throw Error("거래 후 cardinalityNext 검증 실패");
   status("cardinalityNext 증가 성공. 실제 observationCardinality 증가는 이후 Pool state-change에서 진행됩니다. 자동 스왑은 실행하지 않습니다.","ok");
 }catch(e){status(e.message||String(e),"error")}
 finally{busy=false}
}
$("pool").textContent=POOL;
$("index").textContent=INDEX;
$("quote").textContent=QUOTE;
$("target").textContent=String(TARGET_NEXT);
$("connect").onclick=connect;
$("prepare").onclick=prepare;
})();