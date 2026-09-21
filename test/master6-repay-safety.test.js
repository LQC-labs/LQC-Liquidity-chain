import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 6/8 keeps repayment risk-reducing during pause without weakening Borrow",()=>{
  const core=fs.readFileSync("dex/contracts/lending/LQCLendingCore.sol","utf8");
  const registry=fs.readFileSync("dex/contracts/lending/LQCLendingMarketRegistry.sol","utf8");
  const repayGate=fs.readFileSync("dex/test/lending-repay-gate.test.mjs","utf8");
  const runtime=fs.readFileSync("dex/test/lending-repay-boundaries.test.mjs","utf8");
  const doc=fs.readFileSync("docs/master6/6-8-repay-safety.md","utf8");

  assert.match(core,/function repay\(bytes32 id,uint256 amount,address account\) external nonReentrant/);
  assert.match(core,/if\(amount>=debt\)\{shares=sharesHeld;repaid=debt;\}/);
  assert.match(core,/if\(debtAfter!=0\)registry\.validateBorrowAmount\(id,debtAfter\)/);
  assert.match(core,/_pullExact\(config\.debtAsset,msg\.sender,repaid\)/);

  assert.match(registry,/function validateBorrowCap[\s\S]*_enabledMarket\(id\)/);
  assert.match(registry,/function validateBorrowAmount[\s\S]*_market\(id\)/);
  assert.doesNotMatch(registry,/function validateBorrowAmount[\s\S]{0,250}_enabledMarket\(id\)/);

  assert.match(repayGate,/supports exact full payoff without over-pulling the payer/);
  assert.match(repayGate,/prevents partial repayment from leaving debt below the market minimum/);
  assert.match(runtime,/partial third-party repayment while the market is paused/);
  assert.match(runtime,/sub-minimum debt without drift/);
  assert.match(runtime,/overpayment at actual debt/);
  assert.match(doc,/Blocking risk-reducing repayment is not the intended pause boundary/);
  assert.match(doc,/activationAuthorized: false/);
});
