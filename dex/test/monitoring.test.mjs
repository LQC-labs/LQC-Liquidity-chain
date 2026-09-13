import assert from "node:assert/strict";
import { ethers } from "ethers";
import { buildMonitoringReport, fetchIndexerHealth, readSafePolicyAtBlock } from "../scripts/monitor-bsc-testnet.mjs";

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

  it("isolates a stale RPC and requires independent chain confirmation", function () {
    const input = healthyInput();
    input.block.timestamp -= 1000;
    const report = buildMonitoringReport(input);

    assert.equal(report.status, "CRITICAL");
    assert.equal(report.incident.code, "CHAIN_DATA_STALE");
    assert.equal(report.incident.severity, "CRITICAL");
    assert.equal(report.incident.automaticTransactions, false);
    assert.deepEqual(report.incident.triggers, ["chain.block_freshness"]);
    assert.deepEqual(report.incident.actions.map(action => action.gate),
      ["DATA_SOURCE_FAIL_CLOSED", "INDEPENDENT_RPC", "GUARDIAN_MULTISIG", "POST_CHECK"]);
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
    assert.equal(report.incident.code, "OWNERSHIP_TRANSFER_REVIEW");
    assert.equal(report.incident.severity, "WARNING");
    assert.equal(report.incident.automaticTransactions, false);
    assert.deepEqual(report.incident.triggers, ["ownership.dexRegistry.pending"]);
    assert.deepEqual(report.incident.actions.map(action => action.gate),
      ["EVIDENCE_REVIEW", "GOVERNANCE_MULTISIG", "OWNERSHIP_DECISION", "POST_CHECK"]);
  });

  it("requires governed review before an emergency swap pause is lifted", function () {
    const input = healthyInput();
    input.validation.lqc.swapsPaused = true;
    const report = buildMonitoringReport(input);

    assert.equal(report.status, "WARNING");
    assert.equal(report.incident.code, "SWAP_PAUSE_REVIEW");
    assert.equal(report.incident.severity, "WARNING");
    assert.equal(report.incident.automaticTransactions, false);
    assert.deepEqual(report.incident.triggers, ["protocol.swap_status"]);
    assert.deepEqual(report.incident.actions.map(action => action.gate),
      ["EVIDENCE_REVIEW", "INCIDENT_CLASSIFICATION", "RISK_REVIEW", "TIMELOCK", "POST_CHECK"]);
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
    assert.equal(report.incident.code, "VAULT_OPERATION_PAUSE_REVIEW");
    assert.equal(report.incident.severity, "WARNING");
    assert.equal(report.incident.automaticTransactions, false);
    assert.deepEqual(report.incident.triggers, ["vault.deposit_status", "vault.allocation_status"]);
    assert.deepEqual(report.incident.actions.map(action => action.gate),
      ["EVIDENCE_REVIEW", "USER_PROTECTION", "STRATEGY_REVIEW", "GOVERNANCE_OWNER", "POST_CHECK"]);
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

  it("fails closed when a Safe threshold or signer count exceeds the exact approved policy", function () {
    const threshold = healthyInput(); threshold.safeState[0].threshold = 5;
    const thresholdReport = buildMonitoringReport(threshold);
    assert.equal(thresholdReport.status, "CRITICAL");
    assert.equal(thresholdReport.checks.find(check => check.id === "multisig.governance.threshold").status, "CRITICAL");
    const signerCount = healthyInput(); signerCount.safeState[0].owners.push("0x0000000000000000000000000000000000000063");
    const signerReport = buildMonitoringReport(signerCount);
    assert.equal(signerReport.status, "CRITICAL");
    assert.equal(signerReport.checks.find(check => check.id === "multisig.governance.policy").status, "CRITICAL");
    assert.equal(signerReport.incident.code, "SAFE_POLICY_BREACH");
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

  it("fails closed when signer rotation creates cross-Safe threshold control", function () {
    const input = healthyInput(), shared = input.safeState[0].owners.slice(0, 4);
    input.safeState.push({ name: "risk", owners: [...shared, "0x0000000000000000000000000000000000000061"], expectedOwners: ["0x0000000000000000000000000000000000000041", "0x0000000000000000000000000000000000000042", "0x0000000000000000000000000000000000000043", "0x0000000000000000000000000000000000000044", "0x0000000000000000000000000000000000000045"], threshold: 3, expectedThreshold: 3, minimumOwners: 5, minimumThreshold: 3 });
    const report = buildMonitoringReport(input);
    const check = report.checks.find(item => item.id === "multisig.cross.governance.risk");
    assert.equal(check.status, "CRITICAL");
    assert.equal(report.status, "CRITICAL");
    assert.equal(report.incident.code, "SAFE_POLICY_BREACH");
  });

  it("detects threshold control shared only by Risk and Guardian Safes", function () {
    const input = healthyInput();
    const shared = input.safeState[0].owners.slice(0, 3);
    input.safeState.push(
      { name: "risk", owners: [...shared, "0x0000000000000000000000000000000000000061", "0x0000000000000000000000000000000000000062"], expectedOwners: Array.from({ length: 5 }, (_, index) => `0x${(index + 40).toString(16).padStart(40, "0")}`), threshold: 3, expectedThreshold: 3, minimumOwners: 5, minimumThreshold: 3 },
      { name: "guardian", owners: [...shared, "0x0000000000000000000000000000000000000071", "0x0000000000000000000000000000000000000072"], expectedOwners: Array.from({ length: 5 }, (_, index) => `0x${(index + 50).toString(16).padStart(40, "0")}`), threshold: 3, expectedThreshold: 3, minimumOwners: 5, minimumThreshold: 3 }
    );
    const report = buildMonitoringReport(input);
    const check = report.checks.find(item => item.id === "multisig.cross.risk.guardian");
    assert.equal(check.status, "CRITICAL");
    assert.equal(report.incident.code, "SAFE_POLICY_BREACH");
    assert.equal(report.incident.triggers.includes(check.id), true);
  });

  it("fails closed when a Safe enables a threshold-bypassing module", function () {
    const input = healthyInput();
    input.safeState[0].modules = ["0x0000000000000000000000000000000000000081"];
    const report = buildMonitoringReport(input);
    const check = report.checks.find(item => item.id === "multisig.governance.modules");
    assert.equal(check.status, "CRITICAL");
    assert.equal(report.status, "CRITICAL");
    assert.equal(report.incident.code, "SAFE_POLICY_BREACH");
    assert.equal(report.incident.triggers.includes(check.id), true);
    assert.equal(report.incident.automaticTransactions, false);
  });

  it("fails closed when a Safe enables an unapproved guard or fallback handler", function () {
    for (const extension of ["fallbackHandler", "transactionGuard", "moduleGuard"]) {
      const input = healthyInput();
      input.safeState[0].extensions = { [extension]: "0x0000000000000000000000000000000000000082" };
      const report = buildMonitoringReport(input);
      assert.equal(report.checks.find(item => item.id === `multisig.governance.${extension}`).status, "CRITICAL");
      assert.equal(report.incident.code, "SAFE_POLICY_BREACH");
    }
  });

  it("reads every Safe policy field from one pinned block", async function () {
    const observations = [];
    const record = (name, value) => (...args) => {
      observations.push({ name, blockTag: args.at(-1)?.blockTag });
      return Promise.resolve(value);
    };
    const safe = {
      getOwners: record("owners", healthyInput().safeState[0].owners),
      getThreshold: record("threshold", 4n),
      masterCopy: record("singleton", "0x0000000000000000000000000000000000000099"),
      getModulesPaginated: record("modules", [[], "0x0000000000000000000000000000000000000001"]),
      getStorageAt: record("storage", `0x${"00".repeat(32)}`)
    };
    const snapshot = await readSafePolicyAtBlock(safe, 123);
    assert.equal(snapshot.threshold, 4);
    assert.equal(snapshot.modules.length, 0);
    assert.equal(observations.length, 7);
    assert.deepEqual([...new Set(observations.map(item => item.blockTag))], [123]);
    await assert.rejects(() => readSafePolicyAtBlock(safe, -1), /non-negative integer/);
  });

  it("fails closed when operational Safes use different implementations", function () {
    const input = healthyInput();
    input.safeState.push({ name: "risk", singleton: "0x0000000000000000000000000000000000000099",
      owners: ["0x0000000000000000000000000000000000000041", "0x0000000000000000000000000000000000000042", "0x0000000000000000000000000000000000000043"],
      expectedOwners: [], threshold: 3, expectedThreshold: 3, minimumOwners: 3, minimumThreshold: 3 });
    input.safeState[0].singleton = "0x0000000000000000000000000000000000000098";
    const report = buildMonitoringReport(input);
    const check = report.checks.find(item => item.id === "multisig.cross.governance.risk.singleton");
    assert.equal(check.status, "CRITICAL");
    assert.equal(report.incident.code, "SAFE_POLICY_BREACH");
  });

  it("fails closed when a Safe implementation has no bytecode at the pinned block", function () {
    const input = healthyInput();
    input.safeState[0].singleton = "0x0000000000000000000000000000000000000099";
    input.safeState[0].implementationCode = "0x";
    const report = buildMonitoringReport(input);
    const check = report.checks.find(item => item.id === "multisig.governance.implementation_code");
    assert.equal(check.status, "CRITICAL");
    assert.equal(report.incident.code, "SAFE_POLICY_BREACH");
    input.safeState[0].implementationCode = "0x6000";
    assert.equal(buildMonitoringReport(input).checks.find(item => item.id === "multisig.governance.implementation_code").status, "PASS");
  });

  it("includes a healthy candle indexer in the operational report", function () {
    const input=healthyInput();input.indexerState={ready:true,chainId:97,cursor:100,finalizedHead:99,lagBlocks:0,reorgCount:0,lastReorgAt:null};
    const report=buildMonitoringReport(input);
    assert.equal(report.status,"HEALTHY");assert.equal(report.checks.find(check=>check.id==="indexer.readiness").status,"PASS");
  });

  it("fails candle publication closed without automatically pausing swaps", function () {
    const input=healthyInput();input.indexerError="connection refused";
    const report=buildMonitoringReport(input);
    assert.equal(report.status,"CRITICAL");assert.equal(report.incident.code,"CANDLE_INDEXER_UNAVAILABLE");assert.equal(report.incident.automaticTransactions,false);
    assert.deepEqual(report.incident.actions.map(action=>action.gate),["CHART_DATA_FAIL_CLOSED","SERVICE_RECOVERY","CANONICAL_CHAIN_REVIEW","POST_CHECK"]);
  });

  it("warns after a recent recovered reorg", function () {
    const input=healthyInput(),checkedAtMs=new Date(input.checkedAt).getTime();input.indexerState={ready:true,chainId:97,cursor:100,finalizedHead:99,lagBlocks:0,reorgCount:1,lastReorgAt:checkedAtMs-30000};
    const report=buildMonitoringReport(input);
    assert.equal(report.status,"WARNING");assert.equal(report.incident.code,"CANDLE_INDEXER_REORG_REVIEW");
  });

  it("validates the dedicated indexer readiness endpoint", async function () {
    const payload={ready:true,chainId:97,cursor:100,reorgCount:0};
    const value=await fetchIndexerHealth("http://127.0.0.1:8787/ready",{fetchImpl:async()=>({ok:true,json:async()=>payload})});assert.deepEqual(value,payload);
    await assert.rejects(()=>fetchIndexerHealth("http://indexer.example/ready",{fetchImpl:async()=>{throw new Error("must not fetch")}}),/HTTPS or loopback/);
    await assert.rejects(()=>fetchIndexerHealth("https://indexer.example/ready",{fetchImpl:async()=>({ok:true,json:async()=>({ready:true,chainId:56,cursor:1,reorgCount:0})})}),/invalid/);
  });
});
