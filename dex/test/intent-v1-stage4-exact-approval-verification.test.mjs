import assert from "node:assert/strict";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { verifyIntentStage4ExactApproval } from "../scripts/verify-intent-stage4-exact-approval.mjs";

const a = value => ethers.getAddress(`0x${value.toString(16).padStart(40, "0")}`), erc20 = new ethers.Interface(["function approve(address,uint256) returns(bool)", "function allowance(address,address) view returns(uint256)"]);
function fixture(change = {}) {
  const owner = a(1), token = a(2), spender = a(3), amount = 1000n, transactionHash = `0x${"11".repeat(32)}`, data = erc20.encodeFunctionData("approve", [spender, amount]);
  const body = { status: "READY_FOR_SEPARATE_WALLET_REVIEW", network: { chainId: 97 }, pilotPlanDigest: "sha256:pilot", preflightDigest: "sha256:preflight", intentHash: ethers.id("intent"), approval: { owner, token, spender, amount: amount.toString() }, transaction: { chainId: 97, from: owner, to: token, value: "0", data }, transactionOccurred: false }, approvalPlan = { ...body, approvalPlanDigest: canonicalDigest(body) };
  const provider = disagreement => ({ getNetwork: async () => ({ chainId: 97n }), getBlockNumber: async () => 102, getTransaction: async () => ({ hash: transactionHash, from: owner, to: token, value: 0n, data: change.badData ? erc20.encodeFunctionData("approve", [spender, 999n]) : data }), getTransactionReceipt: async () => ({ hash: transactionHash, from: owner, to: token, status: change.failed ? 0 : 1, blockNumber: change.weak ? 101 : 100, blockHash: disagreement ? ethers.id("other") : ethers.id("mined") }), getBlock: async () => ({ hash: disagreement ? ethers.id("other") : ethers.id("mined") }), call: async () => erc20.encodeFunctionResult("allowance", [BigInt(change.allowance ?? 1000)]) });
  return { providers: [provider(false), provider(Boolean(change.rpcDisagreement))], approvalPlan, transactionHash };
}

describe("LQC Intent Stage-4 exact approval verification", function () {
  it("verifies payload, canonical receipt, finality and exact allowance", async function () { const result = await verifyIntentStage4ExactApproval(fixture()); assert.equal(result.status, "VERIFIED_EXACT_SOURCE_ESCROW_APPROVAL"); assert.equal(result.confirmations, 3); assert.equal(result.approval.amount, "1000"); assert.equal(result.transactionOccurred, true); assert.match(result.approvalVerificationDigest, /^sha256:[0-9a-f]{64}$/); });
  it("rejects failed, weak, changed, inexact and disagreeing evidence", async function () { await assert.rejects(verifyIntentStage4ExactApproval(fixture({ failed: true })), /failed/); await assert.rejects(verifyIntentStage4ExactApproval(fixture({ weak: true })), /confirmations/); await assert.rejects(verifyIntentStage4ExactApproval(fixture({ badData: true })), /payload/); await assert.rejects(verifyIntentStage4ExactApproval(fixture({ allowance: 999 })), /allowance/); await assert.rejects(verifyIntentStage4ExactApproval(fixture({ rpcDisagreement: true })), /disagreement/); });
});
