// LQC Flow Futures — isolated multi-market registry
// Kept outside the existing AMM/Router2 modules to minimize merge conflicts.

const MARKET_STATUS = Object.freeze({ DEMO: "DEMO", ACTIVE: "ACTIVE", SUSPENDED: "SUSPENDED" });
const MARKET_TYPE = "PERPETUAL";

const defineMarket = ({ symbol, base, quote = "USDT", status = MARKET_STATUS.DEMO, maxLeverage, tickSize, stepSize, maintenanceMarginRate }) => Object.freeze({
  symbol: String(symbol).toUpperCase(),
  base: String(base).toUpperCase(),
  quote: String(quote).toUpperCase(),
  type: MARKET_TYPE,
  status,
  maxLeverage,
  tickSize,
  stepSize,
  maintenanceMarginRate
});

export const FUTURES_MARKETS = Object.freeze([
  defineMarket({ symbol: "LQCUSDT", base: "LQC", maxLeverage: 20, tickSize: 0.0001, stepSize: 1, maintenanceMarginRate: 0.01 }),
  defineMarket({ symbol: "BTCUSDT", base: "BTC", maxLeverage: 50, tickSize: 0.1, stepSize: 0.001, maintenanceMarginRate: 0.005 }),
  defineMarket({ symbol: "ETHUSDT", base: "ETH", maxLeverage: 50, tickSize: 0.01, stepSize: 0.001, maintenanceMarginRate: 0.005 }),
  defineMarket({ symbol: "SOLUSDT", base: "SOL", maxLeverage: 25, tickSize: 0.001, stepSize: 0.01, maintenanceMarginRate: 0.0075 }),
  defineMarket({ symbol: "XRPUSDT", base: "XRP", maxLeverage: 20, tickSize: 0.0001, stepSize: 1, maintenanceMarginRate: 0.01 }),
  defineMarket({ symbol: "FILUSDT", base: "FIL", maxLeverage: 20, tickSize: 0.001, stepSize: 0.1, maintenanceMarginRate: 0.01 })
]);

export function normalizeFuturesSymbol(symbol) {
  return String(symbol || "").trim().replace(/[\s/_-]/g, "").toUpperCase();
}

export function validateFuturesMarket(market) {
  if (!market || typeof market !== "object") return false;
  if (!/^[A-Z0-9]{2,20}$/.test(market.symbol || "")) return false;
  if (!/^[A-Z0-9]{2,12}$/.test(market.base || "") || !/^[A-Z0-9]{2,12}$/.test(market.quote || "")) return false;
  if (market.symbol !== `${market.base}${market.quote}` || market.type !== MARKET_TYPE) return false;
  if (!Object.values(MARKET_STATUS).includes(market.status)) return false;
  return Number.isFinite(market.maxLeverage) && market.maxLeverage >= 1
    && Number.isFinite(market.tickSize) && market.tickSize > 0
    && Number.isFinite(market.stepSize) && market.stepSize > 0
    && Number.isFinite(market.maintenanceMarginRate) && market.maintenanceMarginRate > 0 && market.maintenanceMarginRate < 1;
}

export function getFuturesMarket(symbol) {
  const normalized = normalizeFuturesSymbol(symbol);
  return FUTURES_MARKETS.find((market) => market.symbol === normalized) || null;
}

export function listActiveFuturesMarkets() {
  return FUTURES_MARKETS.filter((market) => market.status === MARKET_STATUS.DEMO || market.status === MARKET_STATUS.ACTIVE);
}

export function buildFuturesMarketRegistry(markets = FUTURES_MARKETS) {
  const registry = new Map();
  for (const market of markets) {
    if (!validateFuturesMarket(market)) throw new Error(`Invalid futures market: ${market?.symbol || "unknown"}`);
    if (registry.has(market.symbol)) throw new Error(`Duplicate futures market: ${market.symbol}`);
    registry.set(market.symbol, market);
  }
  return registry;
}

// Validate the static listing table at module load so bad listings fail CI early.
buildFuturesMarketRegistry();
