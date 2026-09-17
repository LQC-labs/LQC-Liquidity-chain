import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { prepareIntentStage4Pilot } from "../scripts/prepare-intent-stage4-pilot.mjs";

const a = value => ethers.getAddress(`0x${value.toString(16).padStart(40, "0")}`);
function fixture(change = {}) {
  const handoffBody = { status: "VERIFIED_STAGE3_AUDIT_HANDOFF", network: { chainId: 97 }, sourceRevision: "ab".repeat(20), transactionOccurred: false };
  const handoffVerification = { ...handoffBody, handoffVerificationDigest: canonicalDigest(handoffBody) };
  return { handoffVerification, intentHub: a(1), user: a(2), sourceToken: a(3), destinationToken: a(4), recipient: a(2), sourceAmount: "1000", quotedAmountOut: "2000", minimumAmountOut: "1980", maxSourceAmount: "1000", now: "1000000", deadline: "1000600", nonce: "7", salt: ethers.id("pilot-7"), dexId: ethers.id("LQC_FLOW"), routeData: ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[a(3), a(4)]]), ...change };
}

describe("LQC Intent Stage-4 bounded pilot preparation", function () {
  it("builds a same-chain offline EIP-712 review plan", function () {
    const plan = prepareIntentStage4Pilot(fixture());
    assert.equal(plan.status, "READY_FOR_OFFLINE_REVIEW_ONLY");
    assert.equal(plan.intent.sourceChainId, "97");
    assert.equal(plan.intent.destinationChainId, "97");
    assert.equal(plan.quoteBounds.slippageBps, 100);
    assert.equal(plan.pilotLimits.deadlineSeconds, 600);
    assert.equal(plan.transactionOccurred, false);
    assert.match(plan.intentHash, /^0x[0-9a-f]{64}$/);
    assert.match(plan.pilotPlanDigest, /^sha256:[0-9a-f]{64}$/);
  });
  it("rejects cap, slippage, deadline, chain evidence and route violations", function () {
    assert.throws(() => prepareIntentStage4Pilot(fixture({ sourceAmount: "1001" })), /cap/);
    assert.throws(() => prepareIntentStage4Pilot(fixture({ minimumAmountOut: "1979" })), /99%/);
    assert.throws(() => prepareIntentStage4Pilot(fixture({ deadline: "1000200" })), /5 to 15/);
    assert.throws(() => prepareIntentStage4Pilot(fixture({ routeData: "0x" })), /route/);
    const input = fixture(); input.handoffVerification.status = "FORGED"; assert.throws(() => prepareIntentStage4Pilot(input), /handoff/);
  });
  it("contains no key, signing, approval or transaction mechanism", function () {
    const source = fs.readFileSync(new URL("../scripts/prepare-intent-stage4-pilot.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(source, /JsonRpcProvider|PRIVATE_KEY|signTypedData|eth_sendTransaction|approve\(/);
    assert.match(source, /Preparation only/);
  });
});
