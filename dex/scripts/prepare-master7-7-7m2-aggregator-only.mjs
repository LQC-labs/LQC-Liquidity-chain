import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const CHAIN_ID = 97n;
const root = path.resolve(import.meta.dirname, "..");
const artifact = JSON.parse(fs.readFileSync(path.join(root,"artifacts/contracts/futures/LQCAggregatorOracleAdapter.sol/LQCAggregatorOracleAdapter.json"),"utf8"));

export function validateAggregatorOnlyEnv(env){
  const owner=ethers.getAddress(env.FUTURES_OWNER_ADDRESS);
  const deployer=ethers.getAddress(env.FUTURES_DEPLOYER_ADDRESS);
  if(owner===ethers.ZeroAddress||deployer===ethers.ZeroAddress) throw new Error("Owner/deployer cannot be zero.");
  if(owner===deployer) throw new Error("Governance owner and deployer must remain separated.");
  return {owner,deployer};
}

export async function prepareAggregatorOnlyDeployment(env,provider=new ethers.JsonRpcProvider(env.BSC_TESTNET_RPC_URL)){
  const {owner,deployer}=validateAggregatorOnlyEnv(env);
  if((await provider.getNetwork()).chainId!==CHAIN_ID) throw new Error("Expected BSC Testnet chain 97.");
  const factory=new ethers.ContractFactory(artifact.abi,artifact.bytecode);
  const tx=await factory.getDeployTransaction(owner);
  const gas=await provider.estimateGas({from:deployer,data:tx.data,value:0n});
  return {
    schema:"lqc-master7-7-7m2-aggregator-only-v1",
    status:"READY_FOR_SEPARATELY_AUTHORIZED_AGGREGATOR_DEPLOYMENT",
    chainId:97,
    transactionAuthorized:false,
    deployer,
    owner,
    contract:"LQCAggregatorOracleAdapter",
    constructorArgs:[owner],
    value:"0",
    estimatedGas:gas.toString(),
    data:tx.data,
    preservedDeployments:{
      registry:"0xfbd1c5c8dbbdadf3eb834f351366daf55f2d73b0",
      vault:"0xb532c65294a7b35ca510a7df025e934fa17c8d7e",
      engine:"0xe4f1320c8709631776c7e39e0916584935882525",
      twapReference:"0x5ae96e36356ac18728804577e926b4b362017c0d"
    },
    governanceActionsDeferred:true,
    marketActivationAuthorized:false
  };
}

if(import.meta.url===new URL("file://"+process.argv[1]).href){
  prepareAggregatorOnlyDeployment(process.env).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error("FINAL FAIL:",e.message);process.exitCode=1;});
}
