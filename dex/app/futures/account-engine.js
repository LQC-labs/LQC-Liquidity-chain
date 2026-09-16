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

  // Funding payment is signed from the account holder's perspective:
  // positive = credit, negative = debit. Credits/debits settle directly to
  // account cash while reserved margin remains unchanged.
  function settleFunding(payment) {
    const value = Number(payment);
    if (!Number.isFinite(value)) throw new Error('INVALID_FUNDING_PAYMENT');
    if (cash + value < -1e-9) throw new Error('INSUFFICIENT_BALANCE_FOR_FUNDING');
    cash = Math.max(0, cash + value);
    cumulativeFunding += value;
    return snapshot();
  }

  // Trading fees are account debits. The fee engine remains independent from
  // the DEX router; Futures settlement only receives the calculated fee.
  function settleTradingFee(fee) {
    const value = Number(fee);
    if (!Number.isFinite(value) || value < 0) throw new Error('INVALID_TRADING_FEE');
    if (cash - value < -1e-9) throw new Error('INSUFFICIENT_BALANCE_FOR_TRADING_FEE');
    cash = Math.max(0, cash - value);
    cumulativeTradingFees += value;
    return snapshot();
  }

  function consumeLiquidation(amount, marginMode = 'ISOLATED') {
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) throw new Error('INVALID_MARGIN_AMOUNT');
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

  function liquidateCross(positions, markPriceOf) {
    const cross = health(positions, markPriceOf);
    if (!cross.liquidatable) throw new Error('CROSS_ACCOUNT_NOT_LIQUIDATABLE');

    const walletBefore = crossWalletBalance();
    const survivingEquity = Math.max(0, cross.equity);
    const realizedLoss = Math.max(0, walletBefore - survivingEquity);

    // Cross liquidation closes the shared-risk pool. Any positive surviving
    // equity becomes available cash; all cross reservations are released.
    crossReserved = 0;
    cash = survivingEquity;

    return Object.freeze({
      liquidated: true,
      walletBefore,
      realizedLoss,
      survivingEquity,
      closedPositions: cross.positions,
      health: cross,
      account: snapshot(),
      liquidatedAt: new Date().toISOString()
    });
  }

  function snapshot() {
    return Object.freeze({
      initialBalance: initial,
      availableBalance: cash,
      isolatedReserved,
      crossReserved,
      crossWalletBalance: crossWalletBalance(),
      totalReserved: isolatedReserved + crossReserved,
      cumulativeFunding,
      cumulativeTradingFees
    });
  }

  return Object.freeze({ reserve, release, settleFunding, settleTradingFee, consumeLiquidation, available, crossWalletBalance, health, liquidateCross, snapshot });
}
