// LQC Flow Futures — DEMO insurance and bad-debt model.
// Pure accounting helpers; production custody must be implemented separately.

function nonNegativeNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(code);
  return number;
}

function positiveNumber(value, code) {
  const number = nonNegativeNumber(value, code);
  if (number <= 0) throw new Error(code);
  return number;
}

export function createInsuranceFund({ balance = 0, maxCoveragePerEvent = Infinity } = {}) {
  const fundBalance = nonNegativeNumber(balance, "INVALID_INSURANCE_BALANCE");
  const coverageCap = maxCoveragePerEvent === Infinity
    ? Infinity
    : positiveNumber(maxCoveragePerEvent, "INVALID_INSURANCE_COVERAGE_CAP");
  return Object.freeze({ balance: fundBalance, maxCoveragePerEvent: coverageCap, totalCovered: 0, totalBadDebt: 0 });
}

export function depositInsurance(fund, amount) {
  if (!fund) throw new Error("INSURANCE_FUND_REQUIRED");
  const deposit = positiveNumber(amount, "INVALID_INSURANCE_DEPOSIT");
  return Object.freeze({ ...fund, balance: nonNegativeNumber(fund.balance, "INVALID_INSURANCE_BALANCE") + deposit });
}

// Applies the insurance fund to liquidation loss. Any uncovered remainder is
// explicit bad debt so it cannot silently disappear from protocol accounting.
export function coverLiquidationLoss(fund, loss) {
  if (!fund) throw new Error("INSURANCE_FUND_REQUIRED");
  const requestedLoss = nonNegativeNumber(loss, "INVALID_LIQUIDATION_LOSS");
  const balance = nonNegativeNumber(fund.balance, "INVALID_INSURANCE_BALANCE");
  const cap = fund.maxCoveragePerEvent === Infinity
    ? Infinity
    : positiveNumber(fund.maxCoveragePerEvent, "INVALID_INSURANCE_COVERAGE_CAP");
  const covered = Math.min(requestedLoss, balance, cap);
  const badDebt = requestedLoss - covered;

  return Object.freeze({
    fund: Object.freeze({
      ...fund,
      balance: balance - covered,
      totalCovered: nonNegativeNumber(fund.totalCovered ?? 0, "INVALID_TOTAL_COVERED") + covered,
      totalBadDebt: nonNegativeNumber(fund.totalBadDebt ?? 0, "INVALID_TOTAL_BAD_DEBT") + badDebt
    }),
    requestedLoss,
    covered,
    badDebt,
    fullyCovered: badDebt === 0
  });
}
