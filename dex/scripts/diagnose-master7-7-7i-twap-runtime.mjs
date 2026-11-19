import { ethers } from "ethers";

const RPC=process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545";
const POOL="0xACf30D531C2DAc92a99a917d41Fa98ce7FBbED17";
const ADAPTER="0xdE15B270d40C4CD5B8fd9C0405c9099d3441C523";
const WINDOW=1800;

const poolAbi=[
 "function slot0() view returns(uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
 "function liquidity() view returns(uint128)",
 "function observe(uint32[] secondsAgos) view returns(int56[] tickCumulatives,uint160[] secondsPerLiquidityCumulativeX128s)"
];
const adapterAbi=["function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"];

function errData(e){
 return e?.data||e?.error?.data||e?.info?.error?.data||null;
}

async function main(){
 const provider=new ethers.JsonRpcProvider(RPC);
 const network=await provider.getNetwork();
 if(network.chainId!==97n)throw new Error("Expected BSC Testnet chain 97");
 const pool=new ethers.Contract(POOL,poolAbi,provider);
 const adapter=new ethers.Contract(ADAPTER,adapterAbi,provider);

 const [slot,liq]=await Promise.all([pool.slot0(),pool.liquidity()]);
 const direct={ok:false};
 try{
   const obs=await pool.observe([WINDOW,0]);
   const ticks=obs[0];
   const delta=ticks[1]-ticks[0];
   const w=BigInt(WINDOW);
   let mean=delta/w;
   if(delta<0n && delta%w!==0n)mean-=1n;
   direct.ok=true;
   direct.tickCumulatives=ticks.map(String);
   direct.meanTick=mean.toString();
 }catch(e){
   direct.error=e.shortMessage||e.message||String(e);
   direct.data=errData(e);
 }

 const latest={ok:false};
 try{
   const r=await adapter.latestRoundData();
   latest.ok=true;
   latest.roundId=r[0].toString();
   latest.answer=r[1].toString();
   latest.startedAt=r[2].toString();
   latest.updatedAt=r[3].toString();
   latest.answeredInRound=r[4].toString();
 }catch(e){
   latest.error=e.shortMessage||e.message||String(e);
   latest.data=errData(e);
 }

 console.log(JSON.stringify({
   status:"READ_ONLY_TWAP_RUNTIME_DIAGNOSTIC",
   chainId:97,
   pool:POOL,
   adapter:ADAPTER,
   slot0:{
     sqrtPriceX96:slot[0].toString(),
     tick:Number(slot[1]),
     observationIndex:Number(slot[2]),
     observationCardinality:Number(slot[3]),
     observationCardinalityNext:Number(slot[4]),
     unlocked:slot[6]
   },
   liquidity:liq.toString(),
   directObserve:direct,
   adapterLatestRoundData:latest,
   transactionOccurred:false
 },null,2));
 if(!direct.ok)process.exitCode=2;
 if(!latest.ok)process.exitCode=3;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
