import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 6/5 reuses the existing collateral custody and withdrawal safety path",()=>{
  const src=fs.readFileSync("dex/contracts/lending/LQCLendingCore.sol","utf8");
  const registry=fs.readFileSync("dex/contracts/lending/LQCLendingMarketRegistry.sol","utf8");
  const collateral=fs.readFileSync("dex/test/lending-collateral-boundaries.test.mjs","utf8");
  const runtime=fs.readFileSync("dex/test/lending-core.test.mjs","utf8");
  const invariants=fs.readFileSync("dex/test/lending-security-invariant-gate.test.mjs","utf8");
  const doc=fs.readFileSync("docs/master6/6-5-collateral-audit.md","utf8");

  for(const term of[
    "totalCollateral",
    "collateralOf",
    "CollateralDeposited",
    "CollateralWithdrawn"
  ]) assert.match(src,new RegExp(term));

  assert.match(src,/function depositCollateral\(bytes32 id,uint256 amount\) external nonReentrant/);
  assert.match(src,/function withdrawCollateral\(bytes32 id,uint256 amount,address receiver\) external nonReentrant/);
  assert.match(src,/registry\.validateCaps\(id,totalAfter,/);
  assert.match(src,/_pullExact\(config\.collateralAsset,msg\.sender,amount\)/);
  assert.match(src,/registry\.accountRisk\(id,collateralAfter,debt\)\.borrowAllowed/);
  assert.match(src,/if\(receiver==address\(0\)\)revert ZeroAddress\(\)/);

  assert.match(collateral,/deposits exact collateral into user and market accounting/);
  assert.match(collateral,/rejects zero collateral and cap overflow without accounting drift/);
  assert.match(collateral,/withdraws exact collateral to a chosen receiver when debt-free/);
  assert.match(collateral,/rejects zero amount, zero receiver, and over-withdraw atomically/);

  assert.match(runtime,/rejects borrowing or collateral withdrawal above the 50 percent LTV/);
  assert.match(runtime,/blocks new risk when paused but permits repayment and safe exits/);
  assert.match(invariants,/keeps exact-transfer custody checks on inbound assets/);
  assert.match(registry,/function accountRisk/);
  assert.match(doc,/CI gate:/);
  assert.match(doc,/activationAuthorized: false/);
});
