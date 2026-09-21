import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 6/3 reuses deterministic Core-gated RAY indexes",()=>{
  const idx=fs.readFileSync("dex/contracts/lending/LQCLendingInterestIndex.sol","utf8");
  const runtime=fs.readFileSync("dex/test/lending-interest.test.mjs","utf8");
  const core=fs.readFileSync("dex/test/lending-core.test.mjs","utf8");
  const doc=fs.readFileSync("docs/master6/6-3-interest-index-audit.md","utf8");

  assert.match(idx,/RAY = 1e27/);
  assert.match(idx,/borrowIndexRay/);
  assert.match(idx,/supplyIndexRay/);
  assert.match(idx,/initializeMarket/);
  assert.match(idx,/function preview/);
  assert.match(idx,/function accrue/);
  assert.match(idx,/msg\.sender != core/);
  assert.match(idx,/applySupplyLoss/);
  assert.match(idx,/IndexOverflow/);
  assert.match(runtime,/accrues deterministic borrow and supplier indexes over time/);
  assert.match(runtime,/restricts index updates to the approved core/);
  assert.match(core,/connects borrower interest, supplier yield and protocol reserves/);
  assert.match(doc,/activationAuthorized: false/);
});
