// LQC Flow Futures — DEMO position model.
// Positions are in-memory objects; no live settlement or custody.

import { getFuturesMarket } from "./markets.js";
import { positionHealth } from "./risk-engine.js";

function positiveNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

export function openDemoPosition({ symbol, side, quantity, entryPrice, leverage, collateral }) {
  const market = getFuturesMarket(symbol);
  if (!market) throw new Error("UNKNOWN_MARKET");

  const normalizedSide = String(side).toUpperCase();
  if (normalizedSide !== "LONG" && normalizedSide !== "SHORT") throw new Error("INVALID_SIDE");

  const qty = positiveNumber(quantity, "INVALID_QUANTITY");
  const entry = positiveNumber(entryPrice, "INVALID_ENTRY_PRICE");
  const lev = positiveNumber(leverage, "INVALID_LEVERAGE");
  const margin = positiveNumber(collateral, "INVALID_COLLATERAL");
  if (lev > market.maxLeverage) throw new Error("LEVERAGE_EXCEEDS_MARKET_MAX");

  return Object.freeze({
    id: `position-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mode: "DEMO",
    symbol: market.symbol,
    side: normalizedSide,
    quantity: qty,
    entryPrice: entry,
    leverage: lev,
    collateral: margin,
    openedAt: new Date().toISOString()
  });
}

export function markDemoPosition(position, markPrice) {
  const market = getFuturesMarket(position.symbol);
  if (!market) throw new Error("UNKNOWN_MARKET");
  const price = positiveNumber(markPrice, "INVALID_MARK_PRICE");

  return {
    ...position,
    markPrice: price,
    ...positionHealth({
      side: position.side,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      markPrice: price,
      collateral: position.collateral,
      maintenanceMarginRate: market.maintenanceMarginRate
    })
  };
}
