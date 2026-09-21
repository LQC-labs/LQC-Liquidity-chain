import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 6/1 reuses the existing bounded Lending Market Registry",()=>{
  const src=fs.readFileSync("dex/contracts/lending/LQCLendingMarketRegistry.sol","utf8");
  const coreTests=fs.readFileSync("dex/test/lending-core.test.mjs","utf8");
  const doc=fs.readFileSync("docs/master6/6-1-market-registry-audit.md","utf8");

  assert.match(src,/MAX_LTV_BPS = 5_000/);
  assert.match(src,/MAX_LIQUIDATION_THRESHOLD_BPS = 8_500/);
  assert.match(src,/MAX_LIQUIDATION_BONUS_BPS = 500/);
  assert.match(src,/mapping\(bytes32 marketId => MarketConfig\) private markets/);
  assert.match(src,/function configureMarket/);
  assert.match(src,/function setMarketEnabled/);
  assert.match(src,/validateCaps/);
  assert.match(src,/validateBorrowAmount/);
  assert.match(src,/risk\.healthFactor/);
  assert.match(src,/risk\.borrowAllowed/);
  assert.match(src,/risk\.liquidatable/);
  assert.match(coreTests,/blocks new risk when paused but permits repayment and safe exits/);
  assert.match(doc,/activationAuthorized: false/);
});
