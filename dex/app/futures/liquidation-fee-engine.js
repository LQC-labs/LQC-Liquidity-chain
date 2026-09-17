// LQC Flow Futures — DEMO liquidation fee routing.
// Calculates a bounded liquidation fee and routes it to the insurance reserve.

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

export function calculateLiquidationFee({ liquidatedNotional, feeRate, availableCollateral }) {
  const notional = positive(liquidatedNotional, "INVALID_LIQUIDATED_NOTIONAL");
  const rate = nonNegative(feeRate, "INVALID_LIQUIDATION_FEE_RATE");
  const collateral = nonNegative(availableCollateral, "INVALID_AVAILABLE_COLLATERAL");
  if (rate > 1) throw new Error("LIQUIDATION_FEE_RATE_EXCEEDS_ONE");

  const requestedFee = notional * rate;
  const chargedFee = Math.min(requestedFee, collateral);
  return Object.freeze({
    liquidatedNotional: notional,
    feeRate: rate,
    requestedFee,
    chargedFee,
    remainingCollateral: collateral - chargedFee,
    insuranceCredit: chargedFee,
    shortfall: requestedFee - chargedFee
  });
}

export function routeLiquidationFeeToInsurance(insuranceFund, settlement) {
  if (!insuranceFund) throw new Error("INSURANCE_FUND_REQUIRED");
  if (!settlement) throw new Error("LIQUIDATION_FEE_SETTLEMENT_REQUIRED");
  const balance = nonNegative(insuranceFund.balance, "INVALID_INSURANCE_BALANCE");
  const credit = nonNegative(settlement.insuranceCredit, "INVALID_INSURANCE_CREDIT");
  return Object.freeze({ ...insuranceFund, balance: balance + credit });
}
