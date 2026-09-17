import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { prepareIntentStage4SolverQuotePacket } from "../scripts/prepare-intent-stage4-solver-quote-packet.mjs";

const a = value => ethers.getAddress(`0x${value.toString(16).padStart(40, "0")}`);
function fixture(change = {}) {
  const wallet = ethers.Wallet.createRandom(), quoteManager = a(9), intentHash = ethers.id("submitted-intent"), routeData = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[a(2), a(3)]]), routeHash = ethers.keccak256(routeData);
  const pilotBody = { status: "READY_FOR_OFFLINE_REVIEW_ONLY", network: { chainId: 97 }, intent: { sourceAmount: "1000", minAmountOut: "990", deadline: "5000600" }, intentHash, dexId: ethers.id("LQC_FLOW"), routeData, routeHash, transactionOccurred: false }, pilotPlan = { ...pilotBody, pilotPlanDigest: canonicalDigest(pilotBody) };
  const preflightBody = { status: "READY_FOR_SEPARATE_WALLET_SUBMISSION", network: { chainId: 97 }, submissionPlanDigest: "sha256:submission", pilotPlanDigest: pilotPlan.pilotPlanDigest, intentHash, addresses: { quoteManager }, transactionOccurred: false }, submissionPreflight = { ...preflightBody, submissionPreflightDigest: canonicalDigest(preflightBody) };
  const verificationBody = { status: "VERIFIED_STAGE4_INTENT_SUBMISSION", network: { chainId: 97 }, submissionPlanDigest: submissionPreflight.submissionPlanDigest, submissionPreflightDigest: submissionPreflight.submissionPreflightDigest, pilotPlanDigest: pilotPlan.pilotPlanDigest, intentHash, transactionHash: ethers.id("submission-tx"), intentStatus: change.intentStatus ?? "OPEN", deposit: { amount: change.depositAmount ?? "1000", active: change.depositActive ?? true }, transactionOccurred: true }, submissionVerification = { ...verificationBody, submissionVerificationDigest: canonicalDigest(verificationBody) };
  return { pilotPlan, submissionPreflight, submissionVerification, expectedSubmissionVerificationDigest: submissionVerification.submissionVerificationDigest, solver: wallet.address, amountOut: change.amountOut ?? "1010", solverFeeOut: change.solverFeeOut ?? "5", gasCostOut: change.gasCostOut ?? "5", issuedAt: change.issuedAt ?? "5000400", deadline: change.deadline ?? "5000460", nonce: "7", wallet };
}

describe("LQC Intent Stage-4 Solver quote signing packet", function () {
  it("binds the verified OPEN Intent to an unsigned bounded EIP-712 quote", function () {
    const input = fixture(), result = prepareIntentStage4SolverQuotePacket(input);
    assert.equal(result.status, "READY_FOR_SEPARATE_SOLVER_EIP712_REVIEW"); assert.equal(result.quoteEconomics.netAmountOut, "1000"); assert.equal(result.walletReview.quoteLifetimeSeconds, 60); assert.equal(result.signature, null); assert.equal(ethers.TypedDataEncoder.hash(result.typedData.domain, result.typedData.types, result.typedData.message), result.quoteHash); assert.match(result.solverQuotePacketDigest, /^sha256:[0-9a-f]{64}$/);
  });
  it("rejects weak economics, lifetime, deposit and independent evidence", function () {
    assert.throws(() => prepareIntentStage4SolverQuotePacket(fixture({ amountOut: "999", solverFeeOut: "5", gasCostOut: "5" })), /minimum/);
    assert.throws(() => prepareIntentStage4SolverQuotePacket(fixture({ deadline: "5000521" })), /lifetime/);
    assert.throws(() => prepareIntentStage4SolverQuotePacket(fixture({ depositActive: false })), /active exact deposit/);
    assert.throws(() => prepareIntentStage4SolverQuotePacket(fixture({ intentStatus: "EXECUTED" })), /not open/);
    const input = fixture(); input.expectedSubmissionVerificationDigest = "sha256:unreviewed"; assert.throws(() => prepareIntentStage4SolverQuotePacket(input), /independently reviewed/);
  });
  it("contains no key, signing, wallet, RPC or transaction mechanism", function () {
    const source = fs.readFileSync(new URL("../scripts/prepare-intent-stage4-solver-quote-packet.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(source, /PRIVATE_KEY|signTypedData|JsonRpcProvider|eth_sendTransaction|sendTransaction/); assert.match(source, /Unsigned Solver EIP-712 quote packet only/);
  });
});
