import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { prepareIntentStage4Pilot } from "../scripts/prepare-intent-stage4-pilot.mjs";
import { verifyIntentStage4Pilot } from "../scripts/verify-intent-stage4-pilot.mjs";
import { prepareIntentStage4SigningPacket } from "../scripts/prepare-intent-stage4-signing-packet.mjs";

const a = value => ethers.getAddress(`0x${value.toString(16).padStart(40, "0")}`), seal = (body, field) => ({ ...body, [field]: canonicalDigest(body) });
function fixture() {
  const handoffBody = { status: "VERIFIED_STAGE3_AUDIT_HANDOFF", network: { chainId: 97 }, transactionOccurred: false }, handoff = { ...handoffBody, handoffVerificationDigest: canonicalDigest(handoffBody) }, user = a(2), token = a(3), tokenOut = a(4), hub = a(1);
  const pilotPlan = prepareIntentStage4Pilot({ handoffVerification: handoff, intentHub: hub, user, sourceToken: token, destinationToken: tokenOut, recipient: user, sourceAmount: "1000", quotedAmountOut: "2000", minimumAmountOut: "1980", maxSourceAmount: "1000", now: "4000000", deadline: "4000600", nonce: "10", salt: ethers.id("pilot-10"), dexId: ethers.id("LQC_FLOW"), routeData: ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[token, tokenOut]]) });
  const pilotVerification = verifyIntentStage4Pilot({ handoffVerification: handoff, pilotPlan, expectedPilotPlanDigest: pilotPlan.pilotPlanDigest });
  const approvalVerification = seal({ status: "VERIFIED_EXACT_SOURCE_ESCROW_APPROVAL", network: { chainId: 97 }, pilotPlanDigest: pilotPlan.pilotPlanDigest, intentHash: pilotPlan.intentHash, transactionHash: ethers.id("approval"), transactionOccurred: true }, "approvalVerificationDigest");
  const postApprovalPreflight = seal({ status: "READY_FOR_INTENT_SIGNATURE", network: { chainId: 97 }, pilotPlanDigest: pilotPlan.pilotPlanDigest, pilotVerificationDigest: pilotVerification.pilotVerificationDigest, intentHash: pilotPlan.intentHash, routeHash: pilotPlan.routeHash, blockNumber: 900, blockHash: ethers.id("signing-block"), allowance: "1000", exactApprovalRequired: false, transactionOccurred: false }, "preflightDigest");
  return { pilotPlan, pilotVerification, approvalVerification, postApprovalPreflight, expectedPreflightDigest: postApprovalPreflight.preflightDigest };
}

describe("LQC Intent Stage-4 EIP-712 signing review packet", function () {
  it("binds exact approval and fresh preflight to unsigned typed data", function () { const input = fixture(), packet = prepareIntentStage4SigningPacket(input); assert.equal(packet.status, "READY_FOR_SEPARATE_EIP712_WALLET_REVIEW"); assert.equal(packet.typedData.primaryType, "Intent"); assert.equal(packet.intentHash, input.pilotPlan.intentHash); assert.equal(packet.signature, null); assert.equal(packet.transactionOccurred, false); assert.match(packet.signingPacketDigest, /^sha256:[0-9a-f]{64}$/); });
  it("rejects missing exact approval, stale allowance, rehashed preflight and Intent changes", function () { let input = fixture(); input.approvalVerification.status = "PENDING"; assert.throws(() => prepareIntentStage4SigningPacket(input), /approval/); input = fixture(); input.postApprovalPreflight.allowance = "999"; input.postApprovalPreflight.preflightDigest = canonicalDigest(Object.fromEntries(Object.entries(input.postApprovalPreflight).filter(([key]) => key !== "preflightDigest"))); assert.throws(() => prepareIntentStage4SigningPacket(input), /post-approval|binding/); input = fixture(); input.pilotPlan.intent.recipient = a(9); input.pilotPlan.pilotPlanDigest = canonicalDigest(Object.fromEntries(Object.entries(input.pilotPlan).filter(([key]) => key !== "pilotPlanDigest"))); assert.throws(() => prepareIntentStage4SigningPacket(input), /verification|Intent hash/); });
  it("contains no wallet, signing key or transaction path", function () { const source = fs.readFileSync(new URL("../scripts/prepare-intent-stage4-signing-packet.mjs", import.meta.url), "utf8"); assert.doesNotMatch(source, /JsonRpcProvider|PRIVATE_KEY|signTypedData|eth_sendTransaction|sendTransaction/); assert.match(source, /Unsigned EIP-712 review packet only/); });
});
