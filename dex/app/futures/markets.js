// LQC Flow Futures — isolated market registry
// Kept outside the existing AMM/Router2 modules to minimize merge conflicts.

export const FUTURES_MARKETS = Object.freeze([
  { symbol: "LQCUSDT", base: "LQC", quote: "USDT", type: "PERPETUAL", status: "DEMO", maxLeverage: 20, tickSize: 0.0001, stepSize: 1, maintenanceMarginRate: 0.01 },
  { symbol: "BTCUSDT", base: "BTC", quote: "USDT", type: "PERPETUAL", status: "DEMO", maxLeverage: 50, tickSize: 0.1, stepSize: 0.001, maintenanceMarginRate: 0.005 },
  { symbol: "ETHUSDT", base: "ETH", quote: "USDT", type: "PERPETUAL", status: "DEMO", maxLeverage: 50, tickSize: 0.01, stepSize: 0.001, maintenanceMarginRate: 0.005 },
  { symbol: "SOLUSDT", base: "SOL", quote: "USDT", type: "PERPETUAL", status: "DEMO", maxLeverage: 25, tickSize: 0.001, stepSize: 0.01, maintenanceMarginRate: 0.0075 },
  { symbol: "XRPUSDT", base: "XRP", quote: "USDT", type: "PERPETUAL", status: "DEMO", maxLeverage: 20, tickSize: 0.0001, stepSize: 1, maintenanceMarginRate: 0.01 },
  { symbol: "FILUSDT", base: "FIL", quote: "USDT", type: "PERPETUAL", status: "DEMO", maxLeverage: 20, tickSize: 0.001, stepSize: 0.1, maintenanceMarginRate: 0.01 }
]);

export function getFuturesMarket(symbol) {
  return FUTURES_MARKETS.find((market) => market.symbol === String(symbol || "").toUpperCase()) || null;
}

export function listActiveFuturesMarkets() {
  return FUTURES_MARKETS.filter((market) => market.status === "DEMO" || market.status === "ACTIVE");
}
