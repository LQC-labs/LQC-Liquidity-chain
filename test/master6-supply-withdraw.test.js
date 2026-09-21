import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 6/6 enforces lender supply caps on indexed supply accounting",()=>{
  const core=fs.readFileSync("dex/contracts/lending/LQCLendingCore.sol","utf8");
  const registry=fs.readFileSync("dex/contracts/lending/LQCLendingMarketRegistry.sol","utf8");
  const supply=fs.readFileSync("dex/test/lending-supply-withdraw-boundaries.test.mjs","utf8");
  const runtime=fs.readFileSync("dex/test/lending-core.test.mjs","utf8");
  const doc=fs.readFileSync("docs/master6/6-6-supply-withdraw.md","utf8");

  assert.match(registry,/function validateMarketEnabled/);
  assert.match(registry,/function validateSupplyCap/);
  assert.match(registry,/function validateBorrowCap/);
  assert.match(registry,/totalSupplyAfter > config\.supplyCap/);
  assert.match(registry,/totalBorrowAfter > config\.borrowCap/);

  assert.match(core,/registry\.validateMarketEnabled\(id\)/);
  assert.match(core,/totalSupplyAfter=_totalSupply\(state,supplyIndex\)\+amount/);
  assert.match(core,/registry\.validateSupplyCap\(id,totalSupplyAfter\)/);
  assert.match(core,/registry\.validateBorrowCap\(id,totalBorrowAfter\)/);
  assert.doesNotMatch(core,/validateCaps\(id,state\.totalCollateral/);

  assert.match(core,/totalSupplyShares/);
  assert.match(core,/liquiditySharesOf/);
  assert.match(core,/function supplyLiquidity\(bytes32 id,uint256 amount\) external nonReentrant/);
  assert.match(core,/function withdrawLiquidity\(bytes32 id,uint256 amount,address receiver\) external nonReentrant/);
  assert.match(core,/_pullExact\(config\.debtAsset,msg\.sender,amount\)/);
  assert.match(core,/amount>claim\|\|amount>availableLiquidity\(id\)/);

  assert.match(supply,/supplies exact debt assets and mints indexed lender shares/);
  assert.match(supply,/enforces cumulative supply cap without drift/);
  assert.match(supply,/withdraws exact available liquidity to receiver and burns shares/);
  assert.match(supply,/rejects zero\/zero-receiver and claim overflow atomically/);
  assert.match(runtime,/protects lender withdrawals while debt is outstanding/);
  assert.match(runtime,/blocks new risk when paused but permits repayment and safe exits/);
  assert.match(doc,/activationAuthorized: false/);
});
