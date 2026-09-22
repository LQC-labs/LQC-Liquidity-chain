import assert from "node:assert/strict";
import fs from "node:fs";

const read=(p)=>fs.readFileSync(p,"utf8");

describe("Master 7/5-7 integrated Futures accounting invariants",function(){
  it("keeps all 7/5 canonical accounting primitives on one Engine/Vault path",function(){
    const engine=read("contracts/futures/LQCPerpEngine.sol");
    const vault=read("contracts/futures/LQCFuturesVault.sol");
    for(const fn of["reducePosition","settleFunding","configureTradingFee","configureInsuranceCoverage","liquidate","executeAdl"]){
      assert.ok(engine.includes(`function ${fn}`),fn);
    }
    for(const fn of["settleFunding","collectTradingFee","coverBadDebt","absorbAdlBadDebt","settlePnL"]){
      assert.ok(vault.includes(`function ${fn}`),fn);
    }
  });

  it("preserves segregated Futures reserves and explicit residual debt",function(){
    const vault=read("contracts/futures/LQCFuturesVault.sol");
    for(const field of["fundingPoolBalance","insuranceFeeReserve","treasuryFeeReserve","residualBadDebt"]){
      assert.ok(vault.includes(field),field);
    }
    assert.ok(vault.includes("isFullyBacked"));
    assert.ok(vault.includes("isSolvent"));
  });

  it("keeps ADL bounded to existing residual debt and Governance execution",function(){
    const engine=read("contracts/futures/LQCPerpEngine.sol");
    const vault=read("contracts/futures/LQCFuturesVault.sol");
    assert.ok(engine.includes("function executeAdl"));
    assert.ok(engine.includes("external onlyRegistryOwner"));
    assert.ok(engine.includes("maxAdlReductionBps"));
    assert.ok(engine.includes("AdlBadDebtRequired"));
    assert.ok(vault.includes("if (amount > debt) revert InvalidAmount()"));
  });

  it("preserves Futures isolation from Lending and Staking accounting",function(){
    for(const p of["contracts/futures/LQCPerpEngine.sol","contracts/futures/LQCFuturesVault.sol"]){
      const source=read(p);
      assert.ok(!/LQCLending|LQCStaking|contracts\/lending|contracts\/staking/.test(source),p);
    }
  });
});
