import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 6/2 reuses bounded utilization-based interest model",()=>{
  const src=fs.readFileSync("dex/contracts/lending/LQCInterestRateModel.sol","utf8");
  const runtime=fs.readFileSync("dex/test/lending-interest.test.mjs","utf8");
  const doc=fs.readFileSync("docs/master6/6-2-interest-rate-model-audit.md","utf8");

  assert.match(src,/MAX_BORROW_APR_BPS = 20_000/);
  assert.match(src,/MAX_RESERVE_FACTOR_BPS = 3_000/);
  assert.match(src,/optimalUtilizationBps < 5_000/);
  assert.match(src,/optimalUtilizationBps > 9_500/);
  assert.match(src,/peakApr > MAX_BORROW_APR_BPS/);
  assert.match(src,/totalBorrow > totalLiquidity/);
  assert.match(src,/borrowRatePerSecondRay/);
  assert.match(src,/supplyRatePerSecondRay/);
  assert.match(src,/config\.reserveFactorBps/);
  assert.match(src,/setRateEnabled/);
  assert.match(runtime,/increases borrow cost across the utilization kink/);
  assert.match(runtime,/guardian pause-only authority/);
  assert.match(doc,/does not guarantee a fixed APY/);
  assert.match(doc,/activationAuthorized: false/);
});
