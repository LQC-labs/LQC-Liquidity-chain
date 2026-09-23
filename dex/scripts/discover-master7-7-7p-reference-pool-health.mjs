import { ethers } from "ethers";
import { twapTickToScaledPrice } from "./futures-twap-price-conversion.mjs";

const FACTORY="0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const INDEX="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const QUOTE="0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee";
const FEED="0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526";
const FEES=[100,500,2500,10000];
const WINDOW=1800;

const provider=new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545");
if((await provider.getNetwork()).chainId!==97n) throw new Error("Expected BSC Testnet chain 97");

const factory=new ethers.Contract(FACTORY,["function getPool(address,address,uint24) view returns(address)"],provider);
const poolAbi=[
 "function token0() view returns(address)",
 "function token1() view returns(address)",
 "function liquidity() view returns(uint128)",
 "function slot0() view returns(uint160,int24,uint16,uint16,uint16,uint32,bool)",
 "function observe(uint32[] secondsAgos) view returns(int56[],uint160[])"
];
const agg=new ethers.Contract(FEED,[
 "function decimals() view returns(uint8)",
 "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"
],provider);
const [feedDecimals,round]=await Promise.all([agg.decimals(),agg.latestRoundData()]);
const primaryRaw=BigInt(round[1]);
const primary18=Number(feedDecimals)===18?primaryRaw:
 Number(feedDecimals)<18?primaryRaw*10n**BigInt(18-Number(feedDecimals)):
 primaryRaw/10n**BigInt(Number(feedDecimals)-18);

function bps(a,b){const d=a>b?a-b:b-a;return (d*10000n)/b;}
const rows=[];
for(const fee of FEES){
 const pool=ethers.getAddress(await factory.getPool(INDEX,QUOTE,fee));
 if(pool===ethers.ZeroAddress){rows.push({fee,pool,exists:false});continue;}
 const p=new ethers.Contract(pool,poolAbi,provider);
 const [token0,token1,liq,slot]=await Promise.all([p.token0(),p.token1(),p.liquidity(),p.slot0()]);
 const tick=Number(slot[1]);
 const spot=twapTickToScaledPrice({tick,token0,token1,indexToken:INDEX,quoteToken:QUOTE,token0Decimals:18,token1Decimals:18});
 let twapReady=false,twap=null,meanTick=null,observeError=null;
 try{
   const obs=await p.observe([WINDOW,0]);
   const delta=obs[0][1]-obs[0][0];
   let mean=delta/BigInt(WINDOW);
   if(delta<0n&&delta%BigInt(WINDOW)!==0n)mean-=1n;
   meanTick=Number(mean);
   twap=twapTickToScaledPrice({tick:meanTick,token0,token1,indexToken:INDEX,quoteToken:QUOTE,token0Decimals:18,token1Decimals:18});
   twapReady=true;
 }catch(e){observeError=e.shortMessage||e.message||String(e);}
 rows.push({
   fee,pool,exists:true,token0,token1,
   liquidity:liq.toString(),tick,
   observationCardinality:Number(slot[3]),observationCardinalityNext:Number(slot[4]),
   feeProtocol:Number(slot[5]),unlocked:slot[6],
   spotPrice:spot.toString(),spotDeviationBps:bps(spot,primary18).toString(),
   twapReady,meanTick,twapPrice:twap?.toString()||null,
   twapDeviationBps:twap?bps(twap,primary18).toString():null,observeError
 });
}
console.log(JSON.stringify({
 status:"REFERENCE_POOL_HEALTH_DISCOVERY",
 chainId:97,
 primary:{feed:FEED,decimals:Number(feedDecimals),answer:primaryRaw.toString(),normalized18:primary18.toString()},
 window:WINDOW,
 pools:rows
},null,2));
