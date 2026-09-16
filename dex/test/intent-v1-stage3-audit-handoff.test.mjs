import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { buildIntentStage3AuditHandoff, writeIntentStage3AuditHandoff } from "../scripts/build-intent-stage3-audit-handoff.mjs";

const seal = (body, field) => ({ ...body, [field]: canonicalDigest(body) });
function fixture() {
  const completion = seal({ status: "STAGE3_GOVERNANCE_BINDINGS_VERIFIED", network: { chainId: 97 }, exclusions: ["Mainnet activation"], transactionOccurred: true }, "completionDigest");
  const auditRecord = seal({ status: "PASS_STAGE3_AUDIT_GATE", network: { chainId: 97 }, sourceRevision: "ab".repeat(20), packageLockDigest: "sha256:lock", completionDigest: completion.completionDigest, packageVerificationDigest: "sha256:package", transactionOccurred: false }, "auditGateDigest");
  const auditVerification = seal({ status: "VERIFIED_STAGE3_AUDIT_GATE", network: { chainId: 97 }, sourceRevision: auditRecord.sourceRevision, packageLockDigest: auditRecord.packageLockDigest, completionDigest: completion.completionDigest, packageVerificationDigest: auditRecord.packageVerificationDigest, auditGateDigest: auditRecord.auditGateDigest, transactionOccurred: false }, "auditVerificationDigest");
  return { completion, auditRecord, auditVerification };
}

describe("LQC Intent Stage-3 external audit handoff", function () {
  it("binds completion, gate and independent verification", function () {
    const handoff = buildIntentStage3AuditHandoff(fixture());
    assert.equal(handoff.status, "READY_FOR_EXTERNAL_AUDIT_HANDOFF");
    assert.equal(handoff.reviewerChecklist.length, 5);
    assert.equal(handoff.transactionOccurred, false);
    assert.match(handoff.handoffDigest, /^sha256:[0-9a-f]{64}$/);
  });
  it("rejects tampered or cross-bound evidence", function () {
    let inputs = fixture(); inputs.auditRecord.sourceRevision = "cd".repeat(20); assert.throws(() => buildIntentStage3AuditHandoff(inputs), /audit gate/);
    inputs = fixture(); inputs.auditVerification.completionDigest = "sha256:other"; inputs.auditVerification.auditVerificationDigest = canonicalDigest(Object.fromEntries(Object.entries(inputs.auditVerification).filter(([key]) => key !== "auditVerificationDigest"))); assert.throws(() => buildIntentStage3AuditHandoff(inputs), /binding/);
  });
  it("writes five immutable handoff files with a bundle digest", function () {
    const inputs = fixture(), handoff = buildIntentStage3AuditHandoff(inputs), directory = fs.mkdtempSync(path.join(os.tmpdir(), "lqc-stage3-handoff-"));
    const result = writeIntentStage3AuditHandoff(directory, handoff, inputs);
    assert.equal(result.fileCount, 5);
    assert.equal(fs.readdirSync(directory).length, 5);
    assert.match(result.bundleDigest, /^sha256:[0-9a-f]{64}$/);
    assert.throws(() => writeIntentStage3AuditHandoff(directory, handoff, inputs), /empty output/);
  });
});
