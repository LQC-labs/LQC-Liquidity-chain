import assert from "node:assert/strict";
import { ethers } from "ethers";
import { buildMonitoringReport } from "../scripts/monitor-bsc-testnet.mjs";

const healthyInput = () => ({
  checkedAt: "2026-09-09T00:02:00.000Z", block: { number: 123, timestamp: 1788912060 }, maxBlockAgeSeconds: 180,
  validation: { lqc: { contractCount: 6, dexCount: 3, swapsPaused: false } }, validationError: null,
  custody: [{ contract: "executionRouter", asset: "BNB", balance: "0" }, { contract: "executionRouter", asset: "lqc", balance: "0" }],
  ownership: [{ contract: "dexRegistry", owner: "0x0000000000000000000000000000000000000001", pendingOwner: ethers.ZeroAddress }]
});

describe("LQC BSC testnet monitoring report", function () {
  it("reports a healthy, fresh, zero-custody deployment", function () {
    const report = buildMonitoringReport(healthyInput());
    assert.equal(report.status, "HEALTHY");
    assert.equal(report.counts.critical, 0);
    assert.equal(report.checks.every(check => check.status === "PASS"), true);
  });

  it("fails closed for stale blocks, validation failures, or retained funds", function () {
    const input = healthyInput(); input.block.timestamp -= 1000; input.validation = null;
    input.validationError = "registry ownership mismatch"; input.custody[0].balance = "1";
    const report = buildMonitoringReport(input);
    assert.equal(report.status, "CRITICAL");
    assert.equal(report.counts.critical, 3);
  });

  it("surfaces emergency pauses and pending ownership transfers as warnings", function () {
    const input = healthyInput(); input.validation.lqc.swapsPaused = true;
    input.ownership[0].pendingOwner = "0x0000000000000000000000000000000000000002";
    const report = buildMonitoringReport(input);
    assert.equal(report.status, "WARNING");
    assert.equal(report.counts.warning, 2);
  });
});
