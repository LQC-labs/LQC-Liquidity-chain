// LQC Flow Futures — DEMO position model.
// Positions are in-memory objects; no live settlement or custody.

import { getFuturesMarket } from "./markets.js";
import { positionHealth } from "./risk-engine.js";

function positiveNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

function isStepAligned(value, step) {
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) <= 1e-8;
}

function normalizedSide(side) {
  const value = String(side).toUpperCase();
  if (value !== "LONG" && value !== "SHORT") throw new Error("INVALID_SIDE");
  return value;
}

function validateMarketPrecision(market, quantity, price) {
  if (!isStepAligned(quantity, market.stepSize)) throw new Error("QUANTITY_STEP_MISMATCH");
  if (!isStepAligned(price, market.tickSize)) throw new Error("PRICE_TICK_MISMATCH");
}

function effectiveLeverage(quantity, price, collateral) {
  return (quantity * price) / collateral;
}

export function openDemoPosition({ symbol, side, quantity, entryPrice, leverage, collateral }) {
  const market = getFuturesMarket(symbol);
  if (!market) throw new Error("UNKNOWN_MARKET");
  if (market.status === "SUSPENDED") throw new Error("MARKET_SUSPENDED");

  const positionSide = normalizedSide(side);
  const qty = positiveNumber(quantity, "INVALID_QUANTITY");
  const entry = positiveNumber(entryPrice, "INVALID_ENTRY_PRICE");
  const lev = positiveNumber(leverage, "INVALID_LEVERAGE");
  const margin = positiveNumber(collateral, "INVALID_COLLATERAL");
  validateMarketPrecision(market, qty, entry);
  if (!Number.isInteger(lev)) throw new Error("LEVERAGE_MUST_BE_INTEGER");
  if (lev > market.maxLeverage) throw new Error("LEVERAGE_EXCEEDS_MARKET_MAX");
  if (effectiveLeverage(qty, entry, margin) > market.maxLeverage + 1e-9) throw new Error("COLLATERAL_BELOW_MARKET_MINIMUM");

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
  const fillSymbol = String(fill?.symbol || position.symbol).replace(/[\s/_-]/g, "").toUpperCase();
  const fillSide = normalizedSide(fill?.side || position.side);
  if (fillSymbol !== position.symbol || fillSide !== position.side) throw new Error("POSITION_MERGE_MISMATCH");

  const fillQty = positiveNumber(fill?.quantity, "INVALID_QUANTITY");
  const fillPrice = positiveNumber(fill?.entryPrice, "INVALID_ENTRY_PRICE");
  const fillCollateral = positiveNumber(fill?.collateral, "INVALID_COLLATERAL");
  validateMarketPrecision(market, fillQty, fillPrice);
  const oldQty = positiveNumber(position.quantity, "INVALID_QUANTITY");
  const newQty = oldQty + fillQty;
  const weightedEntry = ((position.entryPrice * oldQty) + (fillPrice * fillQty)) / newQty;
  const collateral = position.collateral + fillCollateral;
  const leverage = effectiveLeverage(newQty, weightedEntry, collateral);
  if (leverage > market.maxLeverage + 1e-9) throw new Error("LEVERAGE_EXCEEDS_MARKET_MAX");

  return Object.freeze({
    ...position,
    quantity: newQty,
    entryPrice: weightedEntry,
    leverage,
    collateral,
    updatedAt: new Date().toISOString()
  });
}

// Reduce a position without changing its entry price. Returns the remaining
// position plus the released collateral ratio for account settlement.
export function reduceDemoPosition(position, quantity) {
  if (!position) throw new Error("POSITION_REQUIRED");
  const market = getFuturesMarket(position.symbol);
  if (!market) throw new Error("UNKNOWN_MARKET");
  const reduceQty = positiveNumber(quantity, "INVALID_QUANTITY");
  if (!isStepAligned(reduceQty, market.stepSize)) throw new Error("QUANTITY_STEP_MISMATCH");
  const currentQty = positiveNumber(position.quantity, "INVALID_QUANTITY");
  if (reduceQty > currentQty) throw new Error("REDUCE_EXCEEDS_POSITION");
  const ratio = reduceQty / currentQty;
  const releasedCollateral = position.collateral * ratio;
  if (Math.abs(reduceQty - currentQty) <= 1e-12) return Object.freeze({ position: null, releasedCollateral, ratio });
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
  if (!position) throw new Error("POSITION_REQUIRED");
  const market = getFuturesMarket(position.symbol);
  if (!market) throw new Error("UNKNOWN_MARKET");
  const price = positiveNumber(markPrice, "INVALID_MARK_PRICE");
  if (!isStepAligned(price, market.tickSize)) throw new Error("PRICE_TICK_MISMATCH");

  return Object.freeze({
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
  });
}
