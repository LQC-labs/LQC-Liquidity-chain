// LQC Flow Futures — versioned exchange/instrument metadata contract.
// Designed as a transport-independent source for future REST/WebSocket gateways.

import { FUTURES_MARKETS, getFuturesMarket } from './markets.js';

export const EXCHANGE_INFO_VERSION = '1.0.0-demo';
export const EXCHANGE_ENVIRONMENT = 'DEMO';

function decimalPlaces(value) {
  const text = String(value);
  if (text.includes('e-')) return Number(text.split('e-')[1]);
  return (text.split('.')[1] || '').length;
}

function normalizeMarket(market) {
  return Object.freeze({
    symbol: market.symbol,
    displaySymbol: `${market.base}/${market.quote}`,
    baseAsset: market.base,
    quoteAsset: market.quote,
    contractType: market.type,
    status: market.status,
    pricePrecision: decimalPlaces(market.tickSize),
    quantityPrecision: decimalPlaces(market.stepSize),
    filters: Object.freeze({
      price: Object.freeze({ tickSize: market.tickSize }),
      quantity: Object.freeze({ stepSize: market.stepSize }),
      leverage: Object.freeze({ min: 1, max: market.maxLeverage }),
      maintenanceMarginRate: market.maintenanceMarginRate
    }),
    supportedOrderTypes: Object.freeze(['MARKET', 'LIMIT']),
    supportedMarginModes: Object.freeze(['ISOLATED', 'CROSS']),
    reduceOnlySupported: true,
    positionMode: 'HEDGE_DEMO'
  });
}

export function getExchangeInfo(now = Date.now) {
  const timestamp = Number(now());
  return Object.freeze({
    schemaVersion: EXCHANGE_INFO_VERSION,
    environment: EXCHANGE_ENVIRONMENT,
    serverTime: Number.isFinite(timestamp) ? timestamp : Date.now(),
    timezone: 'UTC',
    quoteAsset: 'USDT',
    symbols: Object.freeze(FUTURES_MARKETS.map(normalizeMarket))
  });
}

export function getExchangeSymbolInfo(symbol) {
  const market = getFuturesMarket(symbol);
  return market ? normalizeMarket(market) : null;
}

// Future API gateway mapping:
// GET /api/v1/exchangeInfo -> getExchangeInfo()
// GET /api/v1/exchangeInfo?symbol=LQCUSDT -> getExchangeSymbolInfo('LQCUSDT')
