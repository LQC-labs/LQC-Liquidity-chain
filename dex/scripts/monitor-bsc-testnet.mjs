import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { validateBscTestnet } from "./validate-bsc-testnet.mjs";

const BALANCE_ABI = ["function balanceOf(address) view returns(uint256)"];
const OWNABLE_ABI = ["function owner() view returns(address)", "function pendingOwner() view returns(address)"];
const SAFE_ABI = ["function getOwners() view returns(address[])", "function getThreshold() view returns(uint256)"];

export function buildIncidentResponse(checks) {
  const staleBlock = checks.find(check =>
    check.id === "chain.block_freshness" && check.status === "CRITICAL");
  if (staleBlock) return {
    code: "CHAIN_DATA_STALE", severity: "CRITICAL", automaticTransactions: false,
    triggers: [staleBlock.id],
    actions: [
      { order: 1, gate: "DATA_SOURCE_FAIL_CLOSED", action: "Stop route publication and transaction submission from the affected RPC; do not make on-chain decisions from stale data." },
      { order: 2, gate: "INDEPENDENT_RPC", action: "Compare the latest finalized block, timestamp, chain id, and block hash through at least one independent BSC testnet provider." },
      { order: 3, gate: "GUARDIAN_MULTISIG", action: "Pause swaps only when an independent fresh provider confirms a chain-level or protocol safety condition requiring intervention." },
      { order: 4, gate: "POST_CHECK", action: "Restore monitoring and transaction submission only after block freshness and full deployment validation pass on independent providers." }
    ]
  };
  const indexerFailure = checks.find(check => check.id === "indexer.readiness" && check.status === "CRITICAL");
  if (indexerFailure) return {
    code: "CANDLE_INDEXER_UNAVAILABLE", severity: "CRITICAL", automaticTransactions: false,
    triggers: [indexerFailure.id],
    actions: [
      { order: 1, gate: "CHART_DATA_FAIL_CLOSED", action: "Stop publishing historical candles from the affected indexer while keeping Router quotes and swap execution independently validated." },
      { order: 2, gate: "SERVICE_RECOVERY", action: "Restore RPC connectivity or restart the indexer from its durable checkpoint without deleting recovery evidence." },
      { order: 3, gate: "CANONICAL_CHAIN_REVIEW", action: "Verify the finalized cursor, block-hash anchors, lag, and recent reorg history against an independent BSC testnet provider." },
      { order: 4, gate: "POST_CHECK", action: "Republish candle history only after readiness is healthy and sampled candles match canonical Swap logs." }
    ]
  };
  const safeChecks = checks.filter(check => check.id.startsWith("multisig."));
  const critical = safeChecks.filter(check => check.status === "CRITICAL");
  const warnings = safeChecks.filter(check => check.status === "WARNING");
  if (critical.length) return {
    code: "SAFE_POLICY_BREACH", severity: "CRITICAL", automaticTransactions: false,
    triggers: critical.map(check => check.id),
    actions: [
      { order: 1, gate: "GUARDIAN_MULTISIG", action: "Approve and submit EmergencyController.pauseAllSwaps; never use a single EOA." },
      { order: 2, gate: "EVIDENCE_REVIEW", action: "Pin the detection block, Safe owners, threshold, transactions, and deployment record before remediation." },
      { order: 3, gate: "SAFE_MULTISIG", action: "Restore the reviewed signer set and threshold; rotate any suspected signer credentials." },
      { order: 4, gate: "TIMELOCK", action: "Schedule protocol recovery only after the Safe policy and every deployment validation pass." },
      { order: 5, gate: "POST_CHECK", action: "Execute recovery after the timelock, rerun monitoring, and publish the incident disposition." }
    ]
  };
  const custodyBreaches = checks.filter(check =>
    check.id.startsWith("custody.") && check.status === "CRITICAL");
  if (custodyBreaches.length) return {
    code: "ROUTER_CUSTODY_BREACH", severity: "CRITICAL", automaticTransactions: false,
    triggers: custodyBreaches.map(check => check.id),
    actions: [
      { order: 1, gate: "GUARDIAN_MULTISIG", action: "Approve and submit EmergencyController.pauseAllSwaps immediately; never use a single EOA." },
      { order: 2, gate: "EVIDENCE_REVIEW", action: "Pin the detection block, retained balances, affected contracts and assets, related transactions, and deployment record." },
      { order: 3, gate: "CUSTODY_REVIEW", action: "Identify the failed settlement path and verify a reviewed recovery operation without granting new standing approvals." },
      { order: 4, gate: "TIMELOCK", action: "Schedule and execute the reviewed recovery only after governance approval and the configured delay." },
      { order: 5, gate: "POST_CHECK", action: "Confirm zero Router and Adapter custody, zero residual approvals, and passing deployment validation before resuming swaps." }
    ]
  };
  const deploymentDrift = checks.find(check =>
    check.id === "deployment.configuration" && check.status === "CRITICAL");
  if (deploymentDrift) return {
    code: "DEPLOYMENT_CONFIGURATION_DRIFT", severity: "CRITICAL", automaticTransactions: false,
    triggers: [deploymentDrift.id],
    actions: [
      { order: 1, gate: "GUARDIAN_MULTISIG", action: "Pause all swaps and disable affected DEX routes with the authorized multisig." },
      { order: 2, gate: "EVIDENCE_REVIEW", action: "Pin the detection block, validation error, contract bytecode, roles, adapters, limits, pools, and deployment record." },
      { order: 3, gate: "CONFIGURATION_REVIEW", action: "Classify the drift as unauthorized, failed deployment, or approved but unrecorded governance change." },
      { order: 4, gate: "TIMELOCK", action: "Restore the reviewed configuration or approve a new baseline only through governance and the configured delay." },
      { order: 5, gate: "POST_CHECK", action: "Rerun full deployment validation, route probes, custody checks, and monitoring before resuming swaps." }
    ]
  };
  const roleDrift = checks.find(check => check.id === "vault.role_integrity" && check.status === "CRITICAL");
  if (roleDrift) return {
    code: "VAULT_ROLE_DRIFT", severity: "CRITICAL", automaticTransactions: false,
    triggers: [roleDrift.id],
    actions: [
      { order: 1, gate: "GUARDIAN_MULTISIG", action: "Pause Vault deposits and allocations with the authorized multisig where authority remains available." },
      { order: 2, gate: "EVIDENCE_REVIEW", action: "Pin the detection block, current and expected roles, ownership events, pending transfers, and governance transactions." },
      { order: 3, gate: "ACCESS_REVIEW", action: "Identify the unauthorized role change and rotate any compromised signer or administrator credentials." },
      { order: 4, gate: "TIMELOCK", action: "Restore the reviewed owner, pause administrator, and Strategy administrator only through approved governance." },
      { order: 5, gate: "POST_CHECK", action: "Rerun role validation and monitoring before reopening Vault operations." }
    ]
  };
  const backingIds = new Set([
    "vault.solvency", "vault.strategy_exposure", "vault.idle_backing", "vault.adapter_backing"
  ]);
  const backingBreaches = checks.filter(check => backingIds.has(check.id) && check.status === "CRITICAL");
  if (backingBreaches.length) return {
    code: "VAULT_BACKING_BREACH", severity: "CRITICAL", automaticTransactions: false,
    triggers: backingBreaches.map(check => check.id),
    actions: [
      { order: 1, gate: "RISK_MULTISIG", action: "Approve and submit LiquidityVault.pauseDeposits and pauseAllocations immediately; do not use a single EOA." },
      { order: 2, gate: "EVIDENCE_REVIEW", action: "Pin the detection block, Vault accounting, token balances, Strategy reports, limits, and related events." },
      { order: 3, gate: "STRATEGY_REVIEW", action: "Assess Strategy recall safety, loss bounds, token behavior, and whether emergency reconciliation is required." },
      { order: 4, gate: "TIMELOCK", action: "Execute only the reviewed recall, reconciliation, limit, or recovery operation after governance approval." },
      { order: 5, gate: "POST_CHECK", action: "Confirm full backing, zero unauthorized exposure, and passing validation before reopening any operation." }
    ]
  };
  const allocationDrift = checks.find(check =>
    check.id === "vault.allocation_status" && check.status === "CRITICAL");
  const strategyLimitDrift = checks.find(check =>
    check.id === "vault.strategy_limits" && check.status !== "PASS");
  if (strategyLimitDrift) return {
    code: strategyLimitDrift.status === "CRITICAL" ? "VAULT_STRATEGY_LIMIT_EXPANSION" : "VAULT_STRATEGY_LIMIT_REVIEW",
    severity: strategyLimitDrift.status, automaticTransactions: false,
    triggers: [strategyLimitDrift.id],
    actions: strategyLimitDrift.status === "CRITICAL" ? [
      { order: 1, gate: "RISK_MULTISIG", action: "Approve and submit LiquidityVault.pauseAllocations immediately; do not use a single EOA." },
      { order: 2, gate: "EVIDENCE_REVIEW", action: "Pin the detection block, Strategy limits, debt, events, Timelock operations, and deployment record." },
      { order: 3, gate: "RISK_REVIEW", action: "Confirm no exposure was added under the unapproved limits and reduce limits if authorization is absent." },
      { order: 4, gate: "TIMELOCK", action: "Approve any intended higher baseline only through a reviewed governance operation." },
      { order: 5, gate: "POST_CHECK", action: "Rerun deployment validation and monitoring before allocations resume." }
    ] : [
      { order: 1, gate: "EVIDENCE_REVIEW", action: "Verify the reduced Strategy limits against an approved governance transaction." },
      { order: 2, gate: "GOVERNANCE_MULTISIG", action: "Approve the safer baseline before updating the deployment record." },
      { order: 3, gate: "POST_CHECK", action: "Rerun validation and monitoring before closing the review." }
    ]
  };
  if (allocationDrift) return {
    code: "VAULT_ALLOCATION_STATE_DRIFT", severity: "CRITICAL", automaticTransactions: false,
    triggers: [allocationDrift.id],
    actions: [
      { order: 1, gate: "RISK_MULTISIG", action: "Approve and submit LiquidityVault.pauseAllocations immediately; do not use a single EOA." },
      { order: 2, gate: "EVIDENCE_REVIEW", action: "Pin the detection block, allocation state, Strategy debt, adapter balance, events, and deployment record." },
      { order: 3, gate: "RISK_REVIEW", action: "Verify whether Strategy exposure changed and pause deposits if backing or authorization cannot be confirmed." },
      { order: 4, gate: "TIMELOCK", action: "Restore or approve the intended allocation state only through a reviewed governance operation." },
      { order: 5, gate: "POST_CHECK", action: "Rerun deployment validation and monitoring before closing the incident." }
    ]
  };
  const pendingOwnership = checks.filter(check =>
    check.id.startsWith("ownership.") && check.id.endsWith(".pending") && check.status === "WARNING");
  if (pendingOwnership.length) return {
    code: "OWNERSHIP_TRANSFER_REVIEW", severity: "WARNING", automaticTransactions: false,
    triggers: pendingOwnership.map(check => check.id),
    actions: [
      { order: 1, gate: "EVIDENCE_REVIEW", action: "Pin the detection block, current owner, pending owner, transfer event, initiating transaction, and deployment record." },
      { order: 2, gate: "GOVERNANCE_MULTISIG", action: "Verify that every pending owner is the reviewed governance target and that the transfer has an approved proposal." },
      { order: 3, gate: "OWNERSHIP_DECISION", action: "Accept an approved transfer from the pending owner or cancel an unauthorized transfer from the current owner; never use an unreviewed EOA." },
      { order: 4, gate: "POST_CHECK", action: "Rerun deployment validation and monitoring, then update the deployment record only after the intended owner is active and no transfer remains pending." }
    ]
  };
  const swapPause = checks.find(check =>
    check.id === "protocol.swap_status" && check.status === "WARNING");
  if (swapPause) return {
    code: "SWAP_PAUSE_REVIEW", severity: "WARNING", automaticTransactions: false,
    triggers: [swapPause.id],
    actions: [
      { order: 1, gate: "EVIDENCE_REVIEW", action: "Pin the detection block, pause transaction, guardian approvals, affected DEX routes, risk limits, and monitoring evidence." },
      { order: 2, gate: "INCIDENT_CLASSIFICATION", action: "Confirm whether the pause is a planned exercise, operational precaution, or active security incident and assign an accountable reviewer." },
      { order: 3, gate: "RISK_REVIEW", action: "Verify Router custody, Vault backing, contract roles, adapter configuration, route probes, and the original pause condition before proposing recovery." },
      { order: 4, gate: "TIMELOCK", action: "Resume swaps only through the reviewed governance operation and configured delay; guardians must never bypass recovery governance." },
      { order: 5, gate: "POST_CHECK", action: "Rerun full deployment validation and monitoring, then record the recovery transaction and incident disposition." }
    ]
  };
  const vaultPauses = checks.filter(check =>
    (check.id === "vault.deposit_status" || check.id === "vault.allocation_status") &&
    check.status === "WARNING");
  if (vaultPauses.length) return {
    code: "VAULT_OPERATION_PAUSE_REVIEW", severity: "WARNING", automaticTransactions: false,
    triggers: vaultPauses.map(check => check.id),
    actions: [
      { order: 1, gate: "EVIDENCE_REVIEW", action: "Pin the detection block, pause transactions, administrator approvals, Vault accounting, Strategy debt, and deployment record." },
      { order: 2, gate: "USER_PROTECTION", action: "Confirm existing users can withdraw within available idle liquidity and publish any temporary operational limitation without promising recovery timing." },
      { order: 3, gate: "STRATEGY_REVIEW", action: "Verify solvency, idle and adapter backing, Strategy exposure, loss bounds, and the original pause condition before proposing any resume operation." },
      { order: 4, gate: "GOVERNANCE_OWNER", action: "Resume deposits or allocations only from the reviewed Vault owner after the applicable governance controls approve recovery." },
      { order: 5, gate: "POST_CHECK", action: "Rerun role, backing, limit, and deployment validation before closing the operational review." }
    ]
  };
  const indexerReorg = checks.find(check => check.id === "indexer.reorg_recovery" && check.status === "WARNING");
  if (indexerReorg) return {
    code: "CANDLE_INDEXER_REORG_REVIEW", severity: "WARNING", automaticTransactions: false,
    triggers: [indexerReorg.id],
    actions: [
      { order: 1, gate: "EVIDENCE_REVIEW", action: "Record the reorg time, old and replacement anchors, rewind block, and affected candle intervals." },
      { order: 2, gate: "CANONICAL_CHAIN_REVIEW", action: "Compare recovered Swap logs and candles against an independent finalized BSC testnet view." },
      { order: 3, gate: "POST_CHECK", action: "Close the review only after indexer readiness remains healthy beyond the configured warning window." }
    ]
  };
  if (warnings.length) return {
    code: "SAFE_POLICY_REVIEW", severity: "WARNING", automaticTransactions: false,
    triggers: warnings.map(check => check.id),
    actions: [
      { order: 1, gate: "EVIDENCE_REVIEW", action: "Verify the Safe change against an approved governance proposal and record its transaction hash." },
      { order: 2, gate: "GOVERNANCE_MULTISIG", action: "Reject or approve the new baseline; do not update the deployment record from an unverified change." },
      { order: 3, gate: "POST_CHECK", action: "Rerun validation and monitoring before closing the review." }
    ]
  };
  return null;
}

export function buildMonitoringReport({ checkedAt, block, maxBlockAgeSeconds, validation, validationError,
  custody, ownership, vaultState = null, safeState = [], indexerState = null, indexerError = null,
  indexerReorgWarningSeconds = 600 }) {
  const checks = [];
  const add = (id, status, detail) => checks.push({ id, status, detail });
  const age = Math.max(0, Math.floor(new Date(checkedAt).getTime() / 1000) - Number(block.timestamp));
  add("chain.block_freshness", age <= maxBlockAgeSeconds ? "PASS" : "CRITICAL",
    `latest block ${block.number} is ${age}s old (limit ${maxBlockAgeSeconds}s)`);
  add("deployment.configuration", validationError ? "CRITICAL" : "PASS",
    validationError || `${validation.lqc.contractCount} core contracts and ${validation.lqc.dexCount} DEX adapters verified`);
  if(indexerState||indexerError){
    const ready=!indexerError&&indexerState?.ready===true&&indexerState?.chainId===97;
    add("indexer.readiness",ready?"PASS":"CRITICAL",ready?`ready at finalized block ${indexerState.finalizedHead}; lag ${indexerState.lagBlocks} blocks`:"candle indexer health endpoint is unavailable, malformed, or not ready");
    if(ready){const checkedAtMs=new Date(checkedAt).getTime(),recent=Number.isInteger(indexerState.lastReorgAt)&&indexerState.lastReorgAt>0&&checkedAtMs-indexerState.lastReorgAt<=indexerReorgWarningSeconds*1000;add("indexer.reorg_recovery",recent?"WARNING":"PASS",recent?`reorg recovery reported within ${indexerReorgWarningSeconds}s warning window`:`${indexerState.reorgCount||0} recovered reorgs; no recent recovery warning`);}
  }
  if (validation) add("protocol.swap_status", validation.lqc.swapsPaused ? "WARNING" : "PASS",
    validation.lqc.swapsPaused ? "swaps are paused" : "swaps are enabled");
  for (const item of custody) add(`custody.${item.contract}.${item.asset}`,
    BigInt(item.balance) === 0n ? "PASS" : "CRITICAL", `${item.balance} base units held`);
  for (const item of ownership) add(`ownership.${item.contract}.pending`,
    item.pendingOwner === ethers.ZeroAddress ? "PASS" : "WARNING",
    item.pendingOwner === ethers.ZeroAddress ? "no pending ownership transfer" : `pending owner ${item.pendingOwner}`);
  for (const safe of safeState) {
    if (safe.error) {
      add(`multisig.${safe.name}.readability`, "CRITICAL", safe.error);
      continue;
    }
    const owners = safe.owners.map(owner => ethers.getAddress(owner));
    const expected = safe.expectedOwners.map(owner => ethers.getAddress(owner));
    const unique = new Set(owners.map(owner => owner.toLowerCase()));
    const validOwners = owners.length >= safe.minimumOwners && unique.size === owners.length &&
      !owners.some(owner => owner === ethers.ZeroAddress);
    add(`multisig.${safe.name}.policy`, validOwners && safe.threshold >= safe.minimumThreshold && safe.threshold <= owners.length
      ? "PASS" : "CRITICAL", `${safe.threshold}-of-${owners.length}; required minimum ${safe.minimumThreshold}-of-${safe.minimumOwners}`);
    const sameOwners = owners.length === expected.length &&
      [...unique].sort().every((owner, index) => owner === expected.map(item => item.toLowerCase()).sort()[index]);
    add(`multisig.${safe.name}.signers`, sameOwners ? "PASS" : "WARNING",
      sameOwners ? "signer set matches deployment record" : "signer set changed since deployment; governance review required");
    const thresholdStatus = safe.threshold < safe.expectedThreshold ? "CRITICAL" :
      safe.threshold === safe.expectedThreshold ? "PASS" : "WARNING";
    add(`multisig.${safe.name}.threshold`, thresholdStatus,
      safe.threshold === safe.expectedThreshold ? "threshold matches deployment record" :
        `threshold changed from ${safe.expectedThreshold} to ${safe.threshold}`);
  }
  if (vaultState) {
    const accounted = BigInt(vaultState.accountedAssets), debt = BigInt(vaultState.strategyDebt);
    const cap = BigInt(vaultState.strategyCap), idle = BigInt(vaultState.idleBalance);
    const managed = BigInt(vaultState.adapterManagedAssets), adapterBalance = BigInt(vaultState.adapterBalance);
    if (vaultState.expectedOwner && vaultState.expectedPauseAdmin && vaultState.expectedStrategyAdmin) {
      const matches = ethers.getAddress(vaultState.owner) === ethers.getAddress(vaultState.expectedOwner) &&
        ethers.getAddress(vaultState.pauseAdmin) === ethers.getAddress(vaultState.expectedPauseAdmin) &&
        ethers.getAddress(vaultState.strategyAdmin) === ethers.getAddress(vaultState.expectedStrategyAdmin);
      add("vault.role_integrity", matches ? "PASS" : "CRITICAL", matches
        ? "Vault owner, pause administrator, and Strategy administrator match the deployment record"
        : `live roles ${vaultState.owner}/${vaultState.pauseAdmin}/${vaultState.strategyAdmin}; expected ${vaultState.expectedOwner}/${vaultState.expectedPauseAdmin}/${vaultState.expectedStrategyAdmin}`);
    }
    const solventAccounting = debt <= accounted;
    add("vault.solvency", vaultState.insolvent || !solventAccounting ? "CRITICAL" : "PASS",
      vaultState.insolvent ? "vault reports insolvency" : solventAccounting ? "vault accounting is solvent" : "strategy debt exceeds accounted assets");
    add("vault.strategy_exposure", debt <= cap ? "PASS" : "CRITICAL", `${debt} strategy debt (cap ${cap})`);
    if (vaultState.expectedStrategyCap != null && vaultState.expectedMaxLossBps != null) {
      const expectedCap = BigInt(vaultState.expectedStrategyCap);
      const maxLossBps = BigInt(vaultState.maxLossBps);
      const expectedMaxLossBps = BigInt(vaultState.expectedMaxLossBps);
      const expanded = cap > expectedCap || maxLossBps > expectedMaxLossBps;
      const matches = cap === expectedCap && maxLossBps === expectedMaxLossBps;
      add("vault.strategy_limits", matches ? "PASS" : expanded ? "CRITICAL" : "WARNING",
        `${cap} cap / ${maxLossBps} loss bps; deployment baseline ${expectedCap} cap / ${expectedMaxLossBps} loss bps`);
    }
    add("vault.idle_backing", solventAccounting && idle >= accounted - debt ? "PASS" : "CRITICAL",
      `${idle} idle base units backing ${solventAccounting ? accounted - debt : 0n} accounted idle units`);
    add("vault.adapter_backing", managed === debt && adapterBalance >= managed ? "PASS" : "CRITICAL",
      `${adapterBalance} adapter base units backing ${managed} managed units and ${debt} vault debt`);
    add("vault.deposit_status", vaultState.depositsPaused ? "WARNING" : "PASS",
      vaultState.depositsPaused ? "vault deposits are paused" : "vault deposits are enabled");
    if (typeof vaultState.expectedAllocationsPaused === "boolean") {
      const matches = vaultState.allocationsPaused === vaultState.expectedAllocationsPaused;
      add("vault.allocation_status", matches ? "PASS" : "CRITICAL", matches
        ? `vault allocation state matches deployment record (${vaultState.allocationsPaused ? "paused" : "enabled"})`
        : `vault allocation state changed from ${vaultState.expectedAllocationsPaused ? "paused" : "enabled"} to ${vaultState.allocationsPaused ? "paused" : "enabled"}`);
    } else {
      add("vault.allocation_status", vaultState.allocationsPaused ? "WARNING" : "PASS",
        vaultState.allocationsPaused ? "vault allocations are paused" : "vault allocations are enabled");
    }
  }
  const counts = Object.fromEntries(["PASS", "WARNING", "CRITICAL"].map(status =>
    [status.toLowerCase(), checks.filter(check => check.status === status).length]));
  const incident = buildIncidentResponse(checks);
  return { schemaVersion: 2, checkedAt, network: { chainId: 97, latestBlock: Number(block.number), blockAgeSeconds: age },
    status: counts.critical ? "CRITICAL" : counts.warning ? "WARNING" : "HEALTHY", counts, checks, incident };
}

export async function fetchIndexerHealth(url,{fetchImpl=fetch,timeoutMs=5000}={}){
  const parsed=new URL(url);if(parsed.protocol!=="https:"&&!(parsed.protocol==="http:"&&["127.0.0.1","localhost","::1"].includes(parsed.hostname)))throw new Error("Indexer health URL must use HTTPS or loopback HTTP.");
  const response=await fetchImpl(parsed,{signal:AbortSignal.timeout(timeoutMs),headers:{accept:"application/json"}});
  const value=await response.json();
  if(!response.ok||typeof value?.ready!=="boolean"||value.chainId!==97||!Number.isInteger(value.cursor)||!Number.isInteger(value.reorgCount))throw new Error("Indexer health response is invalid.");
  return value;
}

export async function monitorBscTestnet({ provider, deployment, checkedAt = new Date().toISOString(), maxBlockAgeSeconds = 180,indexerHealthUrl=null,fetchImpl=fetch }) {
  const network = await provider.getNetwork();
  if (BigInt(network.chainId) !== 97n) throw new Error(`Refusing monitoring on chain ${network.chainId}; expected BSC testnet 97.`);
  const latest = await provider.getBlock("latest");
  if (!latest) throw new Error("Latest block is unavailable.");
  let validation = null, validationError = null;
  try { validation = await validateBscTestnet({ provider, deployment }); }
  catch (error) { validationError = error.message; }
  let indexerState=null,indexerError=null;
  if(indexerHealthUrl)try{indexerState=await fetchIndexerHealth(indexerHealthUrl,{fetchImpl});}catch{indexerError="health endpoint unavailable or malformed";}

  const monitored = ["executionRouter", "nativeRouter", "autoRouter"]
    .filter(name => ethers.isAddress(deployment?.contracts?.[name]?.address));
  const tokens = ["lqc", "mockUsdt", "wbnb"].filter(name => ethers.isAddress(deployment?.contracts?.[name]?.address));
  const custody = [];
  for (const contract of monitored) {
    const holder = deployment.contracts[contract].address;
    custody.push({ contract, asset: "BNB", balance: (await provider.getBalance(holder)).toString() });
    for (const token of tokens) {
      const erc20 = new ethers.Contract(deployment.contracts[token].address, BALANCE_ABI, provider);
      custody.push({ contract, asset: token, balance: (await erc20.balanceOf(holder)).toString() });
    }
  }
  const ownership = [];
  for (const contract of ["dexRegistry", "riskRegistry", "gasCostOracle", "liquidityVault"]) {
    const address = deployment?.contracts?.[contract]?.address;
    if (!ethers.isAddress(address)) continue;
    const owned = new ethers.Contract(address, OWNABLE_ABI, provider);
    ownership.push({ contract, owner: await owned.owner(), pendingOwner: await owned.pendingOwner() });
  }
  const safeState = [];
  for (const name of ["governance", "risk"]) {
    const policy = deployment?.multisigPolicies?.[name];
    if (!policy) continue;
    try {
      const safe = new ethers.Contract(policy.address, SAFE_ABI, provider);
      const [owners, threshold] = await Promise.all([safe.getOwners(), safe.getThreshold()]);
      safeState.push({ name, owners, threshold: Number(threshold), expectedOwners: policy.owners,
        expectedThreshold: Number(policy.threshold), minimumOwners: Number(policy.minimumOwners),
        minimumThreshold: Number(policy.minimumThreshold) });
    } catch (error) {
      safeState.push({ name, error: `cannot read Safe policy at ${policy.address}: ${error.message}` });
    }
  }
  let vaultState = null;
  const vaultAddress = deployment?.contracts?.liquidityVault?.address;
  const adapterAddress = deployment?.contracts?.idleStrategyAdapter?.address;
  const assetAddress = deployment?.contracts?.liquidityVault?.asset;
  if (ethers.isAddress(vaultAddress) && ethers.isAddress(adapterAddress) && ethers.isAddress(assetAddress)) {
    const vault = new ethers.Contract(vaultAddress, [
      "function accountedAssets() view returns(uint256)", "function strategyDebt() view returns(uint256)",
      "function strategyCap() view returns(uint256)", "function maxLossBps() view returns(uint256)",
      "function depositsPaused() view returns(bool)",
      "function allocationsPaused() view returns(bool)", "function isInsolvent() view returns(bool)",
      "function owner() view returns(address)", "function pauseAdmin() view returns(address)",
      "function strategyAdmin() view returns(address)"
    ], provider);
    const adapter = new ethers.Contract(adapterAddress, ["function totalManagedAssets() view returns(uint256)"], provider);
    const asset = new ethers.Contract(assetAddress, BALANCE_ABI, provider);
    const values = await Promise.all([
      vault.accountedAssets(), vault.strategyDebt(), vault.strategyCap(), vault.maxLossBps(),
      vault.depositsPaused(), vault.allocationsPaused(), vault.isInsolvent(), adapter.totalManagedAssets(),
      asset.balanceOf(vaultAddress), asset.balanceOf(adapterAddress), vault.owner(), vault.pauseAdmin(), vault.strategyAdmin()
    ]);
    vaultState = { accountedAssets: values[0], strategyDebt: values[1], strategyCap: values[2], maxLossBps: values[3],
      depositsPaused: values[4], allocationsPaused: values[5], insolvent: values[6],
      adapterManagedAssets: values[7], idleBalance: values[8], adapterBalance: values[9],
      owner: values[10], pauseAdmin: values[11], strategyAdmin: values[12],
      expectedOwner: deployment.liquidityVaultRoles?.owner,
      expectedPauseAdmin: deployment.liquidityVaultRoles?.pauseAdmin,
      expectedStrategyAdmin: deployment.liquidityVaultRoles?.strategyAdmin,
      expectedStrategyCap: deployment.contracts.liquidityVault.strategyCap,
      expectedMaxLossBps: deployment.contracts.liquidityVault.maxLossBps,
      expectedAllocationsPaused: deployment.contracts.liquidityVault.allocationsPaused };
  }
  return buildMonitoringReport({ checkedAt, block: latest, maxBlockAgeSeconds, validation, validationError,
    custody, ownership, vaultState, safeState,indexerState,indexerError });
}

async function main() {
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL;
  if (!rpcUrl) throw new Error("Set BSC_TESTNET_RPC_URL. Never commit RPC credentials or private keys.");
  const root = path.resolve(import.meta.dirname, "..");
  const deploymentPath = path.resolve(process.env.DEPLOYMENT_FILE || path.join(root, "deployments/bsc-testnet-97.json"));
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const maxBlockAgeSeconds = Number(process.env.MONITOR_MAX_BLOCK_AGE_SECONDS || 180);
  if (!Number.isInteger(maxBlockAgeSeconds) || maxBlockAgeSeconds < 30 || maxBlockAgeSeconds > 3600) {
    throw new Error("MONITOR_MAX_BLOCK_AGE_SECONDS must be an integer from 30 to 3600.");
  }
  const report = await monitorBscTestnet({ provider: new ethers.JsonRpcProvider(rpcUrl), deployment, maxBlockAgeSeconds,indexerHealthUrl:process.env.CANDLE_INDEXER_HEALTH_URL||null });
  console.log(JSON.stringify({ deploymentPath, ...report }, null, 2));
  if (report.status === "CRITICAL") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
