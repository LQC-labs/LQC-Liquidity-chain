import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { buildIntentStage3AuditHandoff, writeIntentStage3AuditHandoff } from "../scripts/build-intent-stage3-audit-handoff.mjs";
import { verifyIntentStage3AuditHandoff } from "../scripts/verify-intent-stage3-audit-handoff.mjs";

const seal = (body, field) => ({ ...body, [field]: canonicalDigest(body) });
function handoffDirectory() {
  const completion = seal({ status: "STAGE3_GOVERNANCE_BINDINGS_VERIFIED", network: { chainId: 97 }, exclusions: ["Mainnet activation"], transactionOccurred: true }, "completionDigest");
  const auditRecord = seal({ status: "PASS_STAGE3_AUDIT_GATE", network: { chainId: 97 }, sourceRevision: "ab".repeat(20), packageLockDigest: "sha256:lock", completionDigest: completion.completionDigest, packageVerificationDigest: "sha256:package", transactionOccurred: false }, "auditGateDigest");
  const auditVerification = seal({ status: "VERIFIED_STAGE3_AUDIT_GATE", network: { chainId: 97 }, sourceRevision: auditRecord.sourceRevision, packageLockDigest: auditRecord.packageLockDigest, completionDigest: completion.completionDigest, packageVerificationDigest: auditRecord.packageVerificationDigest, auditGateDigest: auditRecord.auditGateDigest, transactionOccurred: false }, "auditVerificationDigest");
  const inputs = { completion, auditRecord, auditVerification }, handoff = buildIntentStage3AuditHandoff(inputs), directory = fs.mkdtempSync(path.join(os.tmpdir(), "lqc-stage3-handoff-verify-"));
  writeIntentStage3AuditHandoff(directory, handoff, inputs); return directory;
}

describe("LQC Intent Stage-3 audit handoff verification", function () {
  it("rebuilds and verifies the exact five-file handoff", function () {
    const result = verifyIntentStage3AuditHandoff(handoffDirectory());
    assert.equal(result.status, "VERIFIED_STAGE3_AUDIT_HANDOFF");
    assert.equal(Object.keys(result.evidenceFileDigests).length, 4);
    assert.equal(result.transactionOccurred, false);
    assert.match(result.handoffVerificationDigest, /^sha256:[0-9a-f]{64}$/);
  });
  it("rejects missing, added, changed, or rehashed evidence", function () {
    let directory = handoffDirectory(); fs.unlinkSync(path.join(directory, "HANDOFF.md")); assert.throws(() => verifyIntentStage3AuditHandoff(directory), /file set/);
    directory = handoffDirectory(); fs.writeFileSync(path.join(directory, "extra.json"), "{}\n"); assert.throws(() => verifyIntentStage3AuditHandoff(directory), /file set/);
    directory = handoffDirectory(); fs.appendFileSync(path.join(directory, "HANDOFF.md"), "changed\n"); assert.throws(() => verifyIntentStage3AuditHandoff(directory), /file digest/);
    directory = handoffDirectory(); const file = path.join(directory, "handoff-manifest.json"), manifest = JSON.parse(fs.readFileSync(file)); manifest.status = "FORGED"; manifest.bundleDigest = canonicalDigest(Object.fromEntries(Object.entries(manifest).filter(([key]) => key !== "bundleDigest"))); fs.writeFileSync(file, JSON.stringify(manifest)); assert.throws(() => verifyIntentStage3AuditHandoff(directory), /manifest/);
  });
});
