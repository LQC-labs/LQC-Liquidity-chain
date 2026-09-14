import assert from "node:assert/strict";
import { buildMinimalRouterReport } from "../scripts/monitor-minimal-router.mjs";

const address = value => `0x${value.toString(16).padStart(40, "0")}`;
const healthy = () => ({ checkedAt: "2026-09-14T07:10:00.000Z", blockNumber: 130938158,
  router: address(1), expectedFactory: address(2), expectedWbnb: address(3),
  observedFactory: address(2), observedWbnb: address(3), balances: [
    { asset: "BNB", balance: "0" }, { asset: "tLQC", balance: "0" }, { asset: "WBNB", balance: "0" }
  ] });

describe("LQC minimal testnet Router monitoring", function () {
  it("reports healthy only when bindings match and no swap funds remain", function () {
    const report = buildMinimalRouterReport(healthy());
    assert.equal(report.status, "HEALTHY");
    assert.deepEqual(report.counts, { pass: 5, critical: 0 });
  });

  it("fails closed when a Router binding changes", function () {
    const input = healthy(); input.observedFactory = address(9);
    const report = buildMinimalRouterReport(input);
    assert.equal(report.status, "CRITICAL");
    assert.equal(report.checks.find(check => check.id === "binding.factory").status, "CRITICAL");
  });

  it("fails closed when native or token funds remain in the Router", function () {
    const input = healthy(); input.balances[0].balance = "1"; input.balances[1].balance = "10";
    const report = buildMinimalRouterReport(input);
    assert.equal(report.status, "CRITICAL");
    assert.equal(report.counts.critical, 2);
  });

  it("rejects incomplete, duplicate, or invalid balance evidence", function () {
    assert.throws(() => buildMinimalRouterReport({ ...healthy(), balances: [] }), /incomplete/);
    const duplicate = healthy(); duplicate.balances[2].asset = "tLQC";
    assert.throws(() => buildMinimalRouterReport(duplicate), /ambiguous/);
    const invalid = healthy(); invalid.balances[0].balance = "-1";
    assert.throws(() => buildMinimalRouterReport(invalid), /Invalid BNB balance/);
  });
});
