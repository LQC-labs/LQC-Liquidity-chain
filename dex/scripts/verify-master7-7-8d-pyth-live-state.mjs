import { ethers } from "ethers";

const RPC=process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545";
const HELPER="0xC9a880dC29037ac3139CdDA6C42cc5A55A744f35";
const ADAPTER="0xcbCc852873C98CDcEF37F07992BfA05C6Ae07e26";
const PYTH_CORE="0x5744Cbf430D99456a0A8771208b674F27f8EF0Fb";
const PRICE_ID="0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f";

const provider=new ethers.JsonRpcProvider(RPC);
const net=await provider.getNetwork();
if(net.chainId!==97n) throw new Error("Expected BSC Testnet chain 97");

const [helperCode,adapterCode]=await Promise.all([
 provider.getCode(HELPER),
 provider.getCode(ADAPTER)
]);
if(helperCode==="0x") throw new Error("Update Helper runtime code missing");
if(adapterCode==="0x") throw new Error("Reference Adapter runtime code missing");

const helper=new ethers.Contract(HELPER,[
 "function pyth() view returns(address)"
],provider);
const adapter=new ethers.Contract(ADAPTER,[
 "function pyth() view returns(address)",
 "function priceId() view returns(bytes32)",
 "function maxAge() view returns(uint32)",
 "function maxConfidenceBps() view returns(uint16)",
 "function decimals() view returns(uint8)",
 "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"
],provider);

const [helperPyth,adapterPyth,priceId,maxAge,maxConfidenceBps,decimals]=await Promise.all([
 helper.pyth(),
 adapter.pyth(),
 adapter.priceId(),
 adapter.maxAge(),
 adapter.maxConfidenceBps(),
 adapter.decimals()
]);

if(ethers.getAddress(helperPyth)!==ethers.getAddress(PYTH_CORE)) throw new Error("Helper Pyth Core mismatch");
if(ethers.getAddress(adapterPyth)!==ethers.getAddress(PYTH_CORE)) throw new Error("Adapter Pyth Core mismatch");
if(priceId.toLowerCase()!==PRICE_ID.toLowerCase()) throw new Error("BNB/USD priceId mismatch");
if(maxAge!==120n) throw new Error("maxAge mismatch");
if(maxConfidenceBps!==500n) throw new Error("maxConfidence mismatch");
if(decimals!==18n) throw new Error("decimals mismatch");

let latestRoundData;
try{
 const r=await adapter.latestRoundData();
 latestRoundData={
   ok:true,
   roundId:r[0].toString(),
   answer:r[1].toString(),
   startedAt:r[2].toString(),
   updatedAt:r[3].toString(),
   answeredInRound:r[4].toString()
 };
}catch(e){
 latestRoundData={
   ok:false,
   error:e.shortMessage||e.message||String(e),
   data:e?.data||e?.error?.data||e?.info?.error?.data||null
 };
}

console.log(JSON.stringify({
 status:"PYTH_LIVE_STATE_VERIFIED",
 chainId:97,
 helper:{address:HELPER,pythCore:helperPyth,runtimeCodeBytes:(helperCode.length-2)/2},
 adapter:{
   address:ADAPTER,
   pythCore:adapterPyth,
   priceId,
   maxAge:Number(maxAge),
   maxConfidenceBps:Number(maxConfidenceBps),
   decimals:Number(decimals),
   runtimeCodeBytes:(adapterCode.length-2)/2,
   latestRoundData
 },
 governanceReferenceReplacementAuthorized:false
},null,2));