import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { buildIntentStage3CompletionPackage, writeIntentStage3CompletionPackage } from "../scripts/build-intent-stage3-completion-package.mjs";
import { runIntentStage3AuditGate } from "../scripts/run-intent-stage3-audit-gate.mjs";

const seal = (body, field) => ({ ...body, [field]: canonicalDigest(body) });
function fixture(root) {
  const governanceSafe = "0x0000000000000000000000000000000000000010";
  const proposals = [1].map(id => ({ id, safeTxHash: `0x${String(id).padStart(64, "0")}` }));
  const plan = seal({ status: "READY_FOR_SEPARATE_EXPLICIT_4_OF_7_APPROVAL", network: { chainId: 97 }, governanceSafe, startingNonce: "10", endingNonce: "10", proposals, transactionOccurred: false }, "proposalPlanDigest");
  const verification = seal({ status: "SAFE_EXECUTIONS_VERIFIED_PENDING_FINAL_STATE", network: { chainId: 97 }, proposalPlanDigest: plan.proposalPlanDigest, transactions: [{ hash: `0x${"11".repeat(32)}`, blockNumber: 500 }], transactionOccurred: true }, "verificationDigest");
  const finalState = seal({ status: "VERIFIED_STAGE3_GOVERNANCE_BINDINGS", network: { chainId: 97 }, proposalPlanDigest: plan.proposalPlanDigest, executionVerificationDigest: verification.verificationDigest, blockNumber: 510, blockHash: `0x${"22".repeat(32)}`, rpcCount: 2, safeNonce: "11", addresses: {}, attesters: [], runtimeDigests: [], transactionOccurred: true }, "finalStateDigest");
  const inputs = { plan, verification, finalState }, completion = buildIntentStage3CompletionPackage(inputs), directory = path.join(root, "completion");
  writeIntentStage3CompletionPackage(directory, completion, inputs);
  return directory;
}

describe("LQC Intent Stage-3 single-command audit gate", function () {
  function workspace() { const root = fs.mkdtempSync(path.join(os.tmpdir(), "lqc-stage3-gate-")); fs.writeFileSync(path.join(root, "package-lock.json"), "{\"lockfileVersion\":3}\n"); return root; }
  it("binds a verified completion package to one clean source revision", function () {
    const root = workspace(), result = runIntentStage3AuditGate({ root, packageDirectory: fixture(root), gitStatus: "", gitRevision: "ab".repeat(20) });
    assert.equal(result.status, "PASS_STAGE3_AUDIT_GATE");
    assert.equal(result.sourceRevision, "ab".repeat(20));
    assert.equal(result.checks.length, 7);
    assert.equal(result.transactionOccurred, false);
    assert.match(result.auditGateDigest, /^sha256:[0-9a-f]{64}$/);
  });
  it("rejects dirty source, invalid revisions and changed evidence", function () {
    let root = workspace(), directory = fixture(root); assert.throws(() => runIntentStage3AuditGate({ root, packageDirectory: directory, gitStatus: " M file", gitRevision: "ab".repeat(20) }), /dirty worktree/);
    root = workspace(); directory = fixture(root); assert.throws(() => runIntentStage3AuditGate({ root, packageDirectory: directory, gitStatus: "", gitRevision: "short" }), /revision/);
    root = workspace(); directory = fixture(root); fs.appendFileSync(path.join(directory, "COMPLETION.md"), "changed\n"); assert.throws(() => runIntentStage3AuditGate({ root, packageDirectory: directory, gitStatus: "", gitRevision: "ab".repeat(20) }), /summary/);
  });
  it("contains no RPC, signing or transaction path", function () {
    const source = fs.readFileSync(new URL("../scripts/run-intent-stage3-audit-gate.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(source, /JsonRpcProvider|eth_sendTransaction|eth_sendRawTransaction|PRIVATE_KEY|signTransaction/);
    assert.match(source, /Local audit gate only/);
  });
});
