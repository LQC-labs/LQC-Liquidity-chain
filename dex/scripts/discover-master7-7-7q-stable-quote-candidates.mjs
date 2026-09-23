import { ethers } from "ethers";
import { twapTickToScaledPrice } from "./futures-twap-price-conversion.mjs";

const FACTORY="0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const INDEX="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const FEED="0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526";
const FEES=[100,500,2500,10000];
const WINDOW=1800;
const QUOTES=[
 {label:"USDC_A",address:"0xa2892eadd1d8df2f1f716e6f94c2b10f908e8a2c"},
 {label:"USDC_B",address:"0x2e3a8b87b447440921fd877459880c963971f7e0"},
 {label:"USDC_C",address:"0x3e2ce6d79733ba1276b92a76d8dc2141bef85684"},
 {label:"USDC_D",address:"0xb48249ef5b895d6e7ad398186df2b0c3cec2bf94"},
 {label:"USDC_E",address:"0x16227d60f7a0e586c66b005219dfc887d13c9531"},
 {label:"USDT_A",address:"0x47b3304edefe079a26b7b9417ffa6f499a9101ca"}
];

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
const erc20Abi=[
 "function decimals() view returns(uint8)",
 "function symbol() view returns(string)",
 "function name() view returns(string)"
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
const results=[];
for(const q of QUOTES){
 const token=new ethers.Contract(q.address,erc20Abi,provider);
 let meta={};
 try{
   const [decimals,symbol,name]=await Promise.all([token.decimals(),token.symbol(),token.name()]);
   meta={decimals:Number(decimals),symbol,name};
 }catch(e){
   results.push({...q,tokenReadable:false,error:e.shortMessage||e.message||String(e)});
   continue;
 }
 const pools=[];
 for(const fee of FEES){
   const pool=ethers.getAddress(await factory.getPool(INDEX,q.address,fee));
   if(pool===ethers.ZeroAddress){pools.push({fee,pool,exists:false});continue;}
   const p=new ethers.Contract(pool,poolAbi,provider);
   try{
     const [token0,token1,liq,slot]=await Promise.all([p.token0(),p.token1(),p.liquidity(),p.slot0()]);
     const tick=Number(slot[1]);
     const spot=twapTickToScaledPrice({
       tick,token0,token1,indexToken:INDEX,quoteToken:q.address,
       token0Decimals:18,token1Decimals:meta.decimals
     });
     let twap=null,meanTick=null,twapReady=false,observeError=null;
     try{
       const obs=await p.observe([WINDOW,0]);
       const delta=obs[0][1]-obs[0][0];
       let mean=delta/BigInt(WINDOW);
       if(delta<0n&&delta%BigInt(WINDOW)!==0n)mean-=1n;
       meanTick=Number(mean);
       twap=twapTickToScaledPrice({
         tick:meanTick,token0,token1,indexToken:INDEX,quoteToken:q.address,
         token0Decimals:18,token1Decimals:meta.decimals
       });
       twapReady=true;
     }catch(e){observeError=e.shortMessage||e.message||String(e);}
     pools.push({
       fee,pool,exists:true,liquidity:liq.toString(),tick,
       observationCardinality:Number(slot[3]),observationCardinalityNext:Number(slot[4]),
       unlocked:slot[6],spotPrice:spot.toString(),spotDeviationBps:bps(spot,primary18).toString(),
       twapReady,meanTick,twapPrice:twap?.toString()||null,
       twapDeviationBps:twap?bps(twap,primary18).toString():null,observeError
     });
   }catch(e){pools.push({fee,pool,exists:true,readError:e.shortMessage||e.message||String(e)});}
 }
 results.push({...q,tokenReadable:true,...meta,pools});
}
console.log(JSON.stringify({
 status:"STABLE_QUOTE_CANDIDATE_DISCOVERY",
 chainId:97,
 primary:{normalized18:primary18.toString(),raw:primaryRaw.toString(),decimals:Number(feedDecimals)},
 quotes:results
},null,2));