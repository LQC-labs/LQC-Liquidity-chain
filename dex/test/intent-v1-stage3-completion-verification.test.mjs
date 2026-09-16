import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { buildIntentStage3CompletionPackage, writeIntentStage3CompletionPackage } from "../scripts/build-intent-stage3-completion-package.mjs";
import { verifyIntentStage3CompletionPackage } from "../scripts/verify-intent-stage3-completion-package.mjs";

const seal = (body, field) => ({ ...body, [field]: canonicalDigest(body) });
function fixture() {
  const governanceSafe = "0x0000000000000000000000000000000000000010";
  const proposals = [1, 2].map(id => ({ id, safeTxHash: `0x${String(id).padStart(64, "0")}` }));
  const plan = seal({ status: "READY_FOR_SEPARATE_EXPLICIT_4_OF_7_APPROVAL", network: { chainId: 97 }, governanceSafe, startingNonce: "4", endingNonce: "5", proposals, transactionOccurred: false }, "proposalPlanDigest");
  const transactions = proposals.map((_, index) => ({ hash: `0x${String(index + 30).padStart(64, "0")}`, blockNumber: 300 + index }));
  const verification = seal({ status: "SAFE_EXECUTIONS_VERIFIED_PENDING_FINAL_STATE", network: { chainId: 97 }, proposalPlanDigest: plan.proposalPlanDigest, transactions, transactionOccurred: true }, "verificationDigest");
  const finalState = seal({ status: "VERIFIED_STAGE3_GOVERNANCE_BINDINGS", network: { chainId: 97 }, proposalPlanDigest: plan.proposalPlanDigest, executionVerificationDigest: verification.verificationDigest, blockNumber: 400, blockHash: `0x${"cd".repeat(32)}`, rpcCount: 2, safeNonce: "6", addresses: {}, attesters: [], runtimeDigests: [], transactionOccurred: true }, "finalStateDigest");
  return { plan, verification, finalState };
}
function packageDirectory() {
  const inputs = fixture(), completion = buildIntentStage3CompletionPackage(inputs), directory = fs.mkdtempSync(path.join(os.tmpdir(), "lqc-stage3-verify-"));
  writeIntentStage3CompletionPackage(directory, completion, inputs);
  return directory;
}

describe("LQC Intent Stage-3 completion package verifier", function () {
  it("independently rebuilds and verifies all five files", function () {
    const result = verifyIntentStage3CompletionPackage(packageDirectory());
    assert.equal(result.status, "VERIFIED_STAGE3_COMPLETION_PACKAGE");
    assert.equal(Object.keys(result.fileDigests).length, 5);
    assert.equal(result.transactionOccurred, false);
    assert.match(result.packageVerificationDigest, /^sha256:[0-9a-f]{64}$/);
  });
  it("rejects a changed source record, manifest, summary, or file set", function () {
    let directory = packageDirectory(), file = path.join(directory, "safe-proposal-plan.json"), value = JSON.parse(fs.readFileSync(file)); value.endingNonce = "9"; fs.writeFileSync(file, JSON.stringify(value)); assert.throws(() => verifyIntentStage3CompletionPackage(directory), /proposal plan|nonce|manifest/);
    directory = packageDirectory(); file = path.join(directory, "completion-manifest.json"); value = JSON.parse(fs.readFileSync(file)); value.status = "FORGED"; fs.writeFileSync(file, JSON.stringify(value)); assert.throws(() => verifyIntentStage3CompletionPackage(directory), /manifest/);
    directory = packageDirectory(); fs.appendFileSync(path.join(directory, "COMPLETION.md"), "tampered\n"); assert.throws(() => verifyIntentStage3CompletionPackage(directory), /summary/);
    directory = packageDirectory(); fs.writeFileSync(path.join(directory, "extra.json"), "{}\n"); assert.throws(() => verifyIntentStage3CompletionPackage(directory), /file set/);
  });
});
