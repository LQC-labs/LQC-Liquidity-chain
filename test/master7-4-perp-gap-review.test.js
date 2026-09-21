import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");

test("7/4 identifies the exact on-chain Perp surface without over-crediting app-layer accounting",()=>{
  const engine=read("dex/contracts/futures/LQCPerpEngine.sol");
  for(const fn of["openPosition","closePosition","liquidate","getPositionPnl"]){
    assert.ok(engine.includes(`function ${fn}`),fn);
  }
  for(const missing of[
    "settleFunding","fundingRate","tradingFee","partialClose","reducePosition",
    "insuranceFund","badDebt","adl","autoDeleverage"
  ]){
    assert.equal(engine.includes(missing),false,missing);
  }
  assert.ok(engine.includes("Funding, fees, partial close and insurance are intentionally separate follow-up modules."));
});

test("7/4 confirms Funding exists as tested application-layer accounting",()=>{
  const engine=read("dex/app/futures/funding-engine.js");
  const controller=read("dex/app/futures/funding-controller.js");
  assert.ok(engine.includes("calculateFundingRate"));
  assert.ok(engine.includes("calculateFundingPayment"));
  assert.ok(engine.includes("settleDemoFunding"));
  assert.ok(controller.includes("createDemoFundingController"));
  assert.ok(controller.includes("settleFunding"));
});

test("7/4 confirms Fees exist as tested application-layer accounting",()=>{
  const engine=read("dex/app/futures/fee-engine.js");
  const controller=read("dex/app/futures/fee-controller.js");
  assert.ok(engine.includes("calculateTradingFee"));
  assert.ok(engine.includes("splitTradingFee"));
  assert.ok(controller.includes("createDemoFeeController"));
  assert.ok(controller.includes("settleTradingFee"));
});

test("7/4 confirms partial position reduction exists off-chain but not in the on-chain Perp engine",()=>{
  const position=read("dex/app/futures/position-engine.js");
  const book=read("dex/app/futures/position-book.js");
  const engine=read("dex/contracts/futures/LQCPerpEngine.sol");
  assert.ok(position.includes("reduceDemoPosition"));
  assert.ok(book.includes("function reduce("));
  assert.ok(!engine.includes("reducePosition"));
  assert.ok(!engine.includes("partialClose"));
});

test("7/4 confirms Insurance and ADL are application-layer models, not current on-chain custody/accounting",()=>{
  const insurance=read("dex/app/futures/insurance-engine.js");
  const service=read("dex/app/futures/insurance-fund-service.js");
  const controller=read("dex/app/futures/insurance-adl-controller.js");
  const adl=read("dex/app/futures/adl-engine.js");
  const vault=read("dex/contracts/futures/LQCFuturesVault.sol");
  const perp=read("dex/contracts/futures/LQCPerpEngine.sol");

  assert.ok(insurance.includes("production custody must be implemented separately"));
  assert.ok(service.includes("createDemoInsuranceFundService"));
  assert.ok(controller.includes("createDemoInsuranceAdlController"));
  assert.ok(adl.includes("buildAdlPlan"));

  for(const source of[vault,perp]){
    for(const forbidden of["InsuranceFund","insuranceFund","badDebt","autoDeleverage","adl"]){
      assert.equal(source.includes(forbidden),false,forbidden);
    }
  }
});

test("7/4 preserves Futures isolation from Lending",()=>{
  for(const p of[
    "dex/contracts/futures/LQCPerpEngine.sol",
    "dex/contracts/futures/LQCFuturesVault.sol",
    "dex/contracts/futures/LQCFuturesMarketRegistry.sol"
  ]){
    const source=read(p);
    assert.ok(!/LQCLending|contracts\/lending|lending\//i.test(source),p);
  }
});
