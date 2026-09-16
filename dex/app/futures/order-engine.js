// LQC Flow Futures — client-side DEMO order validation/model.
// This module intentionally does not touch AMM/Router2 execution.

import { getFuturesMarket } from "./markets.js";
import { calculateInitialMargin, calculateNotional } from "./risk-engine.js";

const ORDER_TYPES = new Set(["MARKET", "LIMIT"]);
const SIDES = new Set(["LONG", "SHORT"]);

function positiveNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

export function validateDemoOrder(input) {
  const market = getFuturesMarket(input.symbol);
  if (!market) throw new Error("UNKNOWN_MARKET");

  const side = String(input.side || "").toUpperCase();
  const type = String(input.type || "MARKET").toUpperCase();
  if (!SIDES.has(side)) throw new Error("INVALID_SIDE");
  if (!ORDER_TYPES.has(type)) throw new Error("INVALID_ORDER_TYPE");

  const quantity = positiveNumber(input.quantity, "INVALID_QUANTITY");
  const leverage = positiveNumber(input.leverage, "INVALID_LEVERAGE");
  if (leverage > market.maxLeverage) throw new Error("LEVERAGE_EXCEEDS_MARKET_MAX");

  const referencePrice = positiveNumber(
    type === "LIMIT" ? input.price : input.markPrice,
    type === "LIMIT" ? "INVALID_LIMIT_PRICE" : "INVALID_MARK_PRICE"
  );

  return { market, side, type, quantity, leverage, referencePrice };
}

export function buildDemoOrder(input) {
  const validated = validateDemoOrder(input);
  const { market, side, type, quantity, leverage, referencePrice } = validated;
  const notional = calculateNotional({ quantity, markPrice: referencePrice });
  const initialMargin = calculateInitialMargin({ quantity, markPrice: referencePrice, leverage });

  return Object.freeze({
    id: `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mode: "DEMO",
    symbol: market.symbol,
    side,
    type,
    quantity,
    price: type === "LIMIT" ? referencePrice : null,
    referencePrice,
    leverage,
    notional,
    initialMargin,
    reduceOnly: Boolean(input.reduceOnly),
    takeProfit: input.takeProfit ? Number(input.takeProfit) : null,
    stopLoss: input.stopLoss ? Number(input.stopLoss) : null,
    status: "PENDING_DEMO",
    createdAt: new Date().toISOString()
  });
}
