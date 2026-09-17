import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";
import { runIntentStage4AuditGate } from "./run-intent-stage4-audit-gate.mjs";

const validDigest = record => record?.auditGateDigest && canonicalDigest(Object.fromEntries(Object.entries(record).filter(([key]) => key !== "auditGateDigest" && key !== "checkedAt"))) === record.auditGateDigest;
export function verifyIntentStage4AuditGate({ root, packageDirectory, auditRecord, gitStatus, gitRevision }) {
  if (auditRecord?.status !== "PASS_STAGE4_AUDIT_GATE" || auditRecord.network?.chainId !== 97 || auditRecord.transactionOccurred !== false || !validDigest(auditRecord)) throw new Error("Invalid Stage-4 audit gate record");
  const rebuilt = runIntentStage4AuditGate({ root, packageDirectory, gitStatus, gitRevision });
  if (canonicalDigest(auditRecord) !== canonicalDigest(rebuilt)) throw new Error("Stage-4 audit gate record does not match current source and evidence");
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE4_AUDIT_GATE_VERIFICATION", status: "VERIFIED_STAGE4_AUDIT_GATE", network: rebuilt.network, sourceRevision: rebuilt.sourceRevision, packageLockDigest: rebuilt.packageLockDigest, completionDigest: rebuilt.completionDigest, packageVerificationDigest: rebuilt.packageVerificationDigest, intentHash: rebuilt.intentHash, quoteHash: rebuilt.quoteHash, executionHash: rebuilt.executionHash, auditGateDigest: rebuilt.auditGateDigest, transactionOccurred: false, safety: "Independent local Stage-4 audit-record verification only. No RPC call, wallet, key, signature, settlement, token movement, or transaction." };
  return { ...body, auditVerificationDigest: canonicalDigest(body) };
}
async function main(){const[auditRecordFile,packageDirectory,outputFile]=process.argv.slice(2);if(!packageDirectory)throw new Error("Usage: node verify-intent-stage4-audit-gate.mjs <audit-gate.json> <completion-package-dir> [output.json]");const root=path.resolve(import.meta.dirname,".."),auditRecord=JSON.parse(fs.readFileSync(path.resolve(auditRecordFile),"utf8")),result=verifyIntentStage4AuditGate({root,packageDirectory:path.resolve(packageDirectory),auditRecord});if(outputFile)fs.writeFileSync(path.resolve(outputFile),`${JSON.stringify(result,null,2)}\n`,{flag:"wx"});else console.log(JSON.stringify(result,null,2));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
