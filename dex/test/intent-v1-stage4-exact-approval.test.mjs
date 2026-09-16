import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { prepareIntentStage4ExactApproval } from "../scripts/prepare-intent-stage4-exact-approval.mjs";

const a = value => ethers.getAddress(`0x${value.toString(16).padStart(40, "0")}`), seal = (body, field) => ({ ...body, [field]: canonicalDigest(body) });
function fixture(change = {}) {
  const intentHub = a(1), user = a(2), sourceToken = a(3), sourceEscrow = a(4), intentHash = ethers.id("pilot-intent"), routeHash = ethers.id("pilot-route");
  const pilotPlan = seal({ status: "READY_FOR_OFFLINE_REVIEW_ONLY", network: { chainId: 97 }, intentHub, intent: { user, sourceToken, sourceAmount: "1000" }, intentHash, routeHash, transactionOccurred: false }, "pilotPlanDigest");
  const pilotVerification = seal({ status: "VERIFIED_STAGE4_PILOT_PLAN", network: { chainId: 97 }, pilotPlanDigest: pilotPlan.pilotPlanDigest, intentHash, routeHash, transactionOccurred: false }, "pilotVerificationDigest");
  const preflight = seal({ status: "READY_FOR_EXACT_APPROVAL", network: { chainId: 97 }, pilotPlanDigest: pilotPlan.pilotPlanDigest, pilotVerificationDigest: pilotVerification.pilotVerificationDigest, intentHash, routeHash, blockNumber: 800, blockHash: ethers.id("approval-block"), addresses: { intentHub, user, sourceToken, sourceEscrow }, balance: "1000", allowance: "0", exactApprovalRequired: true, transactionOccurred: false }, "preflightDigest");
  return { pilotPlan, pilotVerification, preflight, expectedPreflightDigest: preflight.preflightDigest, ...change };
}

describe("LQC Intent Stage-4 exact SourceEscrow approval plan", function () {
  it("encodes only the exact reviewed amount", function () { const input = fixture(), plan = prepareIntentStage4ExactApproval(input), iface = new ethers.Interface(["function approve(address,uint256)"]), decoded = iface.decodeFunctionData("approve", plan.transaction.data); assert.equal(plan.status, "READY_FOR_SEPARATE_WALLET_REVIEW"); assert.equal(decoded[0], input.preflight.addresses.sourceEscrow); assert.equal(decoded[1], 1000n); assert.equal(plan.transaction.value, "0"); assert.equal(plan.transactionOccurred, false); assert.match(plan.approvalPlanDigest, /^sha256:[0-9a-f]{64}$/); });
  it("rejects prior, excess, mismatched or tampered approval state", function () { let input = fixture(); input.preflight.allowance = "1"; assert.throws(() => prepareIntentStage4ExactApproval(input), /preflight/); input = fixture(); input.preflight.status = "READY_FOR_INTENT_SIGNATURE"; assert.throws(() => prepareIntentStage4ExactApproval(input), /preflight/); input = fixture(); input.preflight.addresses.sourceEscrow = a(9); input.preflight.preflightDigest = canonicalDigest(Object.fromEntries(Object.entries(input.preflight).filter(([key]) => key !== "preflightDigest"))); assert.throws(() => prepareIntentStage4ExactApproval(input), /independently reviewed/); input = fixture(); input.pilotVerification.pilotPlanDigest = "sha256:other"; assert.throws(() => prepareIntentStage4ExactApproval(input), /verification/); });
  it("contains no wallet, key, signature or send path", function () { const source = fs.readFileSync(new URL("../scripts/prepare-intent-stage4-exact-approval.mjs", import.meta.url), "utf8"); assert.doesNotMatch(source, /JsonRpcProvider|PRIVATE_KEY|eth_sendTransaction|sendTransaction|signTransaction/); assert.match(source, /Unsigned exact-allowance plan only/); });
});
