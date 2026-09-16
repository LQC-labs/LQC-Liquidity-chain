// LQC Flow Futures — DEMO market-level risk limits.
// Keeps per-market exposure bounded without coupling to custody or matching code.

function nonNegative(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(code);
  return number;
}

function positive(value, code) {
  const number = nonNegative(value, code);
  if (number <= 0) throw new Error(code);
  return number;
}

export function createMarketRiskLimits({ maxOpenInterest, maxPositionNotional, maxOrderNotional }) {
  return Object.freeze({
    maxOpenInterest: positive(maxOpenInterest, "INVALID_MAX_OPEN_INTEREST"),
    maxPositionNotional: positive(maxPositionNotional, "INVALID_MAX_POSITION_NOTIONAL"),
    maxOrderNotional: positive(maxOrderNotional, "INVALID_MAX_ORDER_NOTIONAL")
  });
}

export function calculateOpenInterest(positions, markPrice) {
  if (!Array.isArray(positions)) throw new Error("POSITIONS_REQUIRED");
  const mark = positive(markPrice, "INVALID_MARK_PRICE");
  return positions.reduce((total, position) => total + positive(position.quantity, "INVALID_QUANTITY") * mark, 0);
}

export function validateExposureIncrease({ currentOpenInterest = 0, currentPositionNotional = 0, orderNotional, limits }) {
  if (!limits) throw new Error("MARKET_RISK_LIMITS_REQUIRED");
  const oi = nonNegative(currentOpenInterest, "INVALID_OPEN_INTEREST");
  const position = nonNegative(currentPositionNotional, "INVALID_POSITION_NOTIONAL");
  const order = positive(orderNotional, "INVALID_ORDER_NOTIONAL");

  if (order > limits.maxOrderNotional) throw new Error("MAX_ORDER_NOTIONAL_EXCEEDED");
  if (position + order > limits.maxPositionNotional) throw new Error("MAX_POSITION_NOTIONAL_EXCEEDED");
  if (oi + order > limits.maxOpenInterest) throw new Error("MAX_OPEN_INTEREST_EXCEEDED");

  return Object.freeze({ allowed: true, nextOpenInterest: oi + order, nextPositionNotional: position + order });
}

// Risk-reducing orders are allowed even when the market is already above a limit,
// provided they do not increase absolute exposure.
export function validateRiskReducingOrder({ currentPositionNotional, reduceNotional }) {
  const position = nonNegative(currentPositionNotional, "INVALID_POSITION_NOTIONAL");
  const reduction = positive(reduceNotional, "INVALID_REDUCE_NOTIONAL");
  if (reduction > position) throw new Error("REDUCTION_EXCEEDS_POSITION");
  return Object.freeze({ allowed: true, nextPositionNotional: position - reduction });
}
