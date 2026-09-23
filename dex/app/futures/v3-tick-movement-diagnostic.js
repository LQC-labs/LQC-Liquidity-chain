(function(){
"use strict";
const CHAIN="0x61";
const POOL="0xACf30D531C2DAc92a99a917d41Fa98ce7FBbED17";
const WBNB="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const BUSD="0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee";
const QUOTER="0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2";
const FEE=100;
const AMOUNTS=[
  1000000000000n,
  2000000000000n,
  5000000000000n,
  10000000000000n,
  20000000000000n,
  50000000000000n,
  100000000000000n,
  200000000000000n,
  500000000000000n,
  1000000000000000n
];
const $=id=>document.getElementById(id);
const poolIface=new ethers.Interface([
 "function slot0() view returns(uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
 "function liquidity() view returns(uint128)"
]);
const quoterIface=new ethers.Interface([
 "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)"
]);

async function req(method,params=[]){
 if(!window.ethereum)throw Error("TokenPocket DApp 브라우저에서 열어주세요.");
 return window.ethereum.request({method,params});
}
async function call(to,iface,fn,args=[]){
 const data=iface.encodeFunctionData(fn,args);
 const raw=await req("eth_call",[{to,data},"latest"]);
 return iface.decodeFunctionResult(fn,raw);
}
function tickFromSqrtPriceX96(value){
 const x=Number(value)/Math.pow(2,96);
 if(!Number.isFinite(x)||x<=0)throw Error("sqrtPriceX96 변환 실패");
 return Math.floor(Math.log(x*x)/Math.log(1.0001));
}
function formatWbnb(v){return ethers.formatUnits(v,18)+" WBNB"}

async function run(){
 const out=$("result");out.textContent="검증 중…";
 try{
  if((await req("eth_chainId")).toLowerCase()!==CHAIN)throw Error("BSC Testnet(chain 97)이 아닙니다.");
  for(const a of [POOL,QUOTER]){const code=await req("eth_getCode",[a,"latest"]);if(!code||code==="0x")throw Error("runtime code 없음: "+a)}
  const [slot,liq]=await Promise.all([call(POOL,poolIface,"slot0"),call(POOL,poolIface,"liquidity")]);
  const currentTick=Number(slot[1]),currentSqrt=slot[0],cardinality=Number(slot[3]),cardinalityNext=Number(slot[4]);
  const rows=[];
  for(const amountIn of AMOUNTS){
    try{
      const q=await call(QUOTER,quoterIface,"quoteExactInputSingle",[{
        tokenIn:WBNB,tokenOut:BUSD,amountIn,fee:FEE,sqrtPriceLimitX96:0
      }]);
      const amountOut=q[0],sqrtAfter=q[1],crossed=Number(q[2]),gasEstimate=q[3];
      const predictedTick=tickFromSqrtPriceX96(sqrtAfter);
      rows.push({
        amountIn:amountIn.toString(),
        amountInFormatted:formatWbnb(amountIn),
        amountOut:amountOut.toString(),
        sqrtPriceX96After:sqrtAfter.toString(),
        predictedTick,
        tickDelta:predictedTick-currentTick,
        initializedTicksCrossed:crossed,
        gasEstimate:gasEstimate.toString(),
        changesTick:predictedTick!==currentTick
      });
    }catch(e){
      rows.push({amountIn:amountIn.toString(),amountInFormatted:formatWbnb(amountIn),error:e.shortMessage||e.message||String(e)});
    }
  }
  const first=rows.find(x=>x.changesTick);
  const report={
    chainId:97,pool:POOL,quoter:QUOTER,fee:FEE,
    current:{sqrtPriceX96:currentSqrt.toString(),tick:currentTick,liquidity:liq[0].toString(),cardinality,cardinalityNext},
    firstQuotedTickChange:first||null,
    quotes:rows,
    transactionOccurred:false
  };
  out.textContent=JSON.stringify(report,null,2);
  if(first){
    $("status").textContent="읽기 전용 진단 PASS. 첫 예상 tick 변화 입력량: "+first.amountInFormatted+". 아직 거래는 실행하지 마세요.";
    $("status").dataset.type="ok";
  }else{
    $("status").textContent="검토 범위(최대 0.001 WBNB) 안에서는 예상 tick 변화가 확인되지 않았습니다. 거래하지 마세요.";
    $("status").dataset.type="error";
  }
 }catch(e){out.textContent="";$("status").textContent=e.message||String(e);$("status").dataset.type="error"}
}
$("pool").textContent=POOL;$("run").onclick=run;
})();