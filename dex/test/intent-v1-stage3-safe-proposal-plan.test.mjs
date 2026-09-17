import assert from "node:assert/strict";
import { ethers } from "ethers";
import { canonicalDigest, sha256 } from "../scripts/build-intent-reproducibility-seal.mjs";
import { buildIntentStage3SafeProposalPlan, SAFE_TYPES } from "../scripts/build-intent-stage3-safe-proposal-plan.mjs";

describe("LQC Intent Stage-3 Safe proposal plan", function () {
  const address = value => ethers.getAddress(`0x${value.toString(16).padStart(40, "0")}`);
  const safe = address(10), owners = Array.from({ length: 7 }, (_, index) => address(100 + index));

  function fixture() {
    const orderedActions = Array.from({ length: 11 }, (_, index) => ({ id: index + 1, actor: "governance-safe", action: `action-${index + 1}`, to: address(20 + index), value: "0", data: `0x${(index + 1).toString(16).padStart(8, "0")}` }));
    const readinessDigest = "sha256:readiness";
    const reviewBody = { status: "REVIEW_REQUIRED", network: { chainId: 97 }, transactionOccurred: false, readinessDigest, governanceSafe: safe, actions: orderedActions.map(action => ({ id: action.id, action: action.action, to: action.to, calldataDigest: sha256(action.data) })) };
    const review = { ...reviewBody, reviewDigest: canonicalDigest(reviewBody) };
    const preflightBody = { status: "PREFLIGHT_VERIFIED_FOR_4_OF_7_REVIEW", network: { chainId: 97 }, transactionOccurred: false, governanceSafe: safe, safeNonce: "9", safeThreshold: "4", safeOwnerCount: 7, safeOwners: owners, actionCount: 11, actionCalldataDigests: orderedActions.map(action => sha256(action.data)), reviewDigest: review.reviewDigest, readinessDigest };
    const preflight = { ...preflightBody, preflightDigest: canonicalDigest(preflightBody) };
    const manifest = { stage: "stage3-governance-bindings", network: { chainId: 97 }, dryRun: { transactionOccurred: false }, orderedActions };
    return { preflight, review, manifest };
  }

  it("binds 11 reviewed actions to sequential Safe nonces and deterministic hashes", function () {
    const input = fixture(), plan = buildIntentStage3SafeProposalPlan(input);
    assert.equal(plan.status, "READY_FOR_SEPARATE_EXPLICIT_4_OF_7_APPROVAL");
    assert.equal(plan.startingNonce, "9");
    assert.equal(plan.endingNonce, "19");
    assert.equal(plan.proposals.length, 11);
    assert.equal(plan.transactionOccurred, false);
    for (const [index, proposal] of plan.proposals.entries()) {
      assert.equal(proposal.safeTransaction.nonce, String(9 + index));
      const value = { ...proposal.safeTransaction, value: 0n, safeTxGas: 0n, baseGas: 0n, gasPrice: 0n, nonce: BigInt(proposal.safeTransaction.nonce) };
      assert.equal(proposal.safeTxHash, ethers.TypedDataEncoder.hash({ chainId: 97, verifyingContract: safe }, SAFE_TYPES, value));
    }
  });

  it("rejects action substitution and stale Safe policy evidence", function () {
    let input = fixture();
    input.manifest.orderedActions[0].data = "0xdeadbeef";
    assert.throws(() => buildIntentStage3SafeProposalPlan(input), /changed after preflight/);
    input = fixture();
    const { preflightDigest: _old, ...body } = input.preflight;
    body.safeThreshold = "3";
    input.preflight = { ...body, preflightDigest: canonicalDigest(body) };
    assert.throws(() => buildIntentStage3SafeProposalPlan(input), /Safe policy/);
  });
});
