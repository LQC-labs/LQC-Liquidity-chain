// LQC Flow Futures — DEMO trading-fee settlement boundary.
// Futures owns fee calculation/settlement independently of the DEX router.

import { calculateTradingFee, splitTradingFee } from './fee-engine.js';

export function createDemoFeeController({ account, schedule, feeShares = undefined, insuranceFundService = undefined }) {
  if (!account || typeof account.settleTradingFee !== 'function' || typeof account.snapshot !== 'function' || typeof account.restoreSnapshot !== 'function') throw new Error('MARGIN_ACCOUNT_REQUIRED');
  if (!schedule) throw new Error('TRADING_FEE_SCHEDULE_REQUIRED');
  if (insuranceFundService !== undefined && (!insuranceFundService || typeof insuranceFundService.snapshot !== 'function' || typeof insuranceFundService.previewDeposit !== 'function' || typeof insuranceFundService.commitDeposit !== 'function')) throw new Error('INVALID_INSURANCE_FUND_SERVICE');

  function insuranceSnapshot() { return insuranceFundService?.snapshot(); }

  function settleTrade({ quantity, price, liquidityRole }) {
    const calculated = calculateTradingFee({ quantity, price, liquidityRole, schedule });
    const allocation = splitTradingFee(calculated.fee, feeShares);
    if (allocation.insuranceAmount > 0 && !insuranceFundService) throw new Error('INSURANCE_FUND_SERVICE_REQUIRED');

    const nextInsuranceFund = allocation.insuranceAmount > 0
      ? insuranceFundService.previewDeposit(allocation.insuranceAmount)
      : insuranceFundService?.snapshot();

    const accountBefore = account.snapshot();
    const accountSnapshot = account.settleTradingFee(calculated.fee);
    try {
      if (allocation.insuranceAmount > 0) insuranceFundService.commitDeposit(nextInsuranceFund);
    } catch (error) {
      try {
        account.restoreSnapshot(accountBefore, accountSnapshot);
      } catch (rollbackError) {
        const consistencyError = new Error('FEE_SETTLEMENT_ROLLBACK_FAILED');
        consistencyError.cause = error;
        consistencyError.rollbackError = rollbackError;
        throw consistencyError;
      }
      const settlementError = new Error('FEE_INSURANCE_COMMIT_FAILED');
      settlementError.cause = error;
      settlementError.rolledBack = true;
      throw settlementError;
    }

    return Object.freeze({ ...calculated, ...allocation, account: accountSnapshot, insuranceFund: insuranceFundService?.snapshot(), settledAt: new Date().toISOString() });
  }

  return Object.freeze({ settleTrade, insuranceSnapshot });
}
