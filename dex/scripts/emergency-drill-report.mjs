import fs from "node:fs";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const REQUIRED_STEPS = [
  "BASELINE_SWAP", "PAUSE_DEX", "PAUSE_ALL_SWAPS", "VERIFY_BLOCKED",
  "SCHEDULE_RECOVERY", "VERIFY_TIMELOCK_BLOCKED", "EXECUTE_RECOVERY", "POST_RECOVERY_SWAP"
];
const TRANSACTION_STEPS = new Set([
  "BASELINE_SWAP", "PAUSE_DEX", "PAUSE_ALL_SWAPS", "SCHEDULE_RECOVERY",
  "EXECUTE_RECOVERY", "POST_RECOVERY_SWAP"
]);
const TX_HASH = /^0x[0-9a-fA-F]{64}$/;
const SOURCE_REVISION = /^[0-9a-fA-F]{40}$/;

const timestamp = (name, value) => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be an ISO-8601 timestamp.`);
  return parsed;
};

export function buildEmergencyDrillReport(input) {
  if (input?.network?.chainId !== 97) throw new Error("Emergency drill evidence must be from BSC testnet chain 97.");
  if (!SOURCE_REVISION.test(input.sourceRevision || "")) throw new Error("sourceRevision must be a full Git commit SHA.");
  if (!input.deploymentFingerprint || !input.drillId) throw new Error("deploymentFingerprint and drillId are required.");
  if (!Array.isArray(input.steps) || input.steps.length !== REQUIRED_STEPS.length) {
    throw new Error(`Emergency drill requires exactly ${REQUIRED_STEPS.length} ordered steps.`);
  }
  const startedAt = timestamp("startedAt", input.startedAt);
  const completedAt = timestamp("completedAt", input.completedAt);
  if (completedAt < startedAt) throw new Error("completedAt cannot precede startedAt.");
  let previous = startedAt;
  let scheduledAt;
  let executedAt;
  const steps = input.steps.map((step, index) => {
    if (step.type !== REQUIRED_STEPS[index]) throw new Error(`Step ${index + 1} must be ${REQUIRED_STEPS[index]}.`);
    if (step.status !== "PASS") throw new Error(`${step.type} must pass before a successful report can be generated.`);
    const occurredAt = timestamp(`${step.type}.occurredAt`, step.occurredAt);
    if (occurredAt < previous || occurredAt > completedAt) throw new Error(`${step.type} is outside chronological order.`);
    previous = occurredAt;
    if (TRANSACTION_STEPS.has(step.type) && !TX_HASH.test(step.txHash || "")) {
      throw new Error(`${step.type} requires a full transaction hash.`);
    }
    if (!TRANSACTION_STEPS.has(step.type) && !step.evidence) throw new Error(`${step.type} requires read-only evidence.`);
    if (step.type === "SCHEDULE_RECOVERY") scheduledAt = occurredAt;
    if (step.type === "EXECUTE_RECOVERY") executedAt = occurredAt;
    return { order: index + 1, ...step };
  });
  const delaySeconds = Number(input.timelockDelaySeconds);
  if (!Number.isInteger(delaySeconds) || delaySeconds < 3600 || delaySeconds > 604800) {
    throw new Error("timelockDelaySeconds must be an integer from 3600 to 604800.");
  }
  if ((executedAt - scheduledAt) / 1000 < delaySeconds) throw new Error("Recovery executed before the recorded timelock delay elapsed.");

  const evidence = { schemaVersion: 1, reportType: "LQC_EMERGENCY_RECOVERY_DRILL", result: "PASS",
    drillId: input.drillId, network: input.network, deploymentFingerprint: input.deploymentFingerprint,
    sourceRevision: input.sourceRevision.toLowerCase(), startedAt: input.startedAt, completedAt: input.completedAt,
    timelockDelaySeconds: delaySeconds, steps };
  const evidenceDigest = `sha256:${crypto.createHash("sha256").update(JSON.stringify(evidence)).digest("hex")}`;
  return { ...evidence, evidenceDigest };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw new Error("Usage: npm run report:emergency-drill -- <drill-input.json>");
    const input = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
    console.log(JSON.stringify(buildEmergencyDrillReport(input), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
