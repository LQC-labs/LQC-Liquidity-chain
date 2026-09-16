import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { buildIntentStage3CompletionPackage, writeIntentStage3CompletionPackage } from "../scripts/build-intent-stage3-completion-package.mjs";
import { runIntentStage3AuditGate } from "../scripts/run-intent-stage3-audit-gate.mjs";
import { verifyIntentStage3AuditGate } from "../scripts/verify-intent-stage3-audit-gate.mjs";

const seal = (body, field) => ({ ...body, [field]: canonicalDigest(body) });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lqc-stage3-audit-verify-"));
  fs.writeFileSync(path.join(root, "package-lock.json"), "{\"lockfileVersion\":3}\n");
  const governanceSafe = "0x0000000000000000000000000000000000000010", proposals = [{ id: 1, safeTxHash: `0x${"01".repeat(32)}` }];
  const plan = seal({ status: "READY_FOR_SEPARATE_EXPLICIT_4_OF_7_APPROVAL", network: { chainId: 97 }, governanceSafe, startingNonce: "2", endingNonce: "2", proposals, transactionOccurred: false }, "proposalPlanDigest");
  const verification = seal({ status: "SAFE_EXECUTIONS_VERIFIED_PENDING_FINAL_STATE", network: { chainId: 97 }, proposalPlanDigest: plan.proposalPlanDigest, transactions: [{ hash: `0x${"02".repeat(32)}`, blockNumber: 600 }], transactionOccurred: true }, "verificationDigest");
  const finalState = seal({ status: "VERIFIED_STAGE3_GOVERNANCE_BINDINGS", network: { chainId: 97 }, proposalPlanDigest: plan.proposalPlanDigest, executionVerificationDigest: verification.verificationDigest, blockNumber: 610, blockHash: `0x${"03".repeat(32)}`, rpcCount: 2, safeNonce: "3", addresses: {}, attesters: [], runtimeDigests: [], transactionOccurred: true }, "finalStateDigest");
  const inputs = { plan, verification, finalState }, packageDirectory = path.join(root, "completion");
  writeIntentStage3CompletionPackage(packageDirectory, buildIntentStage3CompletionPackage(inputs), inputs);
  const gitRevision = "cd".repeat(20), auditRecord = runIntentStage3AuditGate({ root, packageDirectory, gitStatus: "", gitRevision });
  return { root, packageDirectory, gitRevision, auditRecord };
}

describe("LQC Intent Stage-3 audit gate independent verification", function () {
  it("rebuilds the gate from current source and evidence", function () {
    const input = fixture(), result = verifyIntentStage3AuditGate({ ...input, gitStatus: "" });
    assert.equal(result.status, "VERIFIED_STAGE3_AUDIT_GATE");
    assert.equal(result.auditGateDigest, input.auditRecord.auditGateDigest);
    assert.equal(result.transactionOccurred, false);
    assert.match(result.auditVerificationDigest, /^sha256:[0-9a-f]{64}$/);
  });
  it("rejects record, source, lockfile and package substitution", function () {
    let input = fixture(); input.auditRecord.sourceRevision = "ef".repeat(20); assert.throws(() => verifyIntentStage3AuditGate({ ...input, gitStatus: "" }), /Invalid/);
    input = fixture(); assert.throws(() => verifyIntentStage3AuditGate({ ...input, gitStatus: "", gitRevision: "ef".repeat(20) }), /does not match/);
    input = fixture(); fs.writeFileSync(path.join(input.root, "package-lock.json"), "{}\n"); assert.throws(() => verifyIntentStage3AuditGate({ ...input, gitStatus: "" }), /does not match/);
    input = fixture(); fs.appendFileSync(path.join(input.packageDirectory, "COMPLETION.md"), "substituted\n"); assert.throws(() => verifyIntentStage3AuditGate({ ...input, gitStatus: "" }), /summary/);
  });
  it("contains no network, signing or transaction path", function () {
    const source = fs.readFileSync(new URL("../scripts/verify-intent-stage3-audit-gate.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(source, /JsonRpcProvider|fetch\(|eth_sendTransaction|PRIVATE_KEY|signTransaction/);
    assert.match(source, /Independent local audit-record verification only/);
  });
});
