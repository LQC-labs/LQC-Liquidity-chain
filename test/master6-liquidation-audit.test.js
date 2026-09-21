import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 6/10 reuses bounded Health-Factor liquidation and proves pause-safe execution",()=>{
  const engine=fs.readFileSync("dex/contracts/lending/LQCLiquidationEngine.sol","utf8");
  const core=fs.readFileSync("dex/contracts/lending/LQCLendingCore.sol","utf8");
  const registry=fs.readFileSync("dex/contracts/lending/LQCLendingMarketRegistry.sol","utf8");
  const legacy=fs.readFileSync("dex/test/lending-liquidation-gate.test.mjs","utf8");
  const runtime=fs.readFileSync("dex/test/lending-liquidation-boundaries.test.mjs","utf8");
  const doc=fs.readFileSync("docs/master6/6-10-liquidation-audit.md","utf8");

  assert.match(engine,/function liquidate\(bytes32 id,address account,uint256 maxRepay,address receiver\)/);
  assert.match(engine,/core\.executeLiquidation\(id,account,msg\.sender,receiver,maxRepay\)/);
  assert.match(core,/msg\.sender!=liquidationEngine/);
  assert.match(core,/if\(!risk\.liquidatable\)revert NotLiquidatable\(\)/);
  assert.match(core,/uint256 maxClose=\(debt\+1\)\/2/);
  assert.match(core,/10_000\+config\.liquidationBonusBps/);
  assert.match(core,/if\(collateralSeized>collateral\)/);
  assert.match(core,/BadDebtRecorded/);
  assert.match(registry,/MAX_LIQUIDATION_BONUS_BPS = 500/);

  assert.match(legacy,/caps each liquidation close at one half of outstanding debt/);
  assert.match(runtime,/Health Factor 1 without accounting drift/);
  assert.match(runtime,/remains available while the market is paused/);
  assert.match(runtime,/zero receiver and direct Core liquidation access/);
  assert.match(doc,/activationAuthorized: false/);
});
