import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 5/2 primary feed validity remains fail-closed and portable", () => {
  const oracle=fs.readFileSync("dex/contracts/lending/LQCOracleManager.sol","utf8");
  const iface=fs.readFileSync("dex/contracts/router-v2/interfaces/ILQCPriceFeed.sol","utf8");
  const doc=fs.readFileSync("docs/master5/5-2-primary-feed.md","utf8");
  assert.match(oracle,/primary == address\(0\)/);
  assert.match(oracle,/primary == secondary/);
  assert.match(oracle,/ILQCPriceFeed\(primary\)\.decimals\(\)/);
  assert.match(oracle,/answer <= 0/);
  assert.match(oracle,/updatedAt == 0/);
  assert.match(oracle,/updatedAt > block\.timestamp/);
  assert.match(oracle,/answeredInRound < roundId/);
  assert.match(oracle,/block\.timestamp - updatedAt > maxAge/);
  assert.match(oracle,/10 \*\* \(18 - decimals\)/);
  assert.match(iface,/latestRoundData/);
  assert.match(doc,/activationAuthorized: false/);
});
