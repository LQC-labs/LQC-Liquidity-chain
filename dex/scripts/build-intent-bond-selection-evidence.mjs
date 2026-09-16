import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const GOVERNANCE_SAFE="0x5235e26EE4D511aE8ba1FB1cff2619Fc1D90C02A";
const sha=value=>`sha256:${crypto.createHash("sha256").update(typeof value==="string"?value:JSON.stringify(value)).digest("hex")}`;
const same=(a,b)=>ethers.getAddress(a)===ethers.getAddress(b);

export function buildBondSelectionEvidence({inspection,deployPlan,approvalPlan,preflight}){
  if(deployPlan?.stage!=="stage0-selection-recorder-deploy"||approvalPlan?.stage!=="stage0-governance-bond-approval"||preflight?.status!=="PREFLIGHT_VERIFIED")throw new Error("Incomplete Stage-0 Bond evidence sequence");
  const values=[deployPlan,approvalPlan,preflight];
  if(values.some(value=>value.network?.chainId!==97&&value.chainId!==97))throw new Error("Bond evidence must target BSC testnet chain ID 97");
  const inspectionDigest=canonicalDigest(inspection);
  if(values.some(value=>value.inspectionDigest!==inspectionDigest))throw new Error("Bond inspection digest mismatch");
  if(!same(deployPlan.governanceSafe,GOVERNANCE_SAFE)||!same(approvalPlan.governanceSafe,GOVERNANCE_SAFE)||!same(preflight.governanceSafe,GOVERNANCE_SAFE))throw new Error("Governance Safe mismatch");
  if(!same(deployPlan.bondToken,approvalPlan.bondToken)||!same(approvalPlan.bondToken,preflight.bondToken))throw new Error("Bond token changed across Stage-0 evidence");
  if(!same(approvalPlan.selectionContract,preflight.selectionContract)||approvalPlan.safeTransactionHash.toLowerCase()!==preflight.safeTransactionHash.toLowerCase()||String(approvalPlan.safeTransaction.nonce)!==String(preflight.safeNonce))throw new Error("Approval plan and preflight are not bound");
  if(deployPlan.transactionOccurred!==false||approvalPlan.transactionOccurred!==false||preflight.transactionOccurred!==false||preflight.rpcCount<2)throw new Error("Evidence is not a read-only multi-RPC preflight");
  const evidence={inspectionDigest,inspection:sha(inspection),deployPlan:sha(deployPlan),approvalPlan:sha(approvalPlan),preflight:sha(preflight)};
  const core={schemaVersion:1,bundleType:"LQC_INTENT_BOND_SELECTION_STAGE0_EVIDENCE",network:{name:"BSC Testnet",chainId:97},governanceSafe:GOVERNANCE_SAFE,bondToken:ethers.getAddress(approvalPlan.bondToken),selectionContract:ethers.getAddress(approvalPlan.selectionContract),safeNonce:String(preflight.safeNonce),safeTransactionHash:preflight.safeTransactionHash,canonicalBlock:{number:preflight.blockNumber,hash:preflight.blockHash},rpcCount:preflight.rpcCount,evidence,orderedRunbook:["Inspect candidate token across independent RPC, DEX and Oracle sources.","Generate the unsigned LQCBondSelection deployment plan.","Deploy only after separate deployment approval and record the resulting address.","Read the latest Governance Safe nonce and generate the unsigned approval plan.","Run the multi-RPC preflight immediately before Safe signing.","Collect the required 4-of-7 Governance Safe signatures; do not expose signer keys.","After execution, verify the canonical receipt and on-chain selection before building the Stage 1 seal."],safety:"Evidence packaging only. This bundle does not sign, deploy, approve, transfer tokens, or send a transaction."};
  return{...core,bundleDigest:sha(core)};
}

export function writeBondSelectionEvidence(outputDirectory,bundle,inputs){
  fs.mkdirSync(outputDirectory,{recursive:true});
  if(fs.readdirSync(outputDirectory).length)throw new Error("Use an empty output directory to preserve immutable evidence");
  const files={"manifest.json":bundle,"candidate-inspection.json":inputs.inspection,"selection-deploy-plan.json":inputs.deployPlan,"governance-approval-plan.json":inputs.approvalPlan,"multi-rpc-preflight.json":inputs.preflight};
  for(const[name,value]of Object.entries(files))fs.writeFileSync(path.join(outputDirectory,name),`${JSON.stringify(value,null,2)}\n`);
  fs.writeFileSync(path.join(outputDirectory,"RUNBOOK.md"),`# LQC Intent Bond Selection Stage 0\n\nBundle: \`${bundle.bundleDigest}\`\n\n${bundle.orderedRunbook.map((step,index)=>`${index+1}. ${step}`).join("\n")}\n\n> ${bundle.safety}\n`);
  return{status:"EVIDENCE_WRITTEN",outputDirectory,bundleDigest:bundle.bundleDigest,fileCount:6};
}

async function main(){
  const[inspectionPath,deployPath,approvalPath,preflightPath,outputDirectory]=process.argv.slice(2);
  if(!outputDirectory)throw new Error("Usage: node build-intent-bond-selection-evidence.mjs <inspection.json> <deploy-plan.json> <approval-plan.json> <preflight.json> <empty-output-dir>");
  const read=file=>JSON.parse(fs.readFileSync(path.resolve(file),"utf8")),inputs={inspection:read(inspectionPath),deployPlan:read(deployPath),approvalPlan:read(approvalPath),preflight:read(preflightPath)};
  console.log(JSON.stringify(writeBondSelectionEvidence(path.resolve(outputDirectory),buildBondSelectionEvidence(inputs),inputs),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
