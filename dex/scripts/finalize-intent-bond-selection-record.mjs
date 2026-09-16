import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const GOVERNANCE_SAFE="0x5235e26EE4D511aE8ba1FB1cff2619Fc1D90C02A";
const same=(a,b)=>ethers.getAddress(a)===ethers.getAddress(b);

export function buildBondSelectionRecord({inspection,approvalPlan,preflight,transactionHash}){
  if(approvalPlan?.stage!=="stage0-governance-bond-approval"||approvalPlan.network?.chainId!==97||approvalPlan.transactionOccurred!==false||preflight?.status!=="PREFLIGHT_VERIFIED"||preflight.chainId!==97||preflight.transactionOccurred!==false||preflight.rpcCount<2)throw new Error("Invalid Stage-0 approval evidence");
  if(!ethers.isHexString(transactionHash,32))throw new Error("A valid submitted transaction hash is required");
  const inspectionDigest=canonicalDigest(inspection);
  if(approvalPlan.inspectionDigest!==inspectionDigest||preflight.inspectionDigest!==inspectionDigest)throw new Error("Bond inspection digest mismatch");
  if(!same(approvalPlan.governanceSafe,GOVERNANCE_SAFE)||!same(preflight.governanceSafe,GOVERNANCE_SAFE)||!same(approvalPlan.bondToken,preflight.bondToken)||!same(approvalPlan.selectionContract,preflight.selectionContract))throw new Error("Bond approval identity mismatch");
  if(approvalPlan.safeTransactionHash.toLowerCase()!==preflight.safeTransactionHash.toLowerCase()||String(approvalPlan.safeTransaction?.nonce)!==String(preflight.safeNonce))throw new Error("Bond approval Safe transaction mismatch");
  const eligible=(inspection?.results||[]).filter(value=>value.token?.toLowerCase()===approvalPlan.bondToken.toLowerCase()&&value.assessment?.eligible===true&&value.decimals===18&&value.network?.chainId===97);
  if(eligible.length!==1)throw new Error("Bond token is not uniquely eligible");
  return{schemaVersion:1,status:"PENDING_MULTI_RPC_VERIFICATION",network:{name:"BSC Testnet",chainId:97},governanceSafe:GOVERNANCE_SAFE,selectionContract:ethers.getAddress(approvalPlan.selectionContract),approvedBondToken:ethers.getAddress(approvalPlan.bondToken),inspectionDigest,inspectionDigestBytes32:`0x${inspectionDigest.slice(7)}`,approvalTransaction:transactionHash.toLowerCase(),safeTransactionHash:approvalPlan.safeTransactionHash.toLowerCase(),safeNonce:String(preflight.safeNonce),preflightBlock:{number:preflight.blockNumber,hash:preflight.blockHash},preflightRpcCount:preflight.rpcCount,transactionOccurred:true,verificationRequired:true,safety:"A submitted transaction reference only. Governance approval is not accepted until verify-intent-bond-selection.mjs returns VERIFIED with finality across 2+ RPCs."};
}

async function main(){
  const inspectionFile=process.env.INTENT_BOND_INSPECTION_FILE,planFile=process.env.INTENT_BOND_SELECTION_PLAN_FILE,preflightFile=process.env.INTENT_BOND_SELECTION_PREFLIGHT_FILE,transactionHash=process.env.INTENT_BOND_SELECTION_TX;
  if(!inspectionFile||!planFile||!preflightFile||!transactionHash)throw new Error("Set INTENT_BOND_INSPECTION_FILE, INTENT_BOND_SELECTION_PLAN_FILE, INTENT_BOND_SELECTION_PREFLIGHT_FILE and INTENT_BOND_SELECTION_TX");
  const read=file=>JSON.parse(fs.readFileSync(path.resolve(file),"utf8")),record=buildBondSelectionRecord({inspection:read(inspectionFile),approvalPlan:read(planFile),preflight:read(preflightFile),transactionHash}),output=path.resolve(import.meta.dirname,"../deployments/intent-bond-selection-record-bsc-testnet-97.json");
  fs.writeFileSync(output,`${JSON.stringify(record,null,2)}\n`);console.log(`Wrote ${output}`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
