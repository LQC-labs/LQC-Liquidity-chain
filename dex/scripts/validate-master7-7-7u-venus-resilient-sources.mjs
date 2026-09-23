import { ethers } from "ethers";

const WBNB="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const RESILIENT="0x3cD69251D04A28d887Ac14cbe2E14c52F3D57823";
const REDSTONE="0x0Af51d1504ac5B711A9EAFe2fAC11A51d32029Ad";
const CHAINLINK_FEED="0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526";

const provider=new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545");
if((await provider.getNetwork()).chainId!==97n) throw new Error("Expected BSC Testnet chain 97");
if(await provider.getCode(RESILIENT)==="0x") throw new Error("No Resilient Oracle runtime code.");

const resilient=new ethers.Contract(RESILIENT,[
  "function getOracle(address asset,uint8 role) view returns(address oracle,bool enabled)",
  "function getPrice(address asset) view returns(uint256)"
],provider);

const roles={MAIN:0,PIVOT:1,FALLBACK:2};
const out={};
for(const [name,role] of Object.entries(roles)){
  try{
    const r=await resilient.getOracle(WBNB,role);
    out[name]={oracle:ethers.getAddress(r[0]),enabled:Boolean(r[1]),runtimeCode:(await provider.getCode(r[0]))!=="0x"};
  }catch(e){
    out[name]={error:e.shortMessage||e.message||String(e),data:e?.data||e?.error?.data||e?.info?.error?.data||null};
  }
}

let price=null;
try{price=(await resilient.getPrice(WBNB)).toString();}catch(e){price={error:e.shortMessage||e.message||String(e)};}

const addresses=Object.values(out).filter(x=>x?.oracle).map(x=>x.oracle.toLowerCase());
const distinctEnabled=new Set(Object.values(out).filter(x=>x?.enabled&&x?.oracle&&x.oracle!==ethers.ZeroAddress).map(x=>x.oracle.toLowerCase())).size;
const redstoneUsed=addresses.includes(REDSTONE.toLowerCase());
const directChainlinkFeedUsed=addresses.includes(CHAINLINK_FEED.toLowerCase());

console.log(JSON.stringify({
  status:"VENUS_RESILIENT_SOURCE_INDEPENDENCE",
  chainId:97,
  asset:WBNB,
  resilientOracle:RESILIENT,
  roles:out,
  resilientPrice:price,
  redstoneUsed,
  directChainlinkFeedUsed,
  distinctEnabledSources:distinctEnabled,
  independentEnoughForLQCReference:distinctEnabled>=2 && redstoneUsed
},null,2));