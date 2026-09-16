// LQC Flow Futures — DEMO maker/taker trading fee model.
// Pure calculations keep execution, custody, and accounting concerns separate.

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

export function createTradingFeeSchedule({ makerRate, takerRate }) {
  const maker = nonNegative(makerRate, "INVALID_MAKER_FEE_RATE");
  const taker = nonNegative(takerRate, "INVALID_TAKER_FEE_RATE");
  if (maker > 1 || taker > 1) throw new Error("TRADING_FEE_RATE_EXCEEDS_ONE");
  return Object.freeze({ makerRate: maker, takerRate: taker });
}

export function calculateTradingFee({ quantity, price, liquidityRole, schedule }) {
  if (!schedule) throw new Error("TRADING_FEE_SCHEDULE_REQUIRED");
  const size = positive(quantity, "INVALID_TRADE_QUANTITY");
  const executionPrice = positive(price, "INVALID_TRADE_PRICE");
  const role = String(liquidityRole ?? "").toUpperCase();
  if (role !== "MAKER" && role !== "TAKER") throw new Error("INVALID_LIQUIDITY_ROLE");
  const rate = role === "MAKER" ? schedule.makerRate : schedule.takerRate;
  const notional = size * executionPrice;
  return Object.freeze({ liquidityRole: role, quantity: size, price: executionPrice, notional, feeRate: rate, fee: notional * rate });
}

export function splitTradingFee(fee, { insuranceShare = 0, treasuryShare = 1 } = {}) {
  const amount = nonNegative(fee, "INVALID_TRADING_FEE");
  const insurance = nonNegative(insuranceShare, "INVALID_INSURANCE_FEE_SHARE");
  const treasury = nonNegative(treasuryShare, "INVALID_TREASURY_FEE_SHARE");
  if (Math.abs(insurance + treasury - 1) > 1e-12) throw new Error("FEE_SHARES_MUST_SUM_TO_ONE");
  return Object.freeze({ insuranceAmount: amount * insurance, treasuryAmount: amount * treasury });
}
