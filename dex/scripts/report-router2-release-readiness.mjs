import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { inspectArtifactHashes } from "./run-router2-proof-gateway-gate.mjs";

const readJson=(root,relative)=>JSON.parse(fs.readFileSync(path.join(root,relative),"utf8"));
function findHistoricalAdapterBytecode(value){
  if(!value||typeof value!=="object")return null;
  if(typeof value.bytecode==="string"&&value.bytecode.startsWith("0x")&&value.bytecode.length>100)return value.bytecode;
  for(const child of Object.values(value)){const found=findHistoricalAdapterBytecode(child);if(found)return found;}
  return null;
}
export function inspectV3Adapter(root){
  const artifact=readJson(root,"artifacts/contracts/router-v2/adapters/PancakeV3ExecutionAdapter.sol/PancakeV3ExecutionAdapter.json");
  const deployment=readJson(root,"deployments/router2-quote-stack-config-bsc-testnet-97.json");
  const historicalBytecode=findHistoricalAdapterBytecode(deployment);
  if(!historicalBytecode)throw new Error("Historical V3 adapter deployment bytecode is missing");
  const candidate=ethers.keccak256(artifact.bytecode),deployed=ethers.keccak256(historicalBytecode),redeployRequired=candidate!==deployed;
  return{status:redeployRequired?"redeploy_required":"match",releaseReady:!redeployRequired,candidate,deployed};
}
export function buildReleaseReadiness(root=path.resolve(import.meta.dirname,"..")){
  const proofGateway=inspectArtifactHashes(root),v3Adapter=inspectV3Adapter(root);
  const blockers=[];
  if(proofGateway.redeployRequired)blockers.push({component:"proof_gateway",reason:"candidate_differs_from_historical_deployment",drift:proofGateway.drift});
  if(v3Adapter.status==="redeploy_required")blockers.push({component:"pancake_v3_adapter",reason:"candidate_differs_from_historical_deployment",candidate:v3Adapter.candidate,deployed:v3Adapter.deployed});
  return{schemaVersion:1,scope:"offline-only",network:"BSC Testnet",chainId:97,releaseReady:blockers.length===0,status:blockers.length?"blocked_redeployment_required":"ready",deploymentOccurred:false,transactionOccurred:false,components:{proofGateway:{releaseReady:!proofGateway.redeployRequired,redeployRequired:proofGateway.redeployRequired,drift:proofGateway.drift,candidate:proofGateway.candidate,deployed:proofGateway.deployed},v3Adapter},blockers,safety:"Read-only local artifact comparison. No wallet, signature, transaction, approval, token movement, or swap."};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(buildReleaseReadiness(),null,2));
