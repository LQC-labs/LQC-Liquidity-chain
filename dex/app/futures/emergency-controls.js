// LQC Flow Futures — DEMO emergency market controls.
// Pure state transitions for halting risk-increasing activity while preserving exits.

const STATES = Object.freeze({ ACTIVE: "ACTIVE", REDUCE_ONLY: "REDUCE_ONLY", HALTED: "HALTED" });

function normalizeState(state) {
  const value = String(state).toUpperCase();
  if (!Object.values(STATES).includes(value)) throw new Error("INVALID_MARKET_STATE");
  return value;
}

export function createEmergencyMarketState({ state = STATES.ACTIVE, reason = null, updatedAt = null } = {}) {
  return Object.freeze({ state: normalizeState(state), reason, updatedAt });
}

export function transitionEmergencyState(current, { nextState, reason, timestamp = new Date().toISOString() }) {
  if (!current) throw new Error("MARKET_STATE_REQUIRED");
  const previous = normalizeState(current.state);
  const next = normalizeState(nextState);
  if (previous === next) throw new Error("MARKET_STATE_UNCHANGED");
  if (next !== STATES.ACTIVE && !String(reason ?? "").trim()) throw new Error("EMERGENCY_REASON_REQUIRED");
  return Object.freeze({ state: next, reason: next === STATES.ACTIVE ? null : String(reason), updatedAt: timestamp });
}

export function validateEmergencyOrder(state, { reduceOnly = false } = {}) {
  if (!state) throw new Error("MARKET_STATE_REQUIRED");
  const mode = normalizeState(state.state);
  if (mode === STATES.HALTED) throw new Error("MARKET_HALTED");
  if (mode === STATES.REDUCE_ONLY && !reduceOnly) throw new Error("MARKET_REDUCE_ONLY");
  return Object.freeze({ allowed: true, state: mode, reduceOnly: Boolean(reduceOnly) });
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
