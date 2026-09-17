// LQC Flow Futures — DEMO emergency market controls.
// Pure state transitions for halting risk-increasing activity while preserving exits.

const STATES = Object.freeze({ ACTIVE: "ACTIVE", REDUCE_ONLY: "REDUCE_ONLY", HALTED: "HALTED" });

function normalizeState(state) {
  const value = String(state).toUpperCase();
  if (!Object.values(STATES).includes(value)) throw new Error("INVALID_MARKET_STATE");
  return value;
}

function positive(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

function side(value, code) {
  const normalized = String(value ?? "").toUpperCase();
  if (normalized !== "LONG" && normalized !== "SHORT") throw new Error(code);
  return normalized;
}

export function createEmergencyMarketState({ state = STATES.ACTIVE, reason = null, updatedAt = null } = {}) {
  const mode = normalizeState(state);
  if (mode !== STATES.ACTIVE && !String(reason ?? "").trim()) throw new Error("EMERGENCY_REASON_REQUIRED");
  return Object.freeze({ state: mode, reason: mode === STATES.ACTIVE ? null : String(reason), updatedAt });
}

export function transitionEmergencyState(current, { nextState, reason, timestamp, recoveryApproved = false }) {
  if (!current) throw new Error("MARKET_STATE_REQUIRED");
  if (!timestamp) throw new Error("EMERGENCY_TIMESTAMP_REQUIRED");
  const previous = normalizeState(current.state);
  const next = normalizeState(nextState);
  if (previous === next) throw new Error("MARKET_STATE_UNCHANGED");
  if (next !== STATES.ACTIVE && !String(reason ?? "").trim()) throw new Error("EMERGENCY_REASON_REQUIRED");
  if (previous === STATES.HALTED && next === STATES.ACTIVE) throw new Error("STAGED_RECOVERY_REQUIRED");
  if (next === STATES.ACTIVE && !recoveryApproved) throw new Error("RECOVERY_APPROVAL_REQUIRED");
  return Object.freeze({ state: next, reason: next === STATES.ACTIVE ? null : String(reason), updatedAt: String(timestamp) });
}

export function isGenuineRiskReduction({ positionSide, positionQuantity, orderSide, orderQuantity }) {
  const currentSide = side(positionSide, "INVALID_POSITION_SIDE");
  const currentQuantity = positive(positionQuantity, "INVALID_POSITION_QUANTITY");
  const requestedSide = side(orderSide, "INVALID_ORDER_SIDE");
  const requestedQuantity = positive(orderQuantity, "INVALID_ORDER_QUANTITY");
  if (currentSide === requestedSide) return false;
  return requestedQuantity <= currentQuantity;
}

export function validateEmergencyOrder(state, order = {}) {
  if (!state) throw new Error("MARKET_STATE_REQUIRED");
  const mode = normalizeState(state.state);
  if (mode === STATES.HALTED) throw new Error("MARKET_HALTED");
  if (mode === STATES.REDUCE_ONLY) {
    if (!order.reduceOnly) throw new Error("MARKET_REDUCE_ONLY");
    if (!isGenuineRiskReduction(order)) throw new Error("INVALID_REDUCE_ONLY_ORDER");
  }
  return Object.freeze({ allowed: true, state: mode, reduceOnly: Boolean(order.reduceOnly) });
}

export function evaluateEmergencyTriggers({ oracleHealthy = true, circuitBreakerAllowed = true, residualBadDebt = 0 }) {
  const debt = Number(residualBadDebt);
  if (!Number.isFinite(debt) || debt < 0) throw new Error("INVALID_RESIDUAL_BAD_DEBT");
  if (!oracleHealthy) return Object.freeze({ state: STATES.HALTED, reason: "ORACLE_UNHEALTHY" });
  if (!circuitBreakerAllowed) return Object.freeze({ state: STATES.HALTED, reason: "PRICE_CIRCUIT_BREAKER" });
  if (debt > 0) return Object.freeze({ state: STATES.REDUCE_ONLY, reason: "RESIDUAL_BAD_DEBT" });
  return Object.freeze({ state: STATES.ACTIVE, reason: null });
}

export { STATES as EMERGENCY_MARKET_STATES };
