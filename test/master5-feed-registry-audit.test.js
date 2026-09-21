import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 5/1 reuses governed feed configuration without coupling modules", () => {
  const oracle = fs.readFileSync("dex/contracts/lending/LQCOracleManager.sol", "utf8");
  const boundary = fs.readFileSync("docs/ORACLE_INTERFACE_BOUNDARY.md", "utf8");
  const doc = fs.readFileSync("docs/master5/5-1-feed-registry-audit.md", "utf8");

  assert.match(oracle, /mapping\(address asset => AssetConfig\) public assetConfigs/);
  assert.match(oracle, /function configureAsset/);
  assert.match(oracle, /address primary/);
  assert.match(oracle, /address secondary/);
  assert.match(oracle, /uint32 maxAge/);
  assert.match(oracle, /uint16 maxDeviationBps/);
  assert.match(boundary, /do not share one mutable Oracle Manager contract/);
  assert.match(boundary, /avoid hard-coded BSC feed addresses in Core contracts/);
  assert.match(doc, /activationAuthorized: false/);
});
