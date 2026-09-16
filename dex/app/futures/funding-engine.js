// LQC Flow Futures — DEMO funding model.
// Pure deterministic calculations only; no live custody or settlement.

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

export function calculateFundingRate({ markPrice, indexPrice, interestRate = 0, maxFundingRate = 0.003 }) {
  const mark = positiveNumber(markPrice, "INVALID_MARK_PRICE");
  const index = positiveNumber(indexPrice, "INVALID_INDEX_PRICE");
  const interest = finiteNumber(interestRate, "INVALID_INTEREST_RATE");
  const cap = positiveNumber(maxFundingRate, "INVALID_FUNDING_CAP");

  const premium = (mark - index) / index;
  const rawRate = premium + interest;
  return Math.max(-cap, Math.min(cap, rawRate));
}

// Positive funding means longs pay shorts. Negative funding means shorts pay longs.
// The returned payment is signed from the position holder's perspective:
// negative = debit, positive = credit.
export function calculateFundingPayment({ side, quantity, markPrice, fundingRate }) {
  const positionSide = normalizedSide(side);
  const qty = positiveNumber(quantity, "INVALID_QUANTITY");
  const mark = positiveNumber(markPrice, "INVALID_MARK_PRICE");
  const rate = finiteNumber(fundingRate, "INVALID_FUNDING_RATE");
  const notional = qty * mark;
  const directionalPayment = notional * rate;
  return positionSide === "LONG" ? -directionalPayment : directionalPayment;
}

export function settleDemoFunding(position, { markPrice, indexPrice, interestRate = 0, maxFundingRate = 0.003, timestamp = new Date().toISOString() }) {
  if (!position) throw new Error("POSITION_REQUIRED");
  const rate = calculateFundingRate({ markPrice, indexPrice, interestRate, maxFundingRate });
  const payment = calculateFundingPayment({
    side: position.side,
    quantity: position.quantity,
    markPrice,
    fundingRate: rate
  });
  const previousFunding = finiteNumber(position.cumulativeFunding ?? 0, "INVALID_CUMULATIVE_FUNDING");

  return Object.freeze({
    position: Object.freeze({
      ...position,
      cumulativeFunding: previousFunding + payment,
      lastFundingRate: rate,
      lastFundingPayment: payment,
      lastFundingAt: timestamp
    }),
    fundingRate: rate,
    payment
  });
}
