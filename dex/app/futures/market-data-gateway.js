// LQC Flow Futures — transport-independent public market-data gateway.
// Shared Oracle/Price service owns guarded mark prices; DEX/Futures consumers
// receive only healthy, fresh prices through this boundary.

import { getExchangeInfo, getExchangeSymbolInfo } from './exchange-info.js';
import { buildTicker, buildDepthSnapshot, buildTrade, buildKline, buildMarkPrice } from './market-data-models.js';

function normalizeSymbol(symbol) { const value = String(symbol || '').trim().toUpperCase(); if (!value || !getExchangeSymbolInfo(value)) throw new Error('UNKNOWN_MARKET'); return value; }
function normalizeLimit(value, fallback = 100, max = 1000) { const number = value == null ? fallback : Number(value); if (!Number.isInteger(number) || number < 1 || number > max) throw new Error('INVALID_LIMIT'); return number; }

export function createMarketDataGateway(provider, { oraclePriceService = null, now = () => Date.now() } = {}) {
  if (!provider) throw new Error('INVALID_MARKET_DATA_PROVIDER');
  if (!oraclePriceService && typeof provider.getMarkPrice !== 'function') throw new Error('INVALID_MARKET_DATA_PROVIDER');
  if (oraclePriceService && typeof oraclePriceService.getMarkPrice !== 'function') throw new Error('INVALID_ORACLE_PRICE_SERVICE');
  if (typeof now !== 'function') throw new Error('INVALID_CLOCK');

  function guardedMarkPrice(key) {
    const price = oraclePriceService ? oraclePriceService.getMarkPrice(key, { now: now() }) : provider.getMarkPrice(key);
    if (!Number.isFinite(Number(price)) || Number(price) <= 0) throw new Error('MARK_PRICE_UNAVAILABLE');
    return Number(price);
  }
  function oracleStatus(key) {
    if (!oraclePriceService || typeof oraclePriceService.getStatus !== 'function') return null;
    return Object.freeze({ ...oraclePriceService.getStatus(key, { now: now() }) });
  }
  function exchangeInfo(symbol = null) { return symbol ? getExchangeSymbolInfo(normalizeSymbol(symbol)) : getExchangeInfo(); }
  function markPrice(symbol) { const key = normalizeSymbol(symbol); return buildMarkPrice({ symbol: key, markPrice: guardedMarkPrice(key) }); }
  function ticker24h(symbol) { const key = normalizeSymbol(symbol); const mark = guardedMarkPrice(key); if (typeof provider.getTicker24h === 'function') return buildTicker({ symbol: key, ...provider.getTicker24h(key), markPrice: mark }); return buildTicker({ symbol: key, lastPrice: mark, markPrice: mark, openPrice: mark, highPrice: mark, lowPrice: mark, volume: 0, quoteVolume: 0 }); }
  function depth(symbol, limit = 100) { const key = normalizeSymbol(symbol); const size = normalizeLimit(limit, 100, 1000); if (typeof provider.getDepth !== 'function') throw new Error('DEPTH_UNAVAILABLE'); const raw = provider.getDepth(key, size); return buildDepthSnapshot({ symbol: key, ...raw, bids: (raw.bids || []).slice(0, size), asks: (raw.asks || []).slice(0, size) }); }
  function trades(symbol, limit = 100) { const key = normalizeSymbol(symbol); const size = normalizeLimit(limit, 100, 1000); if (typeof provider.getTrades !== 'function') throw new Error('TRADES_UNAVAILABLE'); return Object.freeze(provider.getTrades(key, size).slice(0, size).map((trade) => buildTrade({ symbol: key, ...trade }))); }
  function klines(symbol, interval, limit = 500) { const key = normalizeSymbol(symbol); const size = normalizeLimit(limit, 500, 1500); if (typeof provider.getKlines !== 'function') throw new Error('KLINES_UNAVAILABLE'); return Object.freeze(provider.getKlines(key, interval, size).slice(0, size).map((kline) => buildKline({ symbol: key, interval, ...kline }))); }
  function subscribe(symbol, listener) { const key = normalizeSymbol(symbol); if (typeof listener !== 'function') throw new Error('INVALID_MARKET_DATA_LISTENER'); const stream = oraclePriceService?.subscribe ?? provider.subscribe; if (typeof stream !== 'function') throw new Error('STREAM_UNAVAILABLE'); return stream.call(oraclePriceService ?? provider, (event) => { if (event.symbol === key) listener(Object.freeze({ ...event, symbol: key })); }); }

  return Object.freeze({ exchangeInfo, markPrice, ticker24h, depth, trades, klines, subscribe, oracleStatus });
}
