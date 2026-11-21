// M07 read-only, offline migration preflight. No RPC, signer, or transaction code.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const HASH = /^0x[a-fA-F0-9]{64}$/;
const UINT = /^(0|[1-9][0-9]*)$/;
const INT = /^(0|-?[1-9][0-9]*)$/;

function invalid(message) { throw new Error(message); }
function nonempty(value, field) {
  if (typeof value !== "string" || !value.trim()) invalid(field + " missing");
  return value;
}
function address(value, field) {
  if (typeof value !== "string" || !ADDRESS.test(value) || /^0x0{40}$/i.test(value)) invalid(field + " invalid");
  return value.toLowerCase();
}
function hash(value, field) {
  if (typeof value !== "string" || !HASH.test(value) || /^0x0{64}$/i.test(value)) invalid(field + " invalid");
  return value.toLowerCase();
}
function uint(value, field) {
  if (typeof value !== "string" || !UINT.test(value)) invalid(field + " must be a decimal unsigned-integer string");
  return BigInt(value);
}
function signed(value, field) {
  if (typeof value !== "string" || !INT.test(value)) invalid(field + " must be a decimal signed-integer string");
  return BigInt(value);
}
function array(value, field) {
  if (!Array.isArray(value)) invalid(field + " must be an array");
  return value;
}
function unique(items, field) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item)) invalid("duplicate " + field + ": " + item);
    seen.add(item);
  }
}
function failed(result, code, detail) { result.failures.push({ code, detail }); }
function blocked(result, code, detail) { result.blockers.push({ code, detail }); }

export function verifyM07(snapshot) {
  const result = { status: "BLOCKED", scope: "M07_OFFLINE_SNAPSHOT_ONLY", failures: [], blockers: [] };
  try {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) invalid("snapshot root invalid");
    const meta = snapshot.meta;
    if (!meta || typeof meta !== "object") invalid("meta missing");
    if (uint(meta.chainId, "chainId") === 0n) invalid("chainId invalid");
    uint(meta.blockNumber, "blockNumber");
    hash(meta.blockHash, "blockHash");
    const registry = address(meta.registry, "registry");
    const engine = address(meta.engine, "engine");
    const vault = address(meta.vault, "vault");
    unique([registry, engine, vault], "contract address");
    hash(meta.registryCodehash, "registryCodehash");
    hash(meta.engineCodehash, "engineCodehash");
    hash(meta.vaultCodehash, "vaultCodehash");
    nonempty(meta.inventoryOrigin, "inventoryOrigin");

    const attest = snapshot.attestations || {};
    for (const k of ["finalizedBlock", "deploymentToBlockLogsComplete", "accountMarketInventoryReconciled", "independentSnapshotReview"]) {
      if (attest[k] !== true) blocked(result, "G01", k + " is not independently attested");
    }
    const approval = snapshot.approvals || {};
    for (const k of ["migrationPolicyApproved", "rollbackProcedureApproved", "rollbackTestPassed", "independentSecurityReview", "productionOracleProxyVerified", "integrationReview"]) {
      if (approval[k] !== true) blocked(result, k === "rollbackProcedureApproved" || k === "rollbackTestPassed" ? "G06" : "G07", k + " not approved");
    }

    const markets = array(snapshot.markets, "markets");
    const positions = array(snapshot.positions, "positions");
    const tokens = array(snapshot.vaultTokens, "vaultTokens");
    const marketKeys = markets.map((m) => uint(m.marketId, "marketId").toString());
    const tokenKeys = tokens.map((t) => address(t.token, "token"));
    unique(marketKeys, "marketId");
    unique(tokenKeys, "token");
    if (markets.length === 0 || tokens.length === 0) blocked(result, "G01", "empty market/token inventory cannot prove completeness");

    const oi = new Map(marketKeys.map(k => [k, 0n]));
    const keys = [];
    let openCount = 0;
    for (const p of positions) {
      const account = address(p.account, "position account");
      const market = uint(p.marketId, "position marketId").toString();
      if (!oi.has(market)) invalid("unknown position market " + market);
      keys.push(market + ":" + account);
      const size = uint(p.sizeUsd, "position sizeUsd");
      uint(p.margin, "position margin");
      uint(p.entryPrice, "position entryPrice");
      if (typeof p.open !== "boolean") invalid("position open must be boolean");
      signed(p.positionFundingEntryRay, "positionFundingEntryRay");
      const ledger = p.fundingLedger;
      if (!ledger) invalid("fundingLedger missing");
      signed(ledger.recognizedNetUnits, "recognizedNetUnits");
      signed(ledger.activeRemainderRay, "activeRemainderRay");
      const credit = uint(ledger.closedCreditRay, "closedCreditRay");
      const debt = uint(ledger.closedDebtRay, "closedDebtRay");
      if (p.open) {
        if (size === 0n) failed(result, "G02", "open position has zero size");
        oi.set(market, oi.get(market) + size);
        openCount++;
      } else if (size !== 0n) failed(result, "G02", "closed position has nonzero size");
      if (credit !== 0n || debt !== 0n || BigInt(ledger.recognizedNetUnits) !== 0n || BigInt(ledger.activeRemainderRay) !== 0n) {
        blocked(result, "G03", "unresolved Funding ledger for market " + market + " account " + account);
      }
    }
    unique(keys, "account:market");
    for (const m of markets) {
      const key = uint(m.marketId, "marketId").toString();
      const recorded = uint(m.openInterestUsd, "openInterestUsd");
      if (recorded !== oi.get(key)) failed(result, "G02", "open interest mismatch for market " + key);
      const state = m.fundingState;
      if (!state || typeof state.configured !== "boolean") invalid("fundingState missing/invalid");
      signed(state.cumulativeFundingPerUsdRay, "cumulativeFundingPerUsdRay");
      uint(state.maxAbsDeltaPerUpdateRay, "maxAbsDeltaPerUpdateRay");
    }
    if (openCount) blocked(result, "G02", openCount + " open positions require approved atomic migration or full safe exit");

    for (const t of tokens) {
      const token = address(t.token, "token");
      const decimals = uint(t.decimals, "decimals");
      if (decimals > 36n) invalid("token decimals unreasonable");
      const balance = uint(t.actualTokenBalance, "actualTokenBalance");
      const accounted = uint(t.totalAccounted, "totalAccounted");
      const pool = uint(t.fundingPoolBalance, "fundingPoolBalance");
      const insurance = uint(t.insuranceFeeReserve, "insuranceFeeReserve");
      const treasury = uint(t.treasuryFeeReserve, "treasuryFeeReserve");
      const debt = uint(t.residualBadDebt, "residualBadDebt");
      uint(t.totalInsuranceCovered, "totalInsuranceCovered");
      const users = array(t.users, "vault token users");
      unique(users.map(u => address(u.account, "vault user account")), "vault user for " + token);
      let userTotal = 0n;
      let lockedTotal = 0n;
      for (const u of users) {
        const available = uint(u.availableBalance, "availableBalance");
        const locked = uint(u.lockedBalance, "lockedBalance");
        userTotal += available + locked;
        lockedTotal += locked;
      }
      if (userTotal !== accounted) failed(result, "G04", "totalAccounted not reconciled to users for " + token);
      if (balance < accounted + pool + insurance + treasury) failed(result, "G04", "Vault is underbacked for " + token);
      if (lockedTotal !== 0n) blocked(result, "G04", "nonzero locked user collateral for " + token);
      if (debt !== 0n) blocked(result, "G04", "unresolved residual bad debt for " + token);
      if (pool !== 0n || insurance !== 0n || treasury !== 0n) {
        blocked(result, "G04", "nonzero segregated reserves require explicit disposition for " + token);
      }
    }
    if (snapshot.beforeAfterDigestVerified !== true) blocked(result, "G05", "immutable before/after obligation digest not independently verified");
  } catch (error) {
    failed(result, "SCHEMA", String(error.message || error));
  }
  result.status = result.failures.length ? "FAIL" : result.blockers.length ? "BLOCKED" : "PASS";
  // PASS concerns the supplied snapshot ONLY; never authorizes contract replacement.
  result.operationalCutoverAuthorized = false;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv[2];
  if (!input || process.argv.length !== 3) {
    console.error("Usage: node scripts/verify-futures-m07-snapshot.mjs SNAPSHOT.json");
    process.exitCode = 2;
  } else {
    try {
      const result = verifyM07(JSON.parse(readFileSync(input, "utf8")));
      console.log(JSON.stringify(result, null, 2));
      if (result.status !== "PASS") process.exitCode = 1;
    } catch (e) {
      console.error("FAIL: " + e.message);
      process.exitCode = 2;
    }
  }
}
