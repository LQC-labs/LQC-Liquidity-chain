import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";
import { buildIntentStage3AuditHandoff, renderIntentStage3AuditHandoffMarkdown } from "./build-intent-stage3-audit-handoff.mjs";

const REQUIRED_FILES = ["HANDOFF.md", "audit-gate.json", "audit-verification.json", "completion-manifest.json", "handoff-manifest.json"];
const EVIDENCE_FILES = REQUIRED_FILES.filter(name => name !== "handoff-manifest.json");

export function verifyIntentStage3AuditHandoff(directoryPath) {
  const directory = path.resolve(directoryPath), files = fs.readdirSync(directory).sort();
  if (canonicalDigest(files) !== canonicalDigest(REQUIRED_FILES)) throw new Error("Stage-3 audit handoff file set mismatch");
  const text = name => fs.readFileSync(path.join(directory, name), "utf8"), json = name => JSON.parse(text(name));
  const inputs = { completion: json("completion-manifest.json"), auditRecord: json("audit-gate.json"), auditVerification: json("audit-verification.json") };
  const rebuilt = buildIntentStage3AuditHandoff(inputs), manifest = json("handoff-manifest.json");
  const manifestBody = Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== "bundleDigest"));
  if (canonicalDigest(manifestBody) !== manifest.bundleDigest) throw new Error("Stage-3 audit handoff bundle digest mismatch");
  const expectedFiles = Object.fromEntries(EVIDENCE_FILES.map(name => [name, sha256(text(name))]));
  if (canonicalDigest(manifest.files) !== canonicalDigest(expectedFiles)) throw new Error("Stage-3 audit handoff file digest mismatch");
  const expectedManifestBody = { ...rebuilt, files: expectedFiles };
  if (canonicalDigest(manifestBody) !== canonicalDigest(expectedManifestBody)) throw new Error("Stage-3 audit handoff manifest mismatch");
  if (text("HANDOFF.md") !== renderIntentStage3AuditHandoffMarkdown(rebuilt)) throw new Error("Stage-3 audit handoff summary mismatch");
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE3_AUDIT_HANDOFF_VERIFICATION", status: "VERIFIED_STAGE3_AUDIT_HANDOFF", network: rebuilt.network, sourceRevision: rebuilt.sourceRevision, handoffDigest: rebuilt.handoffDigest, bundleDigest: manifest.bundleDigest, evidenceFileDigests: expectedFiles, transactionOccurred: false, safety: "Offline handoff verification only. No RPC, wallet, signature, approval, deployment, token movement, or transaction." };
  return { ...body, handoffVerificationDigest: canonicalDigest(body) };
}

async function main() {
  const [directory, outputFile] = process.argv.slice(2);
  if (!directory) throw new Error("Usage: node verify-intent-stage3-audit-handoff.mjs <handoff-dir> [output.json]");
  const result = verifyIntentStage3AuditHandoff(directory);
  if (outputFile) fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  else console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
