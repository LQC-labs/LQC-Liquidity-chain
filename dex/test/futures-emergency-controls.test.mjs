import assert from "node:assert/strict";
import { describe, it } from "mocha";
import {
  EMERGENCY_MARKET_STATES,
  createEmergencyMarketState,
  transitionEmergencyState,
  isGenuineRiskReduction,
  validateEmergencyOrder,
  evaluateEmergencyTriggers
} from "../app/futures/emergency-controls.js";

describe("LQC Flow Futures emergency controls", function () {
  it("starts markets active by default", function () {
    assert.equal(createEmergencyMarketState().state, EMERGENCY_MARKET_STATES.ACTIVE);
  });

  it("requires a reason when initialized in an emergency state", function () {
    assert.throws(() => createEmergencyMarketState({ state: "HALTED" }), /EMERGENCY_REASON_REQUIRED/);
  });

  it("blocks all orders while a market is halted", function () {
    assert.throws(() => validateEmergencyOrder({ state: "HALTED" }, { reduceOnly: true }), /MARKET_HALTED/);
  });

  it("allows only genuine exposure reductions in reduce-only mode", function () {
    const state = { state: "REDUCE_ONLY" };
    assert.throws(() => validateEmergencyOrder(state), /MARKET_REDUCE_ONLY/);
    const order = { reduceOnly: true, positionSide: "LONG", positionQuantity: 2, orderSide: "SHORT", orderQuantity: 1 };
    assert.equal(validateEmergencyOrder(state, order).allowed, true);
    assert.equal(isGenuineRiskReduction(order), true);
  });

  it("rejects a fake reduce-only flag that increases or flips exposure", function () {
    const state = { state: "REDUCE_ONLY" };
    assert.throws(() => validateEmergencyOrder(state, { reduceOnly: true, positionSide: "LONG", positionQuantity: 2, orderSide: "LONG", orderQuantity: 1 }), /INVALID_REDUCE_ONLY_ORDER/);
    assert.throws(() => validateEmergencyOrder(state, { reduceOnly: true, positionSide: "LONG", positionQuantity: 2, orderSide: "SHORT", orderQuantity: 3 }), /INVALID_REDUCE_ONLY_ORDER/);
  });

  it("requires deterministic transition timestamps and emergency reasons", function () {
    assert.throws(() => transitionEmergencyState({ state: "ACTIVE" }, { nextState: "HALTED", reason: "oracle" }), /EMERGENCY_TIMESTAMP_REQUIRED/);
    assert.throws(() => transitionEmergencyState({ state: "ACTIVE" }, { nextState: "HALTED", timestamp: "2026-09-16T00:00:00.000Z" }), /EMERGENCY_REASON_REQUIRED/);
  });

  it("requires staged and approved recovery before returning active", function () {
    const timestamp = "2026-09-16T00:00:00.000Z";
    assert.throws(() => transitionEmergencyState({ state: "HALTED" }, { nextState: "ACTIVE", timestamp, recoveryApproved: true }), /STAGED_RECOVERY_REQUIRED/);
    const reduced = transitionEmergencyState({ state: "HALTED" }, { nextState: "REDUCE_ONLY", reason: "RECOVERY_MONITORING", timestamp });
    assert.equal(reduced.state, "REDUCE_ONLY");
    assert.throws(() => transitionEmergencyState(reduced, { nextState: "ACTIVE", timestamp }), /RECOVERY_APPROVAL_REQUIRED/);
    assert.equal(transitionEmergencyState(reduced, { nextState: "ACTIVE", timestamp, recoveryApproved: true }).state, "ACTIVE");
  });

  it("halts on unhealthy oracle or a tripped price circuit breaker", function () {
    assert.deepEqual(evaluateEmergencyTriggers({ oracleHealthy: false }), { state: "HALTED", reason: "ORACLE_UNHEALTHY" });
    assert.deepEqual(evaluateEmergencyTriggers({ circuitBreakerAllowed: false }), { state: "HALTED", reason: "PRICE_CIRCUIT_BREAKER" });
  });

  it("switches to reduce-only while residual bad debt remains", function () {
    assert.deepEqual(evaluateEmergencyTriggers({ residualBadDebt: 1 }), { state: "REDUCE_ONLY", reason: "RESIDUAL_BAD_DEBT" });
  });

  it("returns an active recommendation only when emergency triggers are clear", function () {
    assert.deepEqual(evaluateEmergencyTriggers({ oracleHealthy: true, circuitBreakerAllowed: true, residualBadDebt: 0 }), { state: "ACTIVE", reason: null });
  });
});
