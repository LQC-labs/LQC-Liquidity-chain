// LQC Flow Futures — DEMO trading-fee settlement boundary.
// Futures owns fee calculation/settlement independently of the DEX router.

import { calculateTradingFee, splitTradingFee } from './fee-engine.js';
import { depositInsurance } from './insurance-engine.js';

export function createDemoFeeController({ account, schedule, feeShares = undefined, initialInsuranceFund = undefined }) {
  if (!account || typeof account.settleTradingFee !== 'function') throw new Error('MARGIN_ACCOUNT_REQUIRED');
  if (!schedule) throw new Error('TRADING_FEE_SCHEDULE_REQUIRED');
  let insuranceFund = initialInsuranceFund;

  function insuranceSnapshot() {
    return insuranceFund;
  }

  function settleTrade({ quantity, price, liquidityRole }) {
    // Complete deterministic calculation before any state mutation.
    const calculated = calculateTradingFee({ quantity, price, liquidityRole, schedule });
    const allocation = splitTradingFee(calculated.fee, feeShares);
    const nextInsuranceFund = allocation.insuranceAmount > 0
      ? depositInsurance(insuranceFund, allocation.insuranceAmount)
      : insuranceFund;

    // Debit the account first. If this fails, the insurance fund is untouched.
    const accountSnapshot = account.settleTradingFee(calculated.fee);
    insuranceFund = nextInsuranceFund;

    return Object.freeze({
      ...calculated,
      ...allocation,
      account: accountSnapshot,
      insuranceFund,
      settledAt: new Date().toISOString()
    });
  }

  return Object.freeze({ settleTrade, insuranceSnapshot });
}
