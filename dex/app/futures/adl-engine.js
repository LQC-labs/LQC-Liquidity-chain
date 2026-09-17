// LQC Flow Futures — DEMO auto-deleveraging (ADL) model.
// ADL is a last-resort accounting mechanism after insurance coverage is exhausted.

function finiteNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(code);
  return number;
}

function positiveNumber(value, code) {
  const number = finiteNumber(value, code);
  if (number <= 0) throw new Error(code);
  return number;
}

function normalizedSide(side) {
  const value = String(side).toUpperCase();
  if (value !== "LONG" && value !== "SHORT") throw new Error("INVALID_SIDE");
  return value;
}

export function adlScore({ side, quantity, entryPrice, markPrice, collateral }) {
  const positionSide = normalizedSide(side);
  const qty = positiveNumber(quantity, "INVALID_QUANTITY");
  const entry = positiveNumber(entryPrice, "INVALID_ENTRY_PRICE");
  const mark = positiveNumber(markPrice, "INVALID_MARK_PRICE");
  const margin = positiveNumber(collateral, "INVALID_COLLATERAL");
  const direction = positionSide === "LONG" ? 1 : -1;
  const pnl = direction * qty * (mark - entry);
  const profit = Math.max(0, pnl);
  const notional = qty * mark;
  const leverage = notional / margin;
  const profitRatio = profit / margin;
  return profitRatio * leverage;
}

export function rankAdlCandidates(positions, bankruptSide) {
  if (!Array.isArray(positions)) throw new Error("POSITIONS_REQUIRED");
  const failedSide = normalizedSide(bankruptSide);
  const requiredSide = failedSide === "LONG" ? "SHORT" : "LONG";

  return Object.freeze(positions
    .filter((position) => normalizedSide(position.side) === requiredSide)
    .map((position) => Object.freeze({ ...position, adlScore: adlScore(position) }))
    .filter((position) => position.adlScore > 0)
    .sort((a, b) => b.adlScore - a.adlScore || String(a.id).localeCompare(String(b.id))));
}

// Selects enough profitable opposing notional to absorb explicit bad debt.
// This only produces an ADL plan; execution/position mutation belongs elsewhere.
export function buildAdlPlan({ positions, bankruptSide, badDebt }) {
  const debt = finiteNumber(badDebt, "INVALID_BAD_DEBT");
  if (debt < 0) throw new Error("INVALID_BAD_DEBT");
  if (debt === 0) return Object.freeze({ requiredBadDebt: 0, selected: Object.freeze([]), residualBadDebt: 0 });

  const ranked = rankAdlCandidates(positions, bankruptSide);
  const selected = [];
  let remaining = debt;

  for (const position of ranked) {
    if (remaining <= 0) break;
    const notional = positiveNumber(position.quantity, "INVALID_QUANTITY") * positiveNumber(position.markPrice, "INVALID_MARK_PRICE");
    const absorb = Math.min(remaining, notional);
    selected.push(Object.freeze({ id: position.id, side: position.side, adlScore: position.adlScore, absorbAmount: absorb }));
    remaining -= absorb;
  }

  return Object.freeze({ requiredBadDebt: debt, selected: Object.freeze(selected), residualBadDebt: Math.max(0, remaining) });
}
