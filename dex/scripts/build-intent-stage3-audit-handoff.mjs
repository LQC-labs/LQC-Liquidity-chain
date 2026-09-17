import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";

function hasDigest(record, field) {
  if (!record?.[field]) return false;
  const body = Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt"));
  return canonicalDigest(body) === record[field];
}

export function buildIntentStage3AuditHandoff({ completion, auditRecord, auditVerification }) {
  if (completion?.status !== "STAGE3_GOVERNANCE_BINDINGS_VERIFIED" || completion.network?.chainId !== 97 || !hasDigest(completion, "completionDigest")) throw new Error("Invalid Stage-3 completion manifest");
  if (auditRecord?.status !== "PASS_STAGE3_AUDIT_GATE" || auditRecord.network?.chainId !== 97 || auditRecord.transactionOccurred !== false || !hasDigest(auditRecord, "auditGateDigest")) throw new Error("Invalid Stage-3 audit gate record");
  if (auditVerification?.status !== "VERIFIED_STAGE3_AUDIT_GATE" || auditVerification.network?.chainId !== 97 || auditVerification.transactionOccurred !== false || !hasDigest(auditVerification, "auditVerificationDigest")) throw new Error("Invalid Stage-3 audit verification");
  if (auditRecord.completionDigest !== completion.completionDigest || auditVerification.completionDigest !== completion.completionDigest || auditVerification.auditGateDigest !== auditRecord.auditGateDigest || auditVerification.sourceRevision !== auditRecord.sourceRevision || auditVerification.packageLockDigest !== auditRecord.packageLockDigest || auditVerification.packageVerificationDigest !== auditRecord.packageVerificationDigest) throw new Error("Stage-3 audit handoff binding mismatch");
  const body = {
    schemaVersion: 1,
    packageType: "LQC_INTENT_STAGE3_AUDIT_HANDOFF",
    status: "READY_FOR_EXTERNAL_AUDIT_HANDOFF",
    network: { name: "BSC Testnet", chainId: 97 },
    sourceRevision: auditRecord.sourceRevision,
    packageLockDigest: auditRecord.packageLockDigest,
    completionDigest: completion.completionDigest,
    packageVerificationDigest: auditRecord.packageVerificationDigest,
    auditGateDigest: auditRecord.auditGateDigest,
    auditVerificationDigest: auditVerification.auditVerificationDigest,
    scope: "Intent Stage 3 Governance bindings and their local evidence chain on BSC Testnet.",
    exclusions: completion.exclusions,
    reviewerChecklist: [
      "Pin and independently fetch the exact sourceRevision.",
      "Recalculate package-lock and every included evidence digest.",
      "Run the Stage-3 completion verifier, audit gate, and audit-gate verifier on a clean worktree.",
      "Review the underlying Safe transactions and canonical final-state block independently.",
      "Do not treat this handoff as approval for cross-chain, permissionless Solver, or mainnet activation.",
    ],
    transactionOccurred: false,
    safety: "Handoff evidence only. It does not claim an external audit or authorize any deployment, signature, approval, or transaction.",
  };
  return { ...body, handoffDigest: canonicalDigest(body) };
}

export function renderIntentStage3AuditHandoffMarkdown(handoff) {
  return `# LQC Intent Stage 3 Audit Handoff\n\nStatus: **${handoff.status}**\n\nHandoff digest: \`${handoff.handoffDigest}\`\n\nSource revision: \`${handoff.sourceRevision}\`\n\n## Reviewer checklist\n\n${handoff.reviewerChecklist.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\n> ${handoff.safety}\n`;
}

export function writeIntentStage3AuditHandoff(outputDirectory, handoff, inputs) {
  const directory = path.resolve(outputDirectory);
  fs.mkdirSync(directory, { recursive: true });
  if (fs.readdirSync(directory).length) throw new Error("Use an empty output directory to preserve immutable audit handoff evidence");
  const contents = {
    "audit-gate.json": `${JSON.stringify(inputs.auditRecord, null, 2)}\n`,
    "audit-verification.json": `${JSON.stringify(inputs.auditVerification, null, 2)}\n`,
    "completion-manifest.json": `${JSON.stringify(inputs.completion, null, 2)}\n`,
    "HANDOFF.md": renderIntentStage3AuditHandoffMarkdown(handoff),
  };
  const manifest = { ...handoff, files: Object.fromEntries(Object.entries(contents).map(([name, content]) => [name, sha256(content)])) };
  manifest.bundleDigest = canonicalDigest(manifest);
  for (const [name, content] of Object.entries(contents)) fs.writeFileSync(path.join(directory, name), content, { flag: "wx" });
  fs.writeFileSync(path.join(directory, "handoff-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return { status: "AUDIT_HANDOFF_WRITTEN", handoffDigest: handoff.handoffDigest, bundleDigest: manifest.bundleDigest, fileCount: 5, outputDirectory: directory };
}

async function main() {
  const [completionFile, auditRecordFile, auditVerificationFile, outputDirectory] = process.argv.slice(2);
  if (!outputDirectory) throw new Error("Usage: node build-intent-stage3-audit-handoff.mjs <completion.json> <audit-gate.json> <audit-verification.json> <empty-output-dir>");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const inputs = { completion: read(completionFile), auditRecord: read(auditRecordFile), auditVerification: read(auditVerificationFile) };
  const handoff = buildIntentStage3AuditHandoff(inputs);
  console.log(JSON.stringify(writeIntentStage3AuditHandoff(outputDirectory, handoff, inputs), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
