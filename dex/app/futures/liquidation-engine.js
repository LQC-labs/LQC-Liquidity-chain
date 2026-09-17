// LQC Flow Futures — DEMO partial-liquidation planner.
// Reduces exposure in bounded steps instead of forcing immediate full liquidation.

function positive(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

export function planPartialLiquidation({ quantity, markPrice, targetReductionRatio = 0.25, minRemainingNotional = 0 }) {
  const size = positive(quantity, "INVALID_LIQUIDATION_QUANTITY");
  const mark = positive(markPrice, "INVALID_MARK_PRICE");
  const ratio = positive(targetReductionRatio, "INVALID_LIQUIDATION_RATIO");
  const minimum = Number(minRemainingNotional);
  if (ratio > 1) throw new Error("LIQUIDATION_RATIO_EXCEEDS_ONE");
  if (!Number.isFinite(minimum) || minimum < 0) throw new Error("INVALID_MIN_REMAINING_NOTIONAL");

  const currentNotional = size * mark;
  let reduceQuantity = size * ratio;
  let remainingQuantity = size - reduceQuantity;

  if (remainingQuantity > 0 && remainingQuantity * mark < minimum) {
    reduceQuantity = size;
    remainingQuantity = 0;
  }

  return Object.freeze({
    fullLiquidation: remainingQuantity === 0,
    reduceQuantity,
    remainingQuantity,
    reduceNotional: reduceQuantity * mark,
    remainingNotional: remainingQuantity * mark,
    currentNotional
  });
}

export function buildLiquidationQueue(candidates) {
  if (!Array.isArray(candidates)) throw new Error("LIQUIDATION_CANDIDATES_REQUIRED");
  return Object.freeze(candidates.map((candidate) => {
    if (!candidate?.id) throw new Error("LIQUIDATION_CANDIDATE_ID_REQUIRED");
    const marginRatio = Number(candidate.marginRatio);
    if (!Number.isFinite(marginRatio)) throw new Error("INVALID_MARGIN_RATIO");
    return Object.freeze({ ...candidate, id: String(candidate.id), marginRatio });
  }).sort((a, b) => a.marginRatio - b.marginRatio || a.id.localeCompare(b.id)));
}
