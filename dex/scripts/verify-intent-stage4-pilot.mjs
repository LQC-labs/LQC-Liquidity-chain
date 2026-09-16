import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";
import { prepareIntentStage4Pilot } from "./prepare-intent-stage4-pilot.mjs";

export function verifyIntentStage4Pilot({ handoffVerification, pilotPlan, expectedPilotPlanDigest }) {
  if (pilotPlan?.status !== "READY_FOR_OFFLINE_REVIEW_ONLY" || pilotPlan.network?.chainId !== 97 || pilotPlan.transactionOccurred !== false || !pilotPlan.pilotPlanDigest) throw new Error("Invalid Stage-4 pilot plan");
  const planBody = Object.fromEntries(Object.entries(pilotPlan).filter(([key]) => key !== "pilotPlanDigest" && key !== "checkedAt"));
  if (canonicalDigest(planBody) !== pilotPlan.pilotPlanDigest) throw new Error("Invalid Stage-4 pilot plan digest");
  if (pilotPlan.pilotPlanDigest !== expectedPilotPlanDigest) throw new Error("Stage-4 pilot plan does not match the independently reviewed digest");
  const deadline = BigInt(pilotPlan.intent.deadline), duration = BigInt(pilotPlan.pilotLimits.deadlineSeconds);
  const rebuilt = prepareIntentStage4Pilot({
    handoffVerification, intentHub: pilotPlan.intentHub, user: pilotPlan.intent.user, sourceToken: pilotPlan.intent.sourceToken,
    destinationToken: pilotPlan.intent.destinationToken, recipient: pilotPlan.intent.recipient, sourceAmount: pilotPlan.intent.sourceAmount,
    quotedAmountOut: pilotPlan.quoteBounds.quotedAmountOut, minimumAmountOut: pilotPlan.intent.minAmountOut,
    maxSourceAmount: pilotPlan.pilotLimits.maxSourceAmount, deadline: pilotPlan.intent.deadline, nonce: pilotPlan.intent.nonce,
    salt: pilotPlan.intent.salt, dexId: pilotPlan.dexId, routeData: pilotPlan.routeData, now: (deadline - duration).toString(),
  });
  if (canonicalDigest(rebuilt) !== canonicalDigest(pilotPlan)) throw new Error("Stage-4 pilot plan does not match verified source evidence");
  const body = {
    schemaVersion: 1, recordType: "LQC_INTENT_STAGE4_PILOT_VERIFICATION", status: "VERIFIED_STAGE4_PILOT_PLAN",
    network: rebuilt.network, stage3HandoffVerificationDigest: rebuilt.stage3HandoffVerificationDigest,
    pilotPlanDigest: rebuilt.pilotPlanDigest, intentHash: rebuilt.intentHash, routeHash: rebuilt.routeHash,
    sourceAmount: rebuilt.intent.sourceAmount, minimumAmountOut: rebuilt.intent.minAmountOut, deadline: rebuilt.intent.deadline,
    transactionOccurred: false,
    safety: "Offline pilot-plan verification only. No approval, signature, Solver quote, RPC call, wallet request, or transaction.",
  };
  return { ...body, pilotVerificationDigest: canonicalDigest(body) };
}

async function main() {
  const [handoffFile, pilotFile, expectedPilotPlanDigest, outputFile] = process.argv.slice(2);
  if (!outputFile) throw new Error("Usage: node verify-intent-stage4-pilot.mjs <handoff-verification.json> <pilot-plan.json> <expected-pilot-digest> <output.json>");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = verifyIntentStage4Pilot({ handoffVerification: read(handoffFile), pilotPlan: read(pilotFile), expectedPilotPlanDigest });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(`Wrote ${path.resolve(outputFile)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
