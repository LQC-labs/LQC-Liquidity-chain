import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const root=path.resolve(import.meta.dirname,"..");
const RPC=process.env.BSC_TESTNET_RPC_URL||"https://data-seed-prebsc-1-s1.bnbchain.org:8545";
const PYTH_CORE="0x5744Cbf430D99456a0A8771208b674F27f8EF0Fb";

const provider=new ethers.JsonRpcProvider(RPC);
const network=await provider.getNetwork();
if(network.chainId!==97n) throw new Error("Expected BSC Testnet chainId 97.");

const [code,latest]=await Promise.all([provider.getCode(PYTH_CORE),provider.getBlock("latest")]);
if(code==="0x") throw new Error("Pyth Core has no runtime code.");
if(!latest) throw new Error("Latest block unavailable.");

const artifactPath=path.join(root,"artifacts","contracts/futures/LQCPythUpdateHelper.sol","LQCPythUpdateHelper.json");
if(!fs.existsSync(artifactPath)) throw new Error("Missing helper artifact.");
const artifact=JSON.parse(fs.readFileSync(artifactPath,"utf8"));
const factory=new ethers.ContractFactory(artifact.abi,artifact.bytecode);
const tx=await factory.getDeployTransaction(PYTH_CORE);
if(!tx.data||tx.data==="0x") throw new Error("Helper deployment initcode missing.");

const pyth=new ethers.Contract(PYTH_CORE,[
 "function getUpdateFee(bytes[] updateData) view returns(uint256)"
],provider);

let emptyFeeProbe={ok:false};
try{
  const fee=await pyth.getUpdateFee([]);
  emptyFeeProbe={ok:true,fee:fee.toString()};
}catch(e){
  emptyFeeProbe={ok:false,error:e.shortMessage||e.message||String(e)};
}

console.log(JSON.stringify({
 status:"PYTH_UPDATE_HELPER_DEPLOYMENT_PREFLIGHT_PASS",
 chainId:97,
 blockNumber:latest.number,
 transactionOccurred:false,
 walletSignatureRequiredNow:false,
 deploymentAuthorized:false,
 activationAuthorized:false,
 pythCore:PYTH_CORE,
 runtimeCode:true,
 initCodeBytes:(tx.data.length-2)/2,
 initCodeHash:ethers.keccak256(tx.data),
 emptyUpdateFeeProbe:emptyFeeProbe,
 blockers:[
   "PYTH_API_KEY must be configured",
   "fresh Hermes BNB/USD validation must PASS",
   "live updatePriceFeeds path must be verified before relying on keeper operation"
 ]
},null,2));
