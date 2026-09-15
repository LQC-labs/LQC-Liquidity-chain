// LQC Flow Futures — DEMO position model.
// Positions are in-memory objects; no live settlement or custody.

import { getFuturesMarket } from "./markets.js";
import { positionHealth } from "./risk-engine.js";

export function openDemoPosition({ symbol, side, quantity, entryPrice, leverage, collateral }) {
  const market = getFuturesMarket(symbol);
  if (!market) throw new Error("UNKNOWN_MARKET");
  if (Number(leverage) < 1 || Number(leverage) > market.maxLeverage) throw new Error("INVALID_LEVERAGE");

  return Object.freeze({
    id: `position-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mode: "DEMO",
    symbol: market.symbol,
    side: String(side).toUpperCase(),
    quantity: Number(quantity),
    entryPrice: Number(entryPrice),
    leverage: Number(leverage),
    collateral: Number(collateral),
    openedAt: new Date().toISOString()
  });
}

export function markDemoPosition(position, markPrice) {
  const market = getFuturesMarket(position.symbol);
  if (!market) throw new Error("UNKNOWN_MARKET");

  return {
    ...position,
    markPrice: Number(markPrice),
    ...positionHealth({
      side: position.side,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      markPrice,
      collateral: position.collateral,
      maintenanceMarginRate: market.maintenanceMarginRate
    })
  };
}
