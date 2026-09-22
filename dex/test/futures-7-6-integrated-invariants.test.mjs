import assert from "node:assert/strict";
import fs from "node:fs";

const engine=fs.readFileSync(new URL("../contracts/futures/LQCPerpEngine.sol",import.meta.url),"utf8");
const registry=fs.readFileSync(new URL("../contracts/futures/LQCFuturesMarketRegistry.sol",import.meta.url),"utf8");

describe("Master 7/6-7 Risk/Governance/Emergency integration invariants",function(){
 it("keeps emergency market modes, Guardian escalation and staged Governance recovery",function(){
  for(const x of["enum MarketMode","setGuardian","setEmergencyMarketMode","applyEmergencyTriggers","setRecoveryApproved"]) assert.ok(registry.includes(x),x);
  assert.ok(registry.includes("previous == MarketMode.HALTED && newMode == MarketMode.ACTIVE"));
  assert.ok(registry.includes("previous == MarketMode.REDUCE_ONLY && newMode == MarketMode.ACTIVE && !recoveryApproved[marketId]"));
 });
 it("keeps order, position and aggregate OI risk ceilings on the canonical engine",function(){
  for(const x of["maxOrderNotionalUsd","maxPositionNotionalUsd","maxOpenInterestUsd","openInterestUsd","configureMarketNotionalLimits","configureMarketOpenInterestLimit"]) assert.ok(engine.includes(x),x);
 });
 it("keeps emergency restrictions fail-closed",function(){
  assert.ok(registry.includes("if (!oracleHealthy || !circuitBreakerAllowed) target = MarketMode.HALTED"));
  assert.ok(registry.includes("hasResidualBadDebt && current == MarketMode.ACTIVE"));
  assert.ok(registry.includes("if (uint8(target) < uint8(current)) revert Forbidden()"));
 });
 it("keeps new exposure gated to ACTIVE mode",function(){
  assert.ok(engine.includes("registry.marketMode(marketId) != LQCFuturesMarketRegistry.MarketMode.ACTIVE"));
 });
});
