import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 6/4 reuses the isolated, Core-gated Lending accounting implementation",()=>{
  const src=fs.readFileSync("dex/contracts/lending/LQCLendingCore.sol","utf8");
  const runtime=fs.readFileSync("dex/test/lending-core.test.mjs","utf8");
  const invariants=fs.readFileSync("dex/test/lending-security-invariant-gate.test.mjs","utf8");
  const doc=fs.readFileSync("docs/master6/6-4-lending-core-audit.md","utf8");

  for(const term of[
    "totalCollateral",
    "totalSupplyShares",
    "totalDebtShares",
    "badDebtSharesOf",
    "totalBadDebtShares",
    "accruedReserves",
    "realizedSupplierLosses"
  ]) assert.match(src,new RegExp(term));

  for(const fn of[
    "depositCollateral",
    "withdrawCollateral",
    "supplyLiquidity",
    "withdrawLiquidity",
    "borrow",
    "repay",
    "executeLiquidation"
  ]) assert.match(src,new RegExp("function "+fn));

  assert.match(src,/modifier nonReentrant/);
  assert.match(src,/function _pullExact/);
  assert.match(src,/registry\.validateCaps/);
  assert.match(src,/registry\.validateBorrowAmount/);
  assert.match(src,/registry\.accountRisk/);
  assert.match(src,/msg\.sender!=liquidationEngine/);
  assert.match(runtime,/custodies collateral, supplies liquidity, borrows and repays principal/);
  assert.match(runtime,/blocks new risk when paused but permits repayment and safe exits/);
  assert.match(runtime,/connects borrower interest, supplier yield and protocol reserves/);
  assert.match(invariants,/keeps all fund-moving Lending Core entry points non-reentrant/);
  assert.match(doc,/activationAuthorized: false/);
});
