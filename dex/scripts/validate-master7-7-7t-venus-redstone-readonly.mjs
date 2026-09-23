import { ethers } from "ethers";

const WBNB="0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const CHAINLINK="0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526";
const VENUS_REDSTONE="0x0Af51d1504ac5B711A9EAFe2fAC11A51d32029Ad";
const VENUS_RESILIENT="0x3cD69251D04A28d887Ac14cbe2E14c52F3D57823";

const provider=new ethers.JsonRpcProvider(process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545");
if((await provider.getNetwork()).chainId!==97n) throw new Error("Expected BSC Testnet chain 97");

const oracleAbi=["function getPrice(address asset) view returns(uint256)"];
const chainlinkAbi=[
 "function decimals() view returns(uint8)",
 "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"
];
const redstone=new ethers.Contract(VENUS_REDSTONE,oracleAbi,provider);
const resilient=new ethers.Contract(VENUS_RESILIENT,oracleAbi,provider);
const chainlink=new ethers.Contract(CHAINLINK,chainlinkAbi,provider);

function deviationBps(a,b){const d=a>b?a-b:b-a;return (d*10000n)/b;}
async function safe(name,fn){
 try{return {name,ok:true,value:(await fn()).toString()};}
 catch(e){return {name,ok:false,error:e.shortMessage||e.message||String(e),data:e?.data||e?.error?.data||e?.info?.error?.data||null};}
}

const [redstoneResult,resilientResult,clDecimals,clRound,redCode,resCode]=await Promise.all([
 safe("venusRedStone",()=>redstone.getPrice(WBNB)),
 safe("venusResilient",()=>resilient.getPrice(WBNB)),
 chainlink.decimals(),
 chainlink.latestRoundData(),
 provider.getCode(VENUS_REDSTONE),
 provider.getCode(VENUS_RESILIENT)
]);

const clRaw=BigInt(clRound[1]);
if(clRaw<=0n) throw new Error("Chainlink price <= 0");
const cl18=Number(clDecimals)===18?clRaw:
 Number(clDecimals)<18?clRaw*10n**BigInt(18-Number(clDecimals)):
 clRaw/10n**BigInt(Number(clDecimals)-18);

function enrich(r){
 if(!r.ok) return r;
 const p=BigInt(r.value);
 return {...r,positive:p>0n,deviationBps:p>0n?deviationBps(p,cl18).toString():null,within500Bps:p>0n?deviationBps(p,cl18)<=500n:false};
}

console.log(JSON.stringify({
 status:"VENUS_REDSTONE_READONLY_VALIDATION",
 chainId:97,
 wbnb:WBNB,
 chainlink:{raw:clRaw.toString(),decimals:Number(clDecimals),updatedAt:clRound[3].toString(),normalized18:cl18.toString()},
 venusRedStone:{address:VENUS_REDSTONE,runtimeCode:redCode!=="0x",...enrich(redstoneResult)},
 venusResilient:{address:VENUS_RESILIENT,runtimeCode:resCode!=="0x",...enrich(resilientResult)},
 independentReferenceCandidateReady:redstoneResult.ok&&BigInt(redstoneResult.value)>0n&&deviationBps(BigInt(redstoneResult.value),cl18)<=500n
},null,2));
