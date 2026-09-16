import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { prepareIntentStage4Pilot } from "../scripts/prepare-intent-stage4-pilot.mjs";
import { verifyIntentStage4Pilot } from "../scripts/verify-intent-stage4-pilot.mjs";

const a = value => ethers.getAddress(`0x${value.toString(16).padStart(40, "0")}`);
function fixture() {
  const body = { status: "VERIFIED_STAGE3_AUDIT_HANDOFF", network: { chainId: 97 }, sourceRevision: "ab".repeat(20), transactionOccurred: false };
  const handoffVerification = { ...body, handoffVerificationDigest: canonicalDigest(body) };
  const pilotPlan = prepareIntentStage4Pilot({ handoffVerification, intentHub: a(1), user: a(2), sourceToken: a(3), destinationToken: a(4), recipient: a(2), sourceAmount: "1000", quotedAmountOut: "2000", minimumAmountOut: "1980", maxSourceAmount: "1000", now: "2000000", deadline: "2000600", nonce: "8", salt: ethers.id("pilot-8"), dexId: ethers.id("LQC_FLOW"), routeData: ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[a(3), a(4)]]) });
  return { handoffVerification, pilotPlan, expectedPilotPlanDigest: pilotPlan.pilotPlanDigest };
}

describe("LQC Intent Stage-4 pilot plan verification", function () {
  it("independently rebuilds the EIP-712 plan and safety bounds", function () {
    const input = fixture(), result = verifyIntentStage4Pilot(input);
    assert.equal(result.status, "VERIFIED_STAGE4_PILOT_PLAN");
    assert.equal(result.intentHash, input.pilotPlan.intentHash);
    assert.equal(result.routeHash, input.pilotPlan.routeHash);
    assert.equal(result.transactionOccurred, false);
    assert.match(result.pilotVerificationDigest, /^sha256:[0-9a-f]{64}$/);
  });
  it("rejects rehashed intent, route, cap, deadline and handoff substitution", function () {
    for (const mutate of [
      plan => { plan.intent.sourceAmount = "999"; }, plan => { plan.routeData = "0x1234"; },
      plan => { plan.pilotLimits.maxSourceAmount = "9999"; }, plan => { plan.pilotLimits.deadlineSeconds = 700; },
    ]) { const input = fixture(); mutate(input.pilotPlan); input.pilotPlan.pilotPlanDigest = canonicalDigest(Object.fromEntries(Object.entries(input.pilotPlan).filter(([key]) => key !== "pilotPlanDigest"))); assert.throws(() => verifyIntentStage4Pilot(input), /does not match|route|99%|deadline|cap/); }
    const input = fixture(); input.handoffVerification.sourceRevision = "cd".repeat(20); assert.throws(() => verifyIntentStage4Pilot(input), /handoff/);
  });
  it("contains no signing or transaction mechanism", function () {
    const source = fs.readFileSync(new URL("../scripts/verify-intent-stage4-pilot.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(source, /JsonRpcProvider|PRIVATE_KEY|signTypedData|eth_sendTransaction|approve\(/);
    assert.match(source, /Offline pilot-plan verification only/);
  });
});
