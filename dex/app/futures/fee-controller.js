// LQC Flow Futures — DEMO trading-fee settlement boundary.
// Futures owns fee calculation/settlement independently of the DEX router.

import { calculateTradingFee, splitTradingFee } from './fee-engine.js';

export function createDemoFeeController({ account, schedule, feeShares = undefined }) {
  if (!account || typeof account.settleTradingFee !== 'function') throw new Error('MARGIN_ACCOUNT_REQUIRED');
  if (!schedule) throw new Error('TRADING_FEE_SCHEDULE_REQUIRED');

  function settleTrade({ quantity, price, liquidityRole }) {
    // Complete deterministic calculation before account mutation.
    const calculated = calculateTradingFee({ quantity, price, liquidityRole, schedule });
    const allocation = splitTradingFee(calculated.fee, feeShares);
    const accountSnapshot = account.settleTradingFee(calculated.fee);

    return Object.freeze({
      ...calculated,
      ...allocation,
      account: accountSnapshot,
      settledAt: new Date().toISOString()
    });
  }

  return Object.freeze({ settleTrade });
}
