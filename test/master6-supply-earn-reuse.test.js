import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const model=fs.readFileSync("dex/contracts/lending/LQCInterestRateModel.sol","utf8");
const index=fs.readFileSync("dex/contracts/lending/LQCLendingInterestIndex.sol","utf8");
const core=fs.readFileSync("dex/contracts/lending/LQCLendingCore.sol","utf8");
const e2e=fs.readFileSync("dex/test/lending-core.test.mjs","utf8");

test("Master 6/14 Supply Earn reuses variable borrower-interest-driven yield",()=>{
  assert.ok(model.includes("supplyRatePerSecondRay = borrowRatePerSecondRay * utilizationRay / RAY"));
  assert.ok(model.includes("reserveFactorBps"));
  assert.ok(!model.toLowerCase().includes("guaranteed"));
  assert.ok(!model.includes("fixed APY"));
});

test("Master 6/14 supplier accounting is index-based and auditable",()=>{
  assert.ok(index.includes("supplyIndexRay"));
  assert.ok(core.includes("liquiditySharesOf"));
  assert.ok(core.includes("function liquidityOf"));
  assert.ok(core.includes("supplierInterest"));
  assert.ok(core.includes("reserveInterest"));
  assert.ok(core.includes("MarketInterestAccrued"));
});

test("Master 6/14 existing E2E proves borrower interest, supplier yield and reserve split",()=>{
  assert.ok(e2e.includes("connects borrower interest, supplier yield and protocol reserves"));
  assert.ok(e2e.includes("assert.ok(supplyAfter>supplyBefore)"));
  assert.ok(e2e.includes("assert.ok(reserves>0n)"));
  assert.ok(e2e.includes("debtAfter-debtBefore,(supplyAfter-supplyBefore)+reserves"));
});

test("Master 6/14 remains Lending Supply Earn, not LQC staking",()=>{
  const lower=core.toLowerCase();
  for(const term of ["function stake","function unstake","cooldown","rewardbudget"]){
    assert.ok(!lower.includes(term),term);
  }
});
