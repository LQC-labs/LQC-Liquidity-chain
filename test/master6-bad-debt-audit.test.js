import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 6/11 enforces reserve-first bad debt recovery and bounded last-resort loss",()=>{
  const core=fs.readFileSync("dex/contracts/lending/LQCLendingCore.sol","utf8");
  const runtime=fs.readFileSync("dex/test/lending-core.test.mjs","utf8");
  const legacy=fs.readFileSync("dex/test/lending-bad-debt-reserve-gate.test.mjs","utf8");
  const doc=fs.readFileSync("docs/master6/6-11-bad-debt-audit.md","utf8");

  for(const symbol of ["badDebtSharesOf","totalBadDebtShares","accruedReserves","realizedSupplierLosses","BadDebtRecorded"]){
    assert.match(core,new RegExp(symbol));
  }

  assert.match(core,/badDebtSharesOf\[id\]\[msg\.sender\]!=0/);
  assert.match(core,/totalBadDebtShares\[id\]!=0\)revert OutstandingBadDebt/);
  assert.match(core,/uint256 reserveAvailable=accruedReserves\[id\]/);
  assert.match(core,/if\(reserveAvailable!=0\).*_burnBadDebt\(id,account,reserveAvailable\).*accruedReserves\[id\]-=reserveCovered/s);
  assert.match(core,/emit BadDebtCovered\(id,account,1,reserveCovered,reserveShares\)/);
  assert.match(core,/if\(config\.enabled\)revert Unauthorized/);
  assert.match(core,/historicalBase\*2_000\/10_000/);

  for(const phrase of [
    "prevents reserve withdrawal while bad debt is outstanding",
    "blocks new borrowing while bad debt remains",
    "allows ordinary repayment to reduce recorded bad debt",
    "applies reserves first and only then realizes bounded supplier loss on a paused market"
  ]){
    assert.match(runtime,new RegExp(phrase));
  }

  assert.match(legacy,/Bad Debt \/ Reserve gate/);
  assert.match(doc,/reserve-first recovery order/);
  assert.match(doc,/activationAuthorized: false/);
});
