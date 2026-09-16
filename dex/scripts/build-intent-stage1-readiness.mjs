import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalDigest,validateBondSelection,validateSelectionVerification } from "./build-intent-reproducibility-seal.mjs";

export function buildIntentStage1Readiness({selection,inspection,verification}){
  if(selection?.status!=="PENDING_MULTI_RPC_VERIFICATION"||selection.verificationRequired!==true||selection.transactionOccurred!==true)throw new Error("Canonical pending Bond selection record is required");
  const bond=validateBondSelection(selection,inspection),verified=validateSelectionVerification(verification,selection);
  const body={schemaVersion:1,status:"READY_FOR_REPRODUCIBILITY_SEAL",network:{name:"BSC Testnet",chainId:97},bondToken:bond.token,selectionContract:verified.selectionContract,approvalTransaction:bond.approvalTransaction,safeTransactionHash:verified.safeTransactionHash,safeNonce:verified.nonce,inspectionDigest:bond.inspectionDigest,verificationDigest:verified.verificationDigest,rpcCount:verified.rpcCount,confirmations:verified.confirmations,nextAction:"Build the Stage 1 reproducibility seal from a clean, exact source revision.",transactionOccurred:false,safety:"Read-only readiness decision. This result does not deploy Stage 1 contracts or submit a transaction."};
  return{...body,readinessDigest:canonicalDigest(body)};
}

async function main(){
  const selectionFile=process.env.INTENT_BOND_SELECTION_FILE,inspectionFile=process.env.INTENT_BOND_INSPECTION_FILE,verificationFile=process.env.INTENT_BOND_SELECTION_VERIFICATION_FILE;
  if(!selectionFile||!inspectionFile||!verificationFile)throw new Error("Set INTENT_BOND_SELECTION_FILE, INTENT_BOND_INSPECTION_FILE and INTENT_BOND_SELECTION_VERIFICATION_FILE");
  const read=file=>JSON.parse(fs.readFileSync(path.resolve(file),"utf8")),readiness=buildIntentStage1Readiness({selection:read(selectionFile),inspection:read(inspectionFile),verification:read(verificationFile)}),output=path.resolve(import.meta.dirname,"../deployments/intent-stage1-readiness-bsc-testnet-97.json");
  fs.writeFileSync(output,`${JSON.stringify(readiness,null,2)}\n`);console.log(`Wrote ${output}`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
