import assert from "node:assert/strict";
import { buildEmergencyDrillReport } from "../scripts/emergency-drill-report.mjs";

const hash = number => `0x${number.toString(16).padStart(64, "0")}`;
const base = () => ({
  drillId: "bsc97-drill-001", network: { name: "BSC Testnet", chainId: 97 },
  deploymentFingerprint: "bsc97-reviewed-deployment", sourceRevision: "a".repeat(40),
  startedAt: "2026-09-09T00:00:00.000Z", completedAt: "2026-09-09T01:02:00.000Z",
  timelockDelaySeconds: 3600,
  steps: [
    { type: "BASELINE_SWAP", status: "PASS", occurredAt: "2026-09-09T00:00:10.000Z", txHash: hash(1) },
    { type: "PAUSE_DEX", status: "PASS", occurredAt: "2026-09-09T00:00:20.000Z", txHash: hash(2) },
    { type: "PAUSE_ALL_SWAPS", status: "PASS", occurredAt: "2026-09-09T00:00:30.000Z", txHash: hash(3) },
    { type: "VERIFY_BLOCKED", status: "PASS", occurredAt: "2026-09-09T00:00:40.000Z", evidence: "swap reverted with SwapsPaused" },
    { type: "SCHEDULE_RECOVERY", status: "PASS", occurredAt: "2026-09-09T00:01:00.000Z", txHash: hash(4) },
    { type: "VERIFY_TIMELOCK_BLOCKED", status: "PASS", occurredAt: "2026-09-09T00:01:10.000Z", evidence: "early execution reverted with NotReady" },
    { type: "EXECUTE_RECOVERY", status: "PASS", occurredAt: "2026-09-09T01:01:00.000Z", txHash: hash(5) },
    { type: "POST_RECOVERY_SWAP", status: "PASS", occurredAt: "2026-09-09T01:01:10.000Z", txHash: hash(6) }
  ]
});

describe("LQC emergency drill audit report", function () {
  it("generates deterministic, reviewable evidence for a complete drill", function () {
    const report = buildEmergencyDrillReport(base());
    assert.equal(report.result, "PASS");
    assert.equal(report.steps.length, 8);
    assert.match(report.evidenceDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(buildEmergencyDrillReport(base()).evidenceDigest, report.evidenceDigest);
  });

  it("rejects missing, failed, reordered, or unverifiable steps", function () {
    const missing = base(); missing.steps.pop();
    assert.throws(() => buildEmergencyDrillReport(missing), /exactly 8/);
    const failed = base(); failed.steps[3].status = "FAIL";
    assert.throws(() => buildEmergencyDrillReport(failed), /must pass/);
    const reordered = base(); [reordered.steps[0], reordered.steps[1]] = [reordered.steps[1], reordered.steps[0]];
    assert.throws(() => buildEmergencyDrillReport(reordered), /Step 1/);
    const unverifiable = base(); delete unverifiable.steps[0].txHash;
    assert.throws(() => buildEmergencyDrillReport(unverifiable), /transaction hash/);
  });

  it("rejects early recovery, wrong networks, and invalid source revisions", function () {
    const early = base(); early.steps[6].occurredAt = "2026-09-09T00:59:00.000Z";
    assert.throws(() => buildEmergencyDrillReport(early), /timelock delay/);
    const wrongChain = base(); wrongChain.network.chainId = 56;
    assert.throws(() => buildEmergencyDrillReport(wrongChain), /chain 97/);
    const badRevision = base(); badRevision.sourceRevision = "short";
    assert.throws(() => buildEmergencyDrillReport(badRevision), /commit SHA/);
  });
});
