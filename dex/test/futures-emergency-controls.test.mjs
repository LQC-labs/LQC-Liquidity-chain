import assert from "node:assert/strict";
import { describe, it } from "mocha";
import {
  EMERGENCY_MARKET_STATES,
  createEmergencyMarketState,
  transitionEmergencyState,
  validateEmergencyOrder,
  evaluateEmergencyTriggers
} from "../app/futures/emergency-controls.js";

describe("LQC Flow Futures emergency controls", function () {
  it("starts markets active by default", function () {
    assert.equal(createEmergencyMarketState().state, EMERGENCY_MARKET_STATES.ACTIVE);
  });

  it("blocks all orders while a market is halted", function () {
    assert.throws(() => validateEmergencyOrder({ state: "HALTED" }, { reduceOnly: true }), /MARKET_HALTED/);
  });

  it("allows only exposure-reducing orders in reduce-only mode", function () {
    assert.throws(() => validateEmergencyOrder({ state: "REDUCE_ONLY" }), /MARKET_REDUCE_ONLY/);
    assert.equal(validateEmergencyOrder({ state: "REDUCE_ONLY" }, { reduceOnly: true }).allowed, true);
  });

  it("requires an explicit reason when entering an emergency state", function () {
    assert.throws(() => transitionEmergencyState({ state: "ACTIVE" }, { nextState: "HALTED" }), /EMERGENCY_REASON_REQUIRED/);
  });

  it("halts on unhealthy oracle or a tripped price circuit breaker", function () {
    assert.deepEqual(evaluateEmergencyTriggers({ oracleHealthy: false }), { state: "HALTED", reason: "ORACLE_UNHEALTHY" });
    assert.deepEqual(evaluateEmergencyTriggers({ circuitBreakerAllowed: false }), { state: "HALTED", reason: "PRICE_CIRCUIT_BREAKER" });
  });

  it("switches to reduce-only while residual bad debt remains", function () {
    assert.deepEqual(evaluateEmergencyTriggers({ residualBadDebt: 1 }), { state: "REDUCE_ONLY", reason: "RESIDUAL_BAD_DEBT" });
  });

  it("returns to active only when emergency triggers are clear", function () {
    assert.deepEqual(evaluateEmergencyTriggers({ oracleHealthy: true, circuitBreakerAllowed: true, residualBadDebt: 0 }), { state: "ACTIVE", reason: null });
  });
});
