// LQC Flow Futures — demo risk calculations only.
// No custody, settlement, oracle, or live liquidation execution is performed here.

import { getFuturesMarket } from './markets.js';

function positiveNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

function normalizedSide(side) {
  const value = String(side || '').toUpperCase();
  if (value !== 'LONG' && value !== 'SHORT') throw new Error('INVALID_SIDE');
  return value;
}

function maintenanceRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) throw new Error('INVALID_MAINTENANCE_MARGIN_RATE');
  return rate;
}

export function calculateNotional({ quantity, markPrice }) {
  return positiveNumber(quantity, 'INVALID_QUANTITY') * positiveNumber(markPrice, 'INVALID_MARK_PRICE');
}

export function calculateInitialMargin({ quantity, markPrice, leverage }) {
  const lev = positiveNumber(leverage, 'INVALID_LEVERAGE');
  return calculateNotional({ quantity, markPrice }) / lev;
}

export function calculateUnrealizedPnl({ side, quantity, entryPrice, markPrice }) {
  const direction = normalizedSide(side) === 'SHORT' ? -1 : 1;
  const qty = positiveNumber(quantity, 'INVALID_QUANTITY');
  const entry = positiveNumber(entryPrice, 'INVALID_ENTRY_PRICE');
  const mark = positiveNumber(markPrice, 'INVALID_MARK_PRICE');
  return direction * qty * (mark - entry);
}

export function calculateMaintenanceMargin({ quantity, markPrice, maintenanceMarginRate }) {
  return calculateNotional({ quantity, markPrice }) * maintenanceRate(maintenanceMarginRate);
}

export function calculateLiquidationPrice({ side, quantity, entryPrice, collateral, maintenanceMarginRate }) {
  const qty = positiveNumber(quantity, 'INVALID_QUANTITY');
  const entry = positiveNumber(entryPrice, 'INVALID_ENTRY_PRICE');
  const margin = positiveNumber(collateral, 'INVALID_COLLATERAL');
  const mmr = maintenanceRate(maintenanceMarginRate);
  const positionSide = normalizedSide(side);

  if (positionSide === 'LONG') {
    return Math.max(0, (qty * entry - margin) / (qty * (1 - mmr)));
  }
  return (margin + qty * entry) / (qty * (1 + mmr));
}

export function positionHealth({ side, quantity, entryPrice, markPrice, collateral, maintenanceMarginRate }) {
  const margin = positiveNumber(collateral, 'INVALID_COLLATERAL');
  const unrealizedPnl = calculateUnrealizedPnl({ side, quantity, entryPrice, markPrice });
  const equity = margin + unrealizedPnl;
  const maintenanceMargin = calculateMaintenanceMargin({ quantity, markPrice, maintenanceMarginRate });
  const marginRatio = equity > 0 ? maintenanceMargin / equity : Infinity;
  const liquidationBuffer = equity - maintenanceMargin;
  return Object.freeze({
    unrealizedPnl,
    equity,
    maintenanceMargin,
    marginRatio,
    liquidationBuffer,
    liquidationPrice: calculateLiquidationPrice({ side, quantity, entryPrice, collateral: margin, maintenanceMarginRate }),
    liquidatable: equity <= maintenanceMargin
  });
}

export function liquidationAction(position, markPrice) {
  if (!position) throw new Error('POSITION_REQUIRED');
  const market = getFuturesMarket(position.symbol);
  if (!market) throw new Error('UNKNOWN_MARKET');
  const health = positionHealth({
    side: position.side,
    quantity: position.quantity,
    entryPrice: position.entryPrice,
    markPrice,
    collateral: position.collateral,
    maintenanceMarginRate: market.maintenanceMarginRate
  });
  return Object.freeze({
    symbol: market.symbol,
    positionId: position.id || null,
    action: health.liquidatable ? 'LIQUIDATE' : 'HOLD',
    markPrice: Number(markPrice),
    ...health
  });
}

// DEMO cross-margin account health. Cross positions share one account equity
// pool instead of being liquidated from each position's reserved collateral.
// `walletBalance` is realized account balance/collateral before unrealized PnL.
export function crossAccountHealth({ walletBalance, positions = [], markPriceOf }) {
  const wallet = Number(walletBalance);
  if (!Number.isFinite(wallet) || wallet < 0) throw new Error('INVALID_WALLET_BALANCE');
  if (!Array.isArray(positions)) throw new Error('INVALID_POSITIONS');
  if (typeof markPriceOf !== 'function') throw new Error('MARK_PRICE_PROVIDER_REQUIRED');

  let unrealizedPnl = 0;
  let maintenanceMargin = 0;
  let notional = 0;
  const details = [];

  for (const position of positions) {
    if (position.marginMode !== 'CROSS') continue;
    const market = getFuturesMarket(position.symbol);
    if (!market) throw new Error('UNKNOWN_MARKET');
    const markPrice = positiveNumber(markPriceOf(position.symbol), 'INVALID_MARK_PRICE');
    const pnl = calculateUnrealizedPnl({
      side: position.side,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      markPrice
    });
    const positionNotional = calculateNotional({ quantity: position.quantity, markPrice });
    const mm = calculateMaintenanceMargin({
      quantity: position.quantity,
      markPrice,
      maintenanceMarginRate: market.maintenanceMarginRate
    });
    unrealizedPnl += pnl;
    maintenanceMargin += mm;
    notional += positionNotional;
    details.push(Object.freeze({ symbol: position.symbol, side: normalizedSide(position.side), markPrice, unrealizedPnl: pnl, notional: positionNotional, maintenanceMargin: mm }));
  }

  const equity = wallet + unrealizedPnl;
  const marginRatio = equity > 0 ? maintenanceMargin / equity : Infinity;
  const liquidationBuffer = equity - maintenanceMargin;
  return Object.freeze({
    walletBalance: wallet,
    unrealizedPnl,
    equity,
    notional,
    maintenanceMargin,
    marginRatio,
    liquidationBuffer,
    liquidatable: details.length > 0 && equity <= maintenanceMargin,
    positions: Object.freeze(details)
  });
}
