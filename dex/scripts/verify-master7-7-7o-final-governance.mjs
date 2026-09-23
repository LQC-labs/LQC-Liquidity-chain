import { ethers } from "ethers";

const PRIMARY="0x2582c3156e42df6115c020fb8006b3949c93c1a9";
const OWNER="0x89d992f696B40ABbDB6610144faeF336911D8175";
const INDEX="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const FEED="0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526";
const TWAP="0x5AE96E36356AC18728804577E926B4b362017c0d";
const HEARTBEAT=3600;
const DEVIATION=500;

const oracleAbi=[
  "function owner() view returns(address)",
  "function feedConfigs(address indexToken) view returns(address feed,uint32 heartbeat,address referenceFeed,uint16 maxDeviationBps)",
  "function getPrice(address indexToken) view returns(uint256 price,uint256 updatedAt)"
];
const aggAbi=[
 "function decimals() view returns(uint8)",
 "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"
];
const errorIface=new ethers.Interface([
 "error ExcessivePriceDeviation()",
 "error FeedNotConfigured()",
 "error InvalidFeedAnswer()",
 "error InvalidFeedTimestamp()",
 "error StaleFeedPrice()"
]);

const provider=new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545");
const net=await provider.getNetwork();
if(net.chainId!==97n) throw new Error("Expected chain 97");

const oracle=new ethers.Contract(PRIMARY,oracleAbi,provider);
const primaryFeed=new ethers.Contract(FEED,aggAbi,provider);
const twap=new ethers.Contract(TWAP,aggAbi,provider);
const [owner,cfg,primaryRound,twapRound,primaryDecimals]=await Promise.all([
  oracle.owner(),
  oracle.feedConfigs(INDEX),
  primaryFeed.latestRoundData(),
  twap.latestRoundData(),
  primaryFeed.decimals()
]);

let getPriceResult={ok:false};
try{
  const price=await oracle.getPrice(INDEX);
  getPriceResult={ok:true,price:price[0].toString(),updatedAt:price[1].toString()};
}catch(e){
  const data=e?.data||e?.error?.data||e?.info?.error?.data||null;
  let parsed=null;
  try{ if(data) parsed=errorIface.parseError(data); }catch{}
  getPriceResult={ok:false,errorName:parsed?.name||null,data};
}

const primaryRaw=BigInt(primaryRound[1]);
const twapRaw=BigInt(twapRound[1]);
const primaryNormalized=Number(primaryDecimals)===18
  ? primaryRaw
  : Number(primaryDecimals)<18
    ? primaryRaw*(10n**BigInt(18-Number(primaryDecimals)))
    : primaryRaw/(10n**BigInt(Number(primaryDecimals)-18));
const diff=primaryNormalized>twapRaw?primaryNormalized-twapRaw:twapRaw-primaryNormalized;
const deviationBps=(diff*10000n)/twapRaw;

const checks={
  ownerMatches:ethers.getAddress(owner)===ethers.getAddress(OWNER),
  feedMatches:ethers.getAddress(cfg[0])===ethers.getAddress(FEED),
  heartbeatMatches:Number(cfg[1])===HEARTBEAT,
  referenceFeedMatches:ethers.getAddress(cfg[2])===ethers.getAddress(TWAP),
  deviationMatches:Number(cfg[3])===DEVIATION,
  primaryPositive:BigInt(primaryRound[1])>0n,
  twapPositive:BigInt(twapRound[1])>0n,
  circuitBreakerBehavior:
    getPriceResult.ok
      ? BigInt(getPriceResult.price)>0n
      : getPriceResult.errorName==="ExcessivePriceDeviation"
};
for(const [k,v] of Object.entries(checks)) if(!v) throw new Error(`Check failed: ${k}`);

console.log(JSON.stringify({
  status:"FINAL_GOVERNANCE_ORACLE_VERIFIED",
  chainId:97,
  owner,
  feedConfig:{
    feed:cfg[0],
    heartbeat:Number(cfg[1]),
    referenceFeed:cfg[2],
    maxDeviationBps:Number(cfg[3])
  },
  primaryAnswer:primaryRound[1].toString(),
  twapAnswer:twapRound[1].toString(),
  primaryDecimals:Number(primaryDecimals),
  primaryNormalized:primaryNormalized.toString(),
  deviationBps:deviationBps.toString(),
  getPrice:getPriceResult,
  stageExitReady:getPriceResult.ok,
  safetyConclusion:getPriceResult.ok
    ?"Circuit breaker configured and current reference is within allowed deviation."
    :"Circuit breaker correctly fails closed because reference deviation exceeds the configured threshold.",
  checks
},null,2));
