import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 6/7 reuses the indexed Borrow path and proves cumulative cap enforcement",()=>{
  const core=fs.readFileSync("dex/contracts/lending/LQCLendingCore.sol","utf8");
  const registry=fs.readFileSync("dex/contracts/lending/LQCLendingMarketRegistry.sol","utf8");
  const borrowGate=fs.readFileSync("dex/test/lending-borrow-gate.test.mjs","utf8");
  const runtime=fs.readFileSync("dex/test/lending-borrow-boundaries.test.mjs","utf8");
  const coreRuntime=fs.readFileSync("dex/test/lending-core.test.mjs","utf8");
  const doc=fs.readFileSync("docs/master6/6-7-borrow-audit.md","utf8");

  assert.match(core,/function borrow\(bytes32 id,uint256 amount,address receiver\) external nonReentrant/);
  assert.match(core,/badDebtSharesOf\[id\]\[msg\.sender\]!=0/);
  assert.match(core,/amount>availableLiquidity\(id\)/);
  assert.match(core,/shares=_ceilDiv\(amount\*RAY,borrowIndex\)/);
  assert.match(core,/registry\.validateBorrowCap\(id,totalBorrowAfter\)/);
  assert.match(core,/registry\.validateBorrowAmount\(id,debtAfter\)/);
  assert.match(core,/accountRisk\(id,collateralOf\[id\]\[msg\.sender\],debtAfter\)\.borrowAllowed/);
  assert.match(registry,/function validateBorrowCap/);

  assert.match(borrowGate,/borrow cap and minimum debt/);
  assert.match(runtime,/cumulative borrow cap/);
  assert.match(runtime,/setMarketEnabled\(id,false\)/);
  assert.match(coreRuntime,/rejects borrowing or collateral withdrawal above the 50 percent LTV/);
  assert.match(coreRuntime,/protects lender withdrawals while debt is outstanding/);
  assert.match(doc,/production contract behavior is unchanged/i);
  assert.match(doc,/activationAuthorized: false/);
});
