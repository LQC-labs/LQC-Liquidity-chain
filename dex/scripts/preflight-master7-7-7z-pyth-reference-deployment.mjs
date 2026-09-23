import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const root=path.resolve(import.meta.dirname,"..");
const RPC=process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545";

const PYTH_CORE="0x5744Cbf430D99456a0A8771208b674F27f8EF0Fb";
const PRICE_ID="0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f";
const PRIMARY="0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526";
const MAX_AGE=120;
const MAX_CONFIDENCE_BPS=500;
const CIRCUIT_BREAKER_BPS=500;

const provider=new ethers.JsonRpcProvider(RPC);
const network=await provider.getNetwork();
if(network.chainId!==97n) throw new Error("Expected BSC Testnet chainId 97.");

const [pythCode,primaryCode,latest]=await Promise.all([
 provider.getCode(PYTH_CORE),
 provider.getCode(PRIMARY),
 provider.getBlock("latest")
]);
if(pythCode==="0x") throw new Error("Pyth Core has no runtime code.");
if(primaryCode==="0x") throw new Error("Chainlink primary has no runtime code.");
if(!latest) throw new Error("Latest block unavailable.");

const primary=new ethers.Contract(PRIMARY,[
 "function decimals() view returns(uint8)",
 "function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"
],provider);
const pyth=new ethers.Contract(PYTH_CORE,[
 "function getPriceUnsafe(bytes32 id) view returns(tuple(int64 price,uint64 conf,int32 expo,uint256 publishTime))"
],provider);

const [decimals,round,unsafe]=await Promise.all([
 primary.decimals(),
 primary.latestRoundData(),
 pyth.getPriceUnsafe(PRICE_ID)
]);
const [roundId,answer,,updatedAt,answeredInRound]=round;
if(answer<=0n) throw new Error("Primary feed answer not positive.");
if(updatedAt===0n||updatedAt>BigInt(latest.timestamp)) throw new Error("Primary timestamp invalid.");
if(answeredInRound<roundId) throw new Error("Primary round incomplete.");

const artifactPath=path.join(root,"artifacts","contracts/futures/LQCPythReferenceAdapter.sol","LQCPythReferenceAdapter.json");
if(!fs.existsSync(artifactPath)) throw new Error("Missing current Pyth adapter artifact.");
const artifact=JSON.parse(fs.readFileSync(artifactPath,"utf8"));
if(artifact.contractName!=="LQCPythReferenceAdapter"||!String(artifact.bytecode).startsWith("0x")||artifact.bytecode==="0x"){
 throw new Error("Invalid current Pyth adapter artifact.");
}

const factory=new ethers.ContractFactory(artifact.abi,artifact.bytecode);
const deployTx=await factory.getDeployTransaction(PYTH_CORE,PRICE_ID,MAX_AGE,MAX_CONFIDENCE_BPS);
if(!deployTx.data||deployTx.data==="0x") throw new Error("Deployment initcode missing.");

const primary18=Number(decimals)===18?answer:
 Number(decimals)<18?answer*10n**BigInt(18-Number(decimals)):
 answer/10n**BigInt(Number(decimals)-18);

const now=BigInt(latest.timestamp);
const unsafeAge=unsafe.publishTime>0n&&now>unsafe.publishTime?now-unsafe.publishTime:0n;

console.log(JSON.stringify({
 status:"PYTH_REFERENCE_DEPLOYMENT_PREFLIGHT_PASS",
 chainId:97,
 blockNumber:latest.number,
 transactionOccurred:false,
 walletSignatureRequiredNow:false,
 deploymentAuthorized:false,
 activationAuthorized:false,
 artifact:{
  contractName:artifact.contractName,
  sourceName:artifact.sourceName,
  initCodeBytes:(deployTx.data.length-2)/2,
  initCodeHash:ethers.keccak256(deployTx.data)
 },
 constructorArgs:{
  pythCore:PYTH_CORE,
  priceId:PRICE_ID,
  maxAgeSeconds:MAX_AGE,
  maxConfidenceBps:MAX_CONFIDENCE_BPS
 },
 primary:{
  address:PRIMARY,
  decimals:Number(decimals),
  normalized18:primary18.toString(),
  updatedAt:updatedAt.toString()
 },
 pythUnsafeObservation:{
  price:unsafe.price.toString(),
  conf:unsafe.conf.toString(),
  expo:Number(unsafe.expo),
  publishTime:unsafe.publishTime.toString(),
  ageSeconds:unsafeAge.toString()
 },
 targetCircuitBreakerBps:CIRCUIT_BREAKER_BPS,
 blockers:[
  "PYTH_API_KEY must be configured",
  "fresh Hermes BNB/USD validation must PASS",
  "fresh Pyth on-chain update path must be verified",
  "Governance must approve reference replacement"
 ]
},null,2));