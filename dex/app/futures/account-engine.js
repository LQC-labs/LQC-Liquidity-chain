// LQC Flow Futures — DEMO account/margin state.
// Keeps isolated reserved margin separate from the cross-margin wallet pool.

import { crossAccountHealth } from './risk-engine.js';

export function createDemoMarginAccount(initialBalance = 100000) {
  const initial = Number(initialBalance);
  if (!Number.isFinite(initial) || initial < 0) throw new Error('INVALID_INITIAL_BALANCE');

  let cash = initial;
  let isolatedReserved = 0;
  let crossReserved = 0;

  function reserve(amount, marginMode = 'ISOLATED') {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) throw new Error('INVALID_MARGIN_AMOUNT');
    if (value > available()) throw new Error('INSUFFICIENT_DEMO_BALANCE');
    cash -= value;
    if (marginMode === 'CROSS') crossReserved += value;
    else isolatedReserved += value;
    return snapshot();
  }

  function release(amount, pnl = 0, marginMode = 'ISOLATED') {
    const value = Number(amount);
    const realized = Number(pnl);
    if (!Number.isFinite(value) || value < 0) throw new Error('INVALID_MARGIN_AMOUNT');
    if (!Number.isFinite(realized)) throw new Error('INVALID_REALIZED_PNL');
    if (marginMode === 'CROSS') crossReserved = Math.max(0, crossReserved - value);
    else isolatedReserved = Math.max(0, isolatedReserved - value);
    cash = Math.max(0, cash + value + realized);
    return snapshot();
  }

  function consumeLiquidation(amount, marginMode = 'ISOLATED') {
    const value = Math.max(0, Number(amount) || 0);
    if (marginMode === 'CROSS') crossReserved = Math.max(0, crossReserved - value);
    else isolatedReserved = Math.max(0, isolatedReserved - value);
    return snapshot();
  }

  function available() {
    return cash;
  }

  function crossWalletBalance() {
    // Cross collateral is still account equity and therefore participates in
    // shared-risk calculations even though it is reserved from new orders.
    return cash + crossReserved;
  }

  function health(positions, markPriceOf) {
    return crossAccountHealth({ walletBalance: crossWalletBalance(), positions, markPriceOf });
  }

  function snapshot() {
    return Object.freeze({
      initialBalance: initial,
      availableBalance: cash,
      isolatedReserved,
      crossReserved,
      crossWalletBalance: crossWalletBalance(),
      totalReserved: isolatedReserved + crossReserved
    });
  }

  return Object.freeze({ reserve, release, consumeLiquidation, available, crossWalletBalance, health, snapshot });
}
