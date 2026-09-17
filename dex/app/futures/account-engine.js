// LQC Flow Futures — DEMO account/margin state.
// Keeps isolated reserved margin separate from the cross-margin wallet pool.

import { crossAccountHealth } from './risk-engine.js';

export function createDemoMarginAccount(initialBalance = 100000) {
  const initial = Number(initialBalance);
  if (!Number.isFinite(initial) || initial < 0) throw new Error('INVALID_INITIAL_BALANCE');

  let cash = initial;
  let isolatedReserved = 0;
  let crossReserved = 0;
  let cumulativeFunding = 0;
  let cumulativeTradingFees = 0;

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

  function settleFunding(payment) {
    const value = Number(payment);
    if (!Number.isFinite(value)) throw new Error('INVALID_FUNDING_PAYMENT');
    if (cash + value < -1e-9) throw new Error('INSUFFICIENT_BALANCE_FOR_FUNDING');
    cash = Math.max(0, cash + value);
    cumulativeFunding += value;
    return snapshot();
  }

  function settleTradingFee(fee) {
    const value = Number(fee);
    if (!Number.isFinite(value) || value < 0) throw new Error('INVALID_TRADING_FEE');
    if (cash - value < -1e-9) throw new Error('INSUFFICIENT_BALANCE_FOR_TRADING_FEE');
    cash = Math.max(0, cash - value);
    cumulativeTradingFees += value;
    return snapshot();
  }

  function restoreSnapshot(previous, expectedCurrent = null) {
    if (!previous || !Number.isFinite(previous.availableBalance) || !Number.isFinite(previous.isolatedReserved) || !Number.isFinite(previous.crossReserved) || !Number.isFinite(previous.cumulativeFunding) || !Number.isFinite(previous.cumulativeTradingFees)) throw new Error('INVALID_ACCOUNT_SNAPSHOT');
    if (expectedCurrent) {
      const current = snapshot();
      const fields = ['availableBalance', 'isolatedReserved', 'crossReserved', 'cumulativeFunding', 'cumulativeTradingFees'];
      if (fields.some((field) => current[field] !== expectedCurrent[field])) throw new Error('ACCOUNT_CHANGED_SINCE_TRANSACTION_COMMIT');
    }
    cash = previous.availableBalance;
    isolatedReserved = previous.isolatedReserved;
    crossReserved = previous.crossReserved;
    cumulativeFunding = previous.cumulativeFunding;
    cumulativeTradingFees = previous.cumulativeTradingFees;
    return snapshot();
  }

  function consumeLiquidation(amount, marginMode = 'ISOLATED') {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) throw new Error('INVALID_MARGIN_AMOUNT');
    if (marginMode === 'CROSS') crossReserved = Math.max(0, crossReserved - value);
    else isolatedReserved = Math.max(0, isolatedReserved - value);
    return snapshot();
  }

  function available() { return cash; }
  function crossWalletBalance() { return cash + crossReserved; }

  function health(positions, markPriceOf) {
    return crossAccountHealth({ walletBalance: crossWalletBalance(), positions, markPriceOf });
  }

  function previewCrossLiquidation(positions, markPriceOf) {
    const cross = health(positions, markPriceOf);
    if (!cross.liquidatable) throw new Error('CROSS_ACCOUNT_NOT_LIQUIDATABLE');
    const walletBefore = crossWalletBalance();
    const survivingEquity = Math.max(0, cross.equity);
    return Object.freeze({ walletBefore, realizedLoss: Math.max(0, walletBefore - survivingEquity), badDebt: Math.max(0, -cross.equity), survivingEquity, closedPositions: cross.positions, health: cross, expectedCash: cash, expectedCrossReserved: crossReserved });
  }

  function commitCrossLiquidation(preview) {
    if (!preview || !Number.isFinite(preview.survivingEquity) || !Number.isFinite(preview.badDebt)) throw new Error('INVALID_LIQUIDATION_PREVIEW');
    if (cash !== preview.expectedCash || crossReserved !== preview.expectedCrossReserved) throw new Error('ACCOUNT_CHANGED_SINCE_LIQUIDATION_PREVIEW');
    crossReserved = 0;
    cash = preview.survivingEquity;
    return Object.freeze({ liquidated: true, walletBefore: preview.walletBefore, realizedLoss: preview.realizedLoss, badDebt: preview.badDebt, survivingEquity: preview.survivingEquity, closedPositions: preview.closedPositions, health: preview.health, account: snapshot(), liquidatedAt: new Date().toISOString() });
  }

  function liquidateCross(positions, markPriceOf) { return commitCrossLiquidation(previewCrossLiquidation(positions, markPriceOf)); }

  function snapshot() {
    return Object.freeze({ initialBalance: initial, availableBalance: cash, isolatedReserved, crossReserved, crossWalletBalance: crossWalletBalance(), totalReserved: isolatedReserved + crossReserved, cumulativeFunding, cumulativeTradingFees });
  }

  return Object.freeze({ reserve, release, settleFunding, settleTradingFee, restoreSnapshot, consumeLiquidation, available, crossWalletBalance, health, previewCrossLiquidation, commitCrossLiquidation, liquidateCross, snapshot });
}
