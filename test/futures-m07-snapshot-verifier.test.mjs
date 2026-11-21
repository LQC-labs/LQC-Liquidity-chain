import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyM07 } from "../scripts/verify-futures-m07-snapshot.mjs";

const A = "0x" + "11".repeat(20);
const B = "0x" + "22".repeat(20);
const C = "0x" + "33".repeat(20);
const T = "0x" + "44".repeat(20);
const U = "0x" + "55".repeat(20);
const H = "0x" + "aa".repeat(32);
const clone = x => structuredClone(x);
function fixture() {
  return {
    meta: { chainId: "97", blockNumber: "100", blockHash: H,
      registry: A, engine: B, vault: C, registryCodehash: H,
      engineCodehash: H, vaultCodehash: H, inventoryOrigin: "independently audited deployment-to-block log inventory" },
    attestations: { finalizedBlock: true, deploymentToBlockLogsComplete: true,
      accountMarketInventoryReconciled: true, independentSnapshotReview: true },
    approvals: { migrationPolicyApproved: true, rollbackProcedureApproved: true,
      rollbackTestPassed: true, independentSecurityReview: true,
      productionOracleProxyVerified: true, integrationReview: true },
    markets: [{ marketId: "1", openInterestUsd: "0",
      fundingState: { cumulativeFundingPerUsdRay: "0", maxAbsDeltaPerUpdateRay: "0", configured: false } }],
    positions: [],
    vaultTokens: [{ token: T, decimals: "18", actualTokenBalance: "0",
      totalAccounted: "0", fundingPoolBalance: "0", insuranceFeeReserve: "0",
      treasuryFeeReserve: "0", residualBadDebt: "0", totalInsuranceCovered: "0", users: [] }],
    beforeAfterDigestVerified: true
  };
}
const ledger = () => ({recognizedNetUnits:"0",activeRemainderRay:"0",closedCreditRay:"0",closedDebtRay:"0"});
test("M07 PASS means internally consistent, explicitly attested snapshot only", () => {
  const r = verifyM07(fixture());
  assert.equal(r.status, "PASS");
  assert.equal(r.operationalCutoverAuthorized, false);
  assert.equal(r.failures.length, 0);
});
test("M07 BLOCKED when account discovery attestation is absent", () => {
  const f=fixture();f.attestations.deploymentToBlockLogsComplete=false;
  const r=verifyM07(f);assert.equal(r.status,"BLOCKED");
  assert.ok(r.blockers.some(x=>x.code==="G01"));
});
test("M07 FAIL when OI disagrees with position records", () => {
  const f=fixture();f.markets[0].openInterestUsd="100";
  const r=verifyM07(f);assert.equal(r.status,"FAIL");
  assert.ok(r.failures.some(x=>x.code==="G02"));
});
test("M07 BLOCKED when open position is fully reconciled but not migrated", () => {
  const f=fixture();f.markets[0].openInterestUsd="100";
  f.positions=[{account:U,marketId:"1",sizeUsd:"100",margin:"20",
    entryPrice:"50000",open:true,positionFundingEntryRay:"0",fundingLedger:ledger()}];
  const r=verifyM07(f);assert.equal(r.status,"BLOCKED");
  assert.ok(r.blockers.some(x=>x.code==="G02"));
});
test("M07 BLOCKED when closed Funding credit remains, even with zero OI", () => {
  const f=fixture();f.positions=[{account:U,marketId:"1",sizeUsd:"0",margin:"0",
    entryPrice:"50000",open:false,positionFundingEntryRay:"0",
    fundingLedger:{...ledger(),closedCreditRay:"1"}}];
  const r=verifyM07(f);assert.equal(r.status,"BLOCKED");
  assert.ok(r.blockers.some(x=>x.code==="G03"));
});
test("M07 FAIL when Vault user totals differ from accounted balance", () => {
  const f=fixture();f.vaultTokens[0].actualTokenBalance="100";
  f.vaultTokens[0].totalAccounted="100";
  f.vaultTokens[0].users=[{account:U,availableBalance:"99",lockedBalance:"0"}];
  const r=verifyM07(f);assert.equal(r.status,"FAIL");
  assert.ok(r.failures.some(x=>x.code==="G04"));
});
test("M07 FAIL for underbacked Vault, BLOCKED for nonzero debt", () => {
  const f=fixture();f.vaultTokens[0].residualBadDebt="1";
  assert.equal(verifyM07(f).status,"BLOCKED");
  f.vaultTokens[0].totalAccounted="2";
  assert.equal(verifyM07(f).status,"FAIL");
});
test("M07 rejects duplicate market/user and unsafe numeric JSON", () => {
  const f=fixture();f.markets.push(clone(f.markets[0]));
  assert.equal(verifyM07(f).status,"FAIL");
  const g=fixture();g.vaultTokens[0].actualTokenBalance=100;
  assert.equal(verifyM07(g).status,"FAIL");
});
test("M07 always denies operational cutover even if all evidence flags true", () => {
  const f=fixture(); const r=verifyM07(f);
  assert.equal(r.status,"PASS");
  assert.equal(r.operationalCutoverAuthorized,false);
});
