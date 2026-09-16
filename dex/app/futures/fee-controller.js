// LQC Flow Futures — DEMO trading-fee settlement boundary.
// Futures owns fee calculation/settlement independently of the DEX router.

import { calculateTradingFee, splitTradingFee } from './fee-engine.js';

export function createDemoFeeController({ account, schedule, feeShares = undefined, insuranceFundService = undefined }) {
  if (!account || typeof account.settleTradingFee !== 'function') throw new Error('MARGIN_ACCOUNT_REQUIRED');
  if (!schedule) throw new Error('TRADING_FEE_SCHEDULE_REQUIRED');
  if (insuranceFundService !== undefined && (!insuranceFundService || typeof insuranceFundService.snapshot !== 'function' || typeof insuranceFundService.previewDeposit !== 'function' || typeof insuranceFundService.commitDeposit !== 'function')) throw new Error('INVALID_INSURANCE_FUND_SERVICE');

  function insuranceSnapshot() {
    return insuranceFundService?.snapshot();
  }

  function settleTrade({ quantity, price, liquidityRole }) {
    const calculated = calculateTradingFee({ quantity, price, liquidityRole, schedule });
    const allocation = splitTradingFee(calculated.fee, feeShares);

    if (allocation.insuranceAmount > 0 && !insuranceFundService) throw new Error('INSURANCE_FUND_SERVICE_REQUIRED');

    // Preview the immutable fund transition before touching the account. This
    // validates the deposit while keeping the shared service unchanged.
    const nextInsuranceFund = allocation.insuranceAmount > 0
      ? insuranceFundService.previewDeposit(allocation.insuranceAmount)
      : insuranceFundService?.snapshot();

    // Account debit is the fallible ledger operation. Only after it succeeds do
    // we commit the already-validated shared Insurance Fund transition.
    const accountSnapshot = account.settleTradingFee(calculated.fee);
    if (allocation.insuranceAmount > 0) insuranceFundService.commitDeposit(nextInsuranceFund);

    return Object.freeze({
      ...calculated,
      ...allocation,
      account: accountSnapshot,
      insuranceFund: insuranceFundService?.snapshot(),
      settledAt: new Date().toISOString()
    });
  }

  return Object.freeze({ settleTrade, insuranceSnapshot });
}
