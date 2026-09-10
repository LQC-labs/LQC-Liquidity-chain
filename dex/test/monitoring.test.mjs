import assert from "node:assert/strict";
import { ethers } from "ethers";
import { buildMonitoringReport } from "../scripts/monitor-bsc-testnet.mjs";

const vaultOwner = "0x0000000000000000000000000000000000000001";
const vaultPauseAdmin = "0x0000000000000000000000000000000000000002";
const vaultStrategyAdmin = "0x0000000000000000000000000000000000000003";

const healthyInput = () => ({
  checkedAt: "2026-09-09T00:02:00.000Z", block: { number: 123, timestamp: 1788912060 }, maxBlockAgeSeconds: 180,
  validation: { lqc: { contractCount: 6, dexCount: 3, swapsPaused: false } }, validationError: null,
  custody: [{ contract: "executionRouter", asset: "BNB", balance: "0" }, { contract: "executionRouter", asset: "lqc", balance: "0" }],
  ownership: [{ contract: "dexRegistry", owner: "0x0000000000000000000000000000000000000001", pendingOwner: ethers.ZeroAddress }],
  safeState: [{ name: "governance",
    owners: Array.from({ length: 7 }, (_, index) => `0x${(index + 10).toString(16).padStart(40, "0")}`),
    expectedOwners: Array.from({ length: 7 }, (_, index) => `0x${(index + 10).toString(16).padStart(40, "0")}`),
    threshold: 4, expectedThreshold: 4, minimumOwners: 7, minimumThreshold: 4 }],
  vaultState: { accountedAssets: "1000", strategyDebt: "100", strategyCap: "200", expectedStrategyCap: "200",
    maxLossBps: "100", expectedMaxLossBps: "100", idleBalance: "900",
    adapterManagedAssets: "100", adapterBalance: "100", depositsPaused: false, allocationsPaused: false, insolvent: false,
    owner: vaultOwner, expectedOwner: vaultOwner, pauseAdmin: vaultPauseAdmin, expectedPauseAdmin: vaultPauseAdmin,
    strategyAdmin: vaultStrategyAdmin, expectedStrategyAdmin: vaultStrategyAdmin }
});

describe("LQC BSC testnet monitoring report", function () {
  it("reports a healthy, fresh, zero-custody deployment", function () {
    const report = buildMonitoringReport(healthyInput());
    assert.equal(report.status, "HEALTHY");
    assert.equal(report.counts.critical, 0);
    assert.equal(report.checks.every(check => check.status === "PASS"), true);
    assert.equal(report.incident, null);
  });

  it("fails closed for stale blocks, validation failures, or retained funds", function () {
    const input = healthyInput(); input.block.timestamp -= 1000; input.validation = null;
    input.validationError = "registry ownership mismatch"; input.custody[0].balance = "1";
    const report = buildMonitoringReport(input);
    assert.equal(report.status, "CRITICAL");
    assert.equal(report.counts.critical, 3);
  });

  it("creates a governed response when deployment validation detects configuration drift", function () {
    const input = healthyInput();
    input.validation = null;
    input.validationError = "DEX adapter configuration mismatch";
    const report = buildMonitoringReport(input);

    assert.equal(report.status, "CRITICAL");
    assert.equal(report.incident.code, "DEPLOYMENT_CONFIGURATION_DRIFT");
    assert.equal(report.incident.automaticTransactions, false);
    assert.deepEqual(report.incident.actions.map(action => action.gate),
      ["GUARDIAN_MULTISIG", "EVIDENCE_REVIEW", "CONFIGURATION_REVIEW", "TIMELOCK", "POST_CHECK"]);
  });

  it("creates a pause and governed recovery response for retained Router funds", function () {
    const input = healthyInput();
    input.custody[0].balance = "1";
    const report = buildMonitoringReport(input);

    assert.equal(report.incident.code, "ROUTER_CUSTODY_BREACH");
    assert.equal(report.incident.severity, "CRITICAL");
    assert.equal(report.incident.automaticTransactions, false);
    assert.deepEqual(report.incident.triggers, ["custody.executionRouter.BNB"]);
    assert.deepEqual(report.incident.actions.map(action => action.gate),
      ["GUARDIAN_MULTISIG", "EVIDENCE_REVIEW", "CUSTODY_REVIEW", "TIMELOCK", "POST_CHECK"]);
  });

  it("surfaces emergency pauses and pending ownership transfers as warnings", function () {
    const input = healthyInput(); input.validation.lqc.swapsPaused = true;
    input.ownership[0].pendingOwner = "0x0000000000000000000000000000000000000002";
    const report = buildMonitoringReport(input);
    assert.equal(report.status, "WARNING");
    assert.equal(report.counts.warning, 2);
  });

  it("fails closed for Vault insolvency, cap breaches, or backing mismatches", function () {
    const input = healthyInput();
    input.vaultState = { ...input.vaultState, strategyDebt: "300", idleBalance: "1", adapterManagedAssets: "299", insolvent: true };
    const report = buildMonitoringReport(input);
    assert.equal(report.status, "CRITICAL");
    assert.equal(report.checks.filter(check => check.id.startsWith("vault.") && check.status === "CRITICAL").length, 4);
  });

  it("creates a shutdown and governed recovery response for Vault backing breaches", function () {
    const input = healthyInput();
    input.vaultState = { ...input.vaultState, strategyDebt: "300", idleBalance: "1",
      adapterManagedAssets: "299", insolvent: true };
    const report = buildMonitoringReport(input);

    assert.equal(report.incident.code, "VAULT_BACKING_BREACH");
    assert.equal(report.incident.severity, "CRITICAL");
    assert.equal(report.incident.automaticTransactions, false);
    assert.deepEqual(report.incident.triggers,
      ["vault.solvency", "vault.strategy_exposure", "vault.idle_backing", "vault.adapter_backing"]);
    assert.deepEqual(report.incident.actions.map(action => action.gate),
      ["RISK_MULTISIG", "EVIDENCE_REVIEW", "STRATEGY_REVIEW", "TIMELOCK", "POST_CHECK"]);
  });

  it("reports Vault emergency pauses as warnings without treating expected custody as Router residue", function () {
    const input = healthyInput();
    input.vaultState.depositsPaused = true;
    input.vaultState.allocationsPaused = true;
    const report = buildMonitoringReport(input);
    assert.equal(report.status, "WARNING");
    assert.equal(report.counts.warning, 2);
  });

  it("treats the recorded initial allocation pause as healthy and fails closed on drift", function () {
    const expected = healthyInput();
    expected.vaultState.allocationsPaused = true;
    expected.vaultState.expectedAllocationsPaused = true;
    const healthy = buildMonitoringReport(expected);
    assert.equal(healthy.checks.find(check => check.id === "vault.allocation_status").status, "PASS");
    assert.equal(healthy.status, "HEALTHY");

    expected.vaultState.allocationsPaused = false;
    const drifted = buildMonitoringReport(expected);
    assert.equal(drifted.checks.find(check => check.id === "vault.allocation_status").status, "CRITICAL");
    assert.equal(drifted.status, "CRITICAL");
  });

  it("creates a non-automatic multisig and Timelock response for allocation-state drift", function () {
    const input = healthyInput();
    input.vaultState.expectedAllocationsPaused = true;
    const report = buildMonitoringReport(input);

    assert.equal(report.incident.code, "VAULT_ALLOCATION_STATE_DRIFT");
    assert.equal(report.incident.severity, "CRITICAL");
    assert.equal(report.incident.automaticTransactions, false);
    assert.deepEqual(report.incident.actions.map(action => action.gate),
      ["RISK_MULTISIG", "EVIDENCE_REVIEW", "RISK_REVIEW", "TIMELOCK", "POST_CHECK"]);
  });

  it("fails closed on Strategy limit expansion and emits a non-automatic response", function () {
    const input = healthyInput();
    input.vaultState.strategyCap = "201";
    input.vaultState.maxLossBps = "101";
    const report = buildMonitoringReport(input);

    assert.equal(report.status, "CRITICAL");
    assert.equal(report.checks.find(check => check.id === "vault.strategy_limits").status, "CRITICAL");
    assert.equal(report.incident.code, "VAULT_STRATEGY_LIMIT_EXPANSION");
    assert.equal(report.incident.automaticTransactions, false);
    assert.deepEqual(report.incident.actions.map(action => action.gate),
      ["RISK_MULTISIG", "EVIDENCE_REVIEW", "RISK_REVIEW", "TIMELOCK", "POST_CHECK"]);
  });

  it("fails closed on Vault role drift and emits a governed access-recovery response", function () {
    const input = healthyInput();
    input.vaultState.strategyAdmin = "0x0000000000000000000000000000000000000099";
    const report = buildMonitoringReport(input);

    assert.equal(report.status, "CRITICAL");
    assert.equal(report.checks.find(check => check.id === "vault.role_integrity").status, "CRITICAL");
    assert.equal(report.incident.code, "VAULT_ROLE_DRIFT");
    assert.equal(report.incident.automaticTransactions, false);
    assert.deepEqual(report.incident.actions.map(action => action.gate),
      ["GUARDIAN_MULTISIG", "EVIDENCE_REVIEW", "ACCESS_REVIEW", "TIMELOCK", "POST_CHECK"]);
  });

  it("warns on safer Strategy limit drift until governance records the new baseline", function () {
    const input = healthyInput();
    input.vaultState.strategyCap = "150";
    input.vaultState.maxLossBps = "50";
    const report = buildMonitoringReport(input);

    assert.equal(report.status, "WARNING");
    assert.equal(report.checks.find(check => check.id === "vault.strategy_limits").status, "WARNING");
    assert.equal(report.incident.code, "VAULT_STRATEGY_LIMIT_REVIEW");
    assert.deepEqual(report.incident.actions.map(action => action.gate),
      ["EVIDENCE_REVIEW", "GOVERNANCE_MULTISIG", "POST_CHECK"]);
  });

  it("fails closed when a Safe threshold or signer count drops below policy", function () {
    const input = healthyInput();
    input.safeState[0].owners = input.safeState[0].owners.slice(0, 5);
    input.safeState[0].threshold = 2;
    const report = buildMonitoringReport(input);
    assert.equal(report.status, "CRITICAL");
    assert.equal(report.checks.find(check => check.id === "multisig.governance.policy").status, "CRITICAL");
    assert.equal(report.checks.find(check => check.id === "multisig.governance.threshold").status, "CRITICAL");
    assert.equal(report.incident.code, "SAFE_POLICY_BREACH");
    assert.equal(report.incident.automaticTransactions, false);
    assert.deepEqual(report.incident.actions.map(action => action.gate),
      ["GUARDIAN_MULTISIG", "EVIDENCE_REVIEW", "SAFE_MULTISIG", "TIMELOCK", "POST_CHECK"]);
  });

  it("warns when Safe signers change without weakening the approved policy", function () {
    const input = healthyInput();
    input.safeState[0].owners[0] = "0x0000000000000000000000000000000000000063";
    const report = buildMonitoringReport(input);
    assert.equal(report.status, "WARNING");
    assert.equal(report.checks.find(check => check.id === "multisig.governance.signers").status, "WARNING");
    assert.equal(report.incident.code, "SAFE_POLICY_REVIEW");
    assert.equal(report.incident.actions[0].gate, "EVIDENCE_REVIEW");
  });
});
