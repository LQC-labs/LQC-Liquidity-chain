import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 6/9 freezes the Health Factor and LTV runtime boundary",()=>{
  const registry=fs.readFileSync("dex/contracts/lending/LQCLendingMarketRegistry.sol","utf8");
  const oracle=fs.readFileSync("dex/contracts/lending/LQCOracleManager.sol","utf8");
  const hfGate=fs.readFileSync("dex/test/lending-ltv-health-factor-gate.test.mjs","utf8");
  const runtime=fs.readFileSync("dex/test/lending-health-factor-boundaries.test.mjs","utf8");
  const policy=fs.readFileSync("docs/LENDING_RISK_ENGINE_POLICY.md","utf8");
  const doc=fs.readFileSync("docs/master6/6-9-health-factor-audit.md","utf8");

  assert.match(registry,/MAX_LTV_BPS = 5_000/);
  assert.match(registry,/risk\.maxDebtValue = risk\.collateralValue \* config\.maxLtvBps \/ BPS/);
  assert.match(registry,/risk\.liquidationDebtValue = risk\.collateralValue \* config\.liquidationThresholdBps \/ BPS/);
  assert.match(registry,/risk\.healthFactor = risk\.liquidationDebtValue \* 1e18 \/ risk\.debtValue/);
  assert.match(registry,/risk\.borrowAllowed = risk\.debtValue <= risk\.maxDebtValue/);
  assert.match(registry,/risk\.liquidatable = risk\.debtValue > risk\.liquidationDebtValue/);
  assert.match(oracle,/collateralPrice = primaryPrice < secondaryPrice/);
  assert.match(oracle,/debtPrice = primaryPrice > secondaryPrice/);

  assert.match(hfGate,/caps configured max LTV at 50 percent/);
  assert.match(runtime,/infinite Health Factor for a debt-free account/);
  assert.match(runtime,/50 percent borrow boundary from the 70 percent liquidation boundary/);
  assert.match(runtime,/Health Factor 1 as the boundary/);
  assert.match(runtime,/above the 50 percent protocol LTV ceiling/);
  assert.match(policy,/Health Factor = \(Collateral Value × Liquidation Threshold\) \/ Debt Value/);
  assert.match(doc,/activationAuthorized: false/);
});
