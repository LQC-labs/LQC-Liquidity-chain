import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 5/3 reference feed is independent, validated and conservatively consumed", () => {
  const oracle=fs.readFileSync("dex/contracts/lending/LQCOracleManager.sol","utf8");
  const boundary=fs.readFileSync("docs/ORACLE_INTERFACE_BOUNDARY.md","utf8");
  const doc=fs.readFileSync("docs/master5/5-3-reference-feed.md","utf8");
  assert.match(oracle,/secondary == address\(0\)/);
  assert.match(oracle,/primary == secondary/);
  assert.match(oracle,/ILQCPriceFeed\(secondary\)\.decimals\(\)/);
  assert.match(oracle,/uint256 secondaryPrice = _read\(config\.secondary, config\.maxAge\)/);
  assert.match(oracle,/collateralPrice = primaryPrice < secondaryPrice \? primaryPrice : secondaryPrice/);
  assert.match(oracle,/debtPrice = primaryPrice > secondaryPrice \? primaryPrice : secondaryPrice/);
  assert.match(boundary,/same independently reviewed underlying price-feed sources/);
  assert.match(doc,/activationAuthorized: false/);
});
