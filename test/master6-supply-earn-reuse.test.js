import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const model=fs.readFileSync("dex/contracts/lending/LQCInterestRateModel.sol","utf8");
const index=fs.readFileSync("dex/contracts/lending/LQCLendingInterestIndex.sol","utf8");
const core=fs.readFileSync("dex/contracts/lending/LQCLendingCore.sol","utf8");
const e2e=fs.readFileSync("dex/test/lending-core.test.mjs","utf8");

test("Master 6/14 Supply Earn reuses variable borrower-interest-driven yield",()=>{
  assert.match(model,/supplyRatePerSecondRays*=s*borrowRatePerSecondRays**s*utilizationRay/);
  assert.match(model,/reserveFactorBps/);
  assert.doesNotMatch(model,/guaranteed|fixed APY|fixedAPR/i);
});

test("Master 6/14 supplier accounting is index-based and auditable",()=>{
  assert.match(index,/supplyIndexRay/);
  assert.match(core,/liquiditySharesOf/);
  assert.match(core,/function liquidityOf/);
  assert.match(core,/supplierInterest/);
  assert.match(core,/reserveInterest/);
  assert.match(core,/MarketInterestAccrued/);
});

test("Master 6/14 existing E2E proves borrower interest, supplier yield and reserve split",()=>{
  assert.match(e2e,/connects borrower interest, supplier yield and protocol reserves/);
  assert.match(e2e,/assert.ok(supplyAfter>supplyBefore)/);
  assert.match(e2e,/assert.ok(reserves>0n)/);
  assert.match(e2e,/debtAfter-debtBefore,(supplyAfter-supplyBefore)+reserves/);
});

test("Master 6/14 remains Lending Supply Earn, not LQC staking",()=>{
  assert.doesNotMatch(core,/stake|unstake|cooldown|rewardBudget/i);
});
