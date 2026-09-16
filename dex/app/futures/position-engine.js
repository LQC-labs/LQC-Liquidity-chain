// LQC Flow Futures — DEMO position model.
// Positions are in-memory objects; no live settlement or custody.

import { getFuturesMarket } from "./markets.js";
import { positionHealth } from "./risk-engine.js";

function positiveNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

function normalizedSide(side) {
  const value = String(side).toUpperCase();
  if (value !== "LONG" && value !== "SHORT") throw new Error("INVALID_SIDE");
  return value;
}

export function openDemoPosition({ symbol, side, quantity, entryPrice, leverage, collateral }) {
  const market = getFuturesMarket(symbol);
  if (!market) throw new Error("UNKNOWN_MARKET");

  const positionSide = normalizedSide(side);
  const qty = positiveNumber(quantity, "INVALID_QUANTITY");
  const entry = positiveNumber(entryPrice, "INVALID_ENTRY_PRICE");
  const lev = positiveNumber(leverage, "INVALID_LEVERAGE");
  const margin = positiveNumber(collateral, "INVALID_COLLATERAL");
  if (lev > market.maxLeverage) throw new Error("LEVERAGE_EXCEEDS_MARKET_MAX");

  return Object.freeze({
    id: `position-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mode: "DEMO",
    symbol: market.symbol,
    side: positionSide,
    quantity: qty,
    entryPrice: entry,
    leverage: lev,
    collateral: margin,
    openedAt: new Date().toISOString()
  });
}

// Merge same-market/same-side fills into one demo position.
// Entry price is quantity-weighted and collateral is additive.
export function mergeDemoPosition(position, fill) {
  if (!position) throw new Error("POSITION_REQUIRED");
  const market = getFuturesMarket(position.symbol);
  if (!market) throw new Error("UNKNOWN_MARKET");
  const fillSymbol = String(fill?.symbol || position.symbol).toUpperCase();
  const fillSide = normalizedSide(fill?.side || position.side);
  if (fillSymbol !== position.symbol || fillSide !== position.side) throw new Error("POSITION_MERGE_MISMATCH");

  const fillQty = positiveNumber(fill?.quantity, "INVALID_QUANTITY");
  const fillPrice = positiveNumber(fill?.entryPrice, "INVALID_ENTRY_PRICE");
  const fillCollateral = positiveNumber(fill?.collateral, "INVALID_COLLATERAL");
  const oldQty = positiveNumber(position.quantity, "INVALID_QUANTITY");
  const newQty = oldQty + fillQty;
  const weightedEntry = ((position.entryPrice * oldQty) + (fillPrice * fillQty)) / newQty;
  const collateral = position.collateral + fillCollateral;
  const effectiveLeverage = (weightedEntry * newQty) / collateral;
  if (effectiveLeverage > market.maxLeverage + 1e-9) throw new Error("LEVERAGE_EXCEEDS_MARKET_MAX");

  return Object.freeze({
    ...position,
    quantity: newQty,
    entryPrice: weightedEntry,
    leverage: effectiveLeverage,
    collateral,
    updatedAt: new Date().toISOString()
  });
}

// Reduce a position without changing its entry price. Returns the remaining
// position plus the released collateral ratio for account settlement.
export function reduceDemoPosition(position, quantity) {
  if (!position) throw new Error("POSITION_REQUIRED");
  const reduceQty = positiveNumber(quantity, "INVALID_QUANTITY");
  const currentQty = positiveNumber(position.quantity, "INVALID_QUANTITY");
  if (reduceQty > currentQty) throw new Error("REDUCE_EXCEEDS_POSITION");
  const ratio = reduceQty / currentQty;
  const releasedCollateral = position.collateral * ratio;
  if (reduceQty === currentQty) return Object.freeze({ position: null, releasedCollateral, ratio });
  return Object.freeze({
    position: Object.freeze({
      ...position,
      quantity: currentQty - reduceQty,
      collateral: position.collateral - releasedCollateral,
      updatedAt: new Date().toISOString()
    }),
    releasedCollateral,
    ratio
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
