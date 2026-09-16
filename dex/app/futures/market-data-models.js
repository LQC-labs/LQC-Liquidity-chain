// LQC Flow Futures — normalized market-data contracts.
// Transport independent: future REST and WebSocket gateways can serialize
// these models without coupling provider-specific payloads to the UI.

import { getFuturesMarket } from './markets.js';

function marketOf(symbol) {
  const market = getFuturesMarket(symbol);
  if (!market) throw new Error('UNKNOWN_MARKET');
  return market;
}

function finite(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(code);
  return number;
}

function positive(value, code) {
  const number = finite(value, code);
  if (number <= 0) throw new Error(code);
  return number;
}

function timestamp(value = Date.now()) {
  const number = finite(value, 'INVALID_TIMESTAMP');
  if (number < 0) throw new Error('INVALID_TIMESTAMP');
  return Math.trunc(number);
}

export function buildTicker({ symbol, lastPrice, markPrice, openPrice, highPrice, lowPrice, volume, quoteVolume, eventTime = Date.now() }) {
  const market = marketOf(symbol);
  const last = positive(lastPrice, 'INVALID_LAST_PRICE');
  const open = positive(openPrice ?? last, 'INVALID_OPEN_PRICE');
  const change = last - open;
  return Object.freeze({
    eventType: 'ticker24h',
    eventTime: timestamp(eventTime),
    symbol: market.symbol,
    lastPrice: last,
    markPrice: positive(markPrice ?? last, 'INVALID_MARK_PRICE'),
    openPrice: open,
    highPrice: positive(highPrice ?? Math.max(open, last), 'INVALID_HIGH_PRICE'),
    lowPrice: positive(lowPrice ?? Math.min(open, last), 'INVALID_LOW_PRICE'),
    priceChange: change,
    priceChangePercent: open ? (change / open) * 100 : 0,
    volume: Math.max(0, finite(volume ?? 0, 'INVALID_VOLUME')),
    quoteVolume: Math.max(0, finite(quoteVolume ?? 0, 'INVALID_QUOTE_VOLUME'))
  });
}

function normalizeLevel(level) {
  if (!Array.isArray(level) || level.length < 2) throw new Error('INVALID_DEPTH_LEVEL');
  return Object.freeze([positive(level[0], 'INVALID_DEPTH_PRICE'), positive(level[1], 'INVALID_DEPTH_QUANTITY')]);
}

export function buildDepthSnapshot({ symbol, lastUpdateId, bids = [], asks = [], eventTime = Date.now() }) {
  const market = marketOf(symbol);
  const updateId = Math.trunc(finite(lastUpdateId, 'INVALID_UPDATE_ID'));
  if (updateId < 0) throw new Error('INVALID_UPDATE_ID');
  return Object.freeze({
    eventType: 'depthSnapshot',
    eventTime: timestamp(eventTime),
    symbol: market.symbol,
    lastUpdateId: updateId,
    bids: Object.freeze(bids.map(normalizeLevel)),
    asks: Object.freeze(asks.map(normalizeLevel))
  });
}

export function buildTrade({ symbol, tradeId, price, quantity, side, eventTime = Date.now(), buyerMaker = null }) {
  const market = marketOf(symbol);
  const normalizedSide = String(side || '').toUpperCase();
  if (normalizedSide !== 'BUY' && normalizedSide !== 'SELL') throw new Error('INVALID_TRADE_SIDE');
  return Object.freeze({
    eventType: 'trade',
    eventTime: timestamp(eventTime),
    symbol: market.symbol,
    tradeId: String(tradeId),
    price: positive(price, 'INVALID_TRADE_PRICE'),
    quantity: positive(quantity, 'INVALID_TRADE_QUANTITY'),
    side: normalizedSide,
    buyerMaker: buyerMaker == null ? null : Boolean(buyerMaker)
  });
}

export function buildKline({ symbol, interval, openTime, closeTime, open, high, low, close, volume, quoteVolume = 0, trades = 0, closed = false }) {
  const market = marketOf(symbol);
  const normalizedInterval = String(interval || '').trim();
  if (!normalizedInterval) throw new Error('INVALID_KLINE_INTERVAL');
  const o = positive(open, 'INVALID_KLINE_OPEN');
  const h = positive(high, 'INVALID_KLINE_HIGH');
  const l = positive(low, 'INVALID_KLINE_LOW');
  const c = positive(close, 'INVALID_KLINE_CLOSE');
  if (h < Math.max(o, c) || l > Math.min(o, c) || h < l) throw new Error('INVALID_KLINE_RANGE');
  return Object.freeze({
    eventType: 'kline',
    symbol: market.symbol,
    interval: normalizedInterval,
    openTime: timestamp(openTime),
    closeTime: timestamp(closeTime),
    open: o,
    high: h,
    low: l,
    close: c,
    volume: Math.max(0, finite(volume ?? 0, 'INVALID_KLINE_VOLUME')),
    quoteVolume: Math.max(0, finite(quoteVolume ?? 0, 'INVALID_KLINE_QUOTE_VOLUME')),
    trades: Math.max(0, Math.trunc(finite(trades ?? 0, 'INVALID_KLINE_TRADES'))),
    closed: Boolean(closed)
  });
}

export function buildMarkPrice({ symbol, markPrice, indexPrice = null, fundingRate = 0, nextFundingTime = null, eventTime = Date.now() }) {
  const market = marketOf(symbol);
  return Object.freeze({
    eventType: 'markPrice',
    eventTime: timestamp(eventTime),
    symbol: market.symbol,
    markPrice: positive(markPrice, 'INVALID_MARK_PRICE'),
    indexPrice: indexPrice == null ? null : positive(indexPrice, 'INVALID_INDEX_PRICE'),
    fundingRate: finite(fundingRate, 'INVALID_FUNDING_RATE'),
    nextFundingTime: nextFundingTime == null ? null : timestamp(nextFundingTime)
  });
}
