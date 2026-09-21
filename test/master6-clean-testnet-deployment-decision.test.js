import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 6/12 classifies historical deployment evidence without crediting it as current clean deployment",()=>{
  const decision=JSON.parse(fs.readFileSync("dex/deployments/master6-clean-testnet-deployment-decision-bsc-testnet-97.json","utf8"));
  const stage1=JSON.parse(fs.readFileSync("dex/deployments/lending-stage1-verification-bsc-testnet-97.json","utf8"));
  const stage2=JSON.parse(fs.readFileSync("dex/deployments/lending-stage2-verification-bsc-testnet-97.json","utf8"));
  const stage3=JSON.parse(fs.readFileSync("dex/deployments/lending-stage3-deployment-review-bsc-testnet-97.json","utf8"));
  const stage4=JSON.parse(fs.readFileSync("dex/deployments/lending-stage4-binding-review-input-bsc-testnet-97.json","utf8"));
  const core=fs.readFileSync("dex/contracts/lending/LQCLendingCore.sol","utf8");
  const registry=fs.readFileSync("dex/contracts/lending/LQCLendingMarketRegistry.sol","utf8");
  const doc=fs.readFileSync("docs/master6/6-12-clean-testnet-deployment-decision.md","utf8");

  assert.equal(decision.network.chainId,97);
  assert.equal(decision.status,"FRESH_VALIDATION_REQUIRED");
  assert.equal(decision.activationAuthorized,false);

  assert.equal(stage1.status,"VERIFIED_LENDING_STAGE1_DEPLOYMENT");
  assert.equal(stage2.status,"VERIFIED_LENDING_STAGE2_DEPLOYMENT");
  assert.equal(stage3.status,"AWAITING_EXPLICIT_DEPLOYMENT_APPROVAL");
  assert.equal(stage4.status,"READ_ONLY_REVIEW_PREPARATION");

  assert.ok(decision.mandatoryFreshDeployment.includes("LQCLendingMarketRegistry"));
  assert.ok(decision.mandatoryFreshDeployment.includes("LQCLendingCore"));
  assert.ok(decision.requiresCurrentDeploymentEvidence.includes("LQCLiquidationEngine"));

  assert.match(core,/totalBadDebtShares\[id\]!=0\)revert OutstandingBadDebt/);
  assert.match(core,/uint256 reserveAvailable=accruedReserves\[id\]/);
  assert.match(registry,/function validateSupplyCap/);
  assert.match(registry,/function validateBorrowCap/);
  assert.match(doc,/market remains disabled until the explicit 6\/13 Lending E2E activation step/);
  assert.match(doc,/activationAuthorized: false/);
});
