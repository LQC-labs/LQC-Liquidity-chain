// LQC Flow Futures — demo risk calculations only.
// No custody, settlement, oracle, or live liquidation execution is performed here.

import { getFuturesMarket } from './markets.js';

function positiveNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

export function calculateNotional({ quantity, markPrice }) {
  return Number(quantity) * Number(markPrice);
}

export function calculateInitialMargin({ quantity, markPrice, leverage }) {
  const lev = Number(leverage);
  if (!Number.isFinite(lev) || lev < 1) throw new Error("INVALID_LEVERAGE");
  return calculateNotional({ quantity, markPrice }) / lev;
}

export function calculateUnrealizedPnl({ side, quantity, entryPrice, markPrice }) {
  const direction = String(side).toUpperCase() === "SHORT" ? -1 : 1;
  return direction * Number(quantity) * (Number(markPrice) - Number(entryPrice));
}

export function calculateMaintenanceMargin({ quantity, markPrice, maintenanceMarginRate }) {
  return calculateNotional({ quantity, markPrice }) * Number(maintenanceMarginRate);
}

export function calculateLiquidationPrice({ side, quantity, entryPrice, collateral, maintenanceMarginRate }) {
  const qty = positiveNumber(quantity, "INVALID_QUANTITY");
  const entry = positiveNumber(entryPrice, "INVALID_ENTRY_PRICE");
  const margin = positiveNumber(collateral, "INVALID_COLLATERAL");
  const mmr = Number(maintenanceMarginRate);
  if (!Number.isFinite(mmr) || mmr < 0 || mmr >= 1) throw new Error("INVALID_MAINTENANCE_MARGIN_RATE");

  const normalizedSide = String(side).toUpperCase();
  if (normalizedSide === "LONG") {
    return Math.max(0, (qty * entry - margin) / (qty * (1 - mmr)));
  }
  if (normalizedSide === "SHORT") {
    return (margin + qty * entry) / (qty * (1 + mmr));
  }
  throw new Error("INVALID_SIDE");
}

export function positionHealth({ side, quantity, entryPrice, markPrice, collateral, maintenanceMarginRate }) {
  const unrealizedPnl = calculateUnrealizedPnl({ side, quantity, entryPrice, markPrice });
  const equity = Number(collateral) + unrealizedPnl;
  const maintenanceMargin = calculateMaintenanceMargin({ quantity, markPrice, maintenanceMarginRate });
  return {
    unrealizedPnl,
    equity,
    maintenanceMargin,
    liquidationPrice: calculateLiquidationPrice({ side, quantity, entryPrice, collateral, maintenanceMarginRate }),
    liquidatable: equity <= maintenanceMargin
  };
}

// DEMO cross-margin account health. Cross positions share one account equity
// pool instead of being liquidated from each position's reserved collateral.
// `walletBalance` is realized account balance/collateral before unrealized PnL.
export function crossAccountHealth({ walletBalance, positions = [], markPriceOf }) {
  const wallet = Number(walletBalance);
  if (!Number.isFinite(wallet) || wallet < 0) throw new Error('INVALID_WALLET_BALANCE');
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
    details.push(Object.freeze({ symbol: position.symbol, side: position.side, markPrice, unrealizedPnl: pnl, notional: positionNotional, maintenanceMargin: mm }));
  }

  const equity = wallet + unrealizedPnl;
  const marginRatio = equity > 0 ? maintenanceMargin / equity : Infinity;
  return Object.freeze({
    walletBalance: wallet,
    unrealizedPnl,
    equity,
    notional,
    maintenanceMargin,
    marginRatio,
    liquidatable: details.length > 0 && equity <= maintenanceMargin,
    positions: Object.freeze(details)
  });
}
