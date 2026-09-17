import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { buildIntentStage3CompletionPackage, writeIntentStage3CompletionPackage } from "../scripts/build-intent-stage3-completion-package.mjs";

const digest = (body, field) => ({ ...body, [field]: canonicalDigest(body) });

describe("LQC Intent Stage-3 completion evidence package", function () {
  const safe = "0x0000000000000000000000000000000000000010";
  function fixture() {
    const proposals = [1, 2].map(id => ({ id, safeTxHash: `0x${String(id).padStart(64, "0")}` }));
    const plan = digest({ status: "READY_FOR_SEPARATE_EXPLICIT_4_OF_7_APPROVAL", network: { chainId: 97 }, governanceSafe: safe, startingNonce: "7", endingNonce: "8", proposals, transactionOccurred: false }, "proposalPlanDigest");
    const transactions = proposals.map((_, index) => ({ hash: `0x${String(index + 10).padStart(64, "0")}`, blockNumber: 100 + index }));
    const verification = digest({ status: "SAFE_EXECUTIONS_VERIFIED_PENDING_FINAL_STATE", network: { chainId: 97 }, proposalPlanDigest: plan.proposalPlanDigest, transactions, transactionOccurred: true }, "verificationDigest");
    const finalState = digest({ status: "VERIFIED_STAGE3_GOVERNANCE_BINDINGS", network: { chainId: 97 }, proposalPlanDigest: plan.proposalPlanDigest, executionVerificationDigest: verification.verificationDigest, blockNumber: 200, blockHash: `0x${"ab".repeat(32)}`, rpcCount: 2, safeNonce: "9", addresses: {}, attesters: [], runtimeDigests: [], transactionOccurred: true }, "finalStateDigest");
    return { plan, verification, finalState };
  }

  it("binds plan, executions and final state into one digest", function () {
    const completion = buildIntentStage3CompletionPackage(fixture());
    assert.equal(completion.status, "STAGE3_GOVERNANCE_BINDINGS_VERIFIED");
    assert.equal(completion.proposalCount, 2);
    assert.equal(completion.finalSafeNonce, "9");
    assert.match(completion.completionDigest, /^sha256:[0-9a-f]{64}$/);
  });

  it("rejects tampered, mismatched or incomplete evidence", function () {
    let inputs = fixture(); inputs.finalState.safeNonce = "8"; assert.throws(() => buildIntentStage3CompletionPackage(inputs), /final state|nonce/);
    inputs = fixture(); inputs.verification.proposalPlanDigest = "sha256:tampered"; assert.throws(() => buildIntentStage3CompletionPackage(inputs), /execution verification|binding/);
    inputs = fixture(); inputs.verification.transactions.pop(); inputs.verification.verificationDigest = canonicalDigest(Object.fromEntries(Object.entries(inputs.verification).filter(([key]) => key !== "verificationDigest"))); inputs.finalState.executionVerificationDigest = inputs.verification.verificationDigest; inputs.finalState.finalStateDigest = canonicalDigest(Object.fromEntries(Object.entries(inputs.finalState).filter(([key]) => key !== "finalStateDigest"))); assert.throws(() => buildIntentStage3CompletionPackage(inputs), /count/);
  });

  it("writes five immutable evidence files", function () {
    const inputs = fixture(), completion = buildIntentStage3CompletionPackage(inputs), directory = fs.mkdtempSync(path.join(os.tmpdir(), "lqc-stage3-complete-"));
    const result = writeIntentStage3CompletionPackage(directory, completion, inputs);
    assert.equal(result.fileCount, 5);
    assert.equal(fs.readdirSync(directory).length, 5);
    assert.throws(() => writeIntentStage3CompletionPackage(directory, completion, inputs), /empty output/);
  });
});
