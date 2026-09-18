// LQC Flow Futures — guarded Oracle/Index/Mark price service boundary.
// Index price is the validated multi-source spot reference.
// Mark price is a bounded smoothing layer used for PnL/liquidation so it cannot
// simply mirror a potentially abrupt index move.

import { validateOracleSources, priceCircuitBreaker } from './oracle-guard.js';

function normalizeSymbol(symbol) {
  const key = String(symbol || '').trim().toUpperCase();
  if (!key) throw new Error('ORACLE_SYMBOL_REQUIRED');
  return key;
}

function positiveRatio(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

function deriveMarkPrice({ previousMarkPrice, indexPrice, maxMarkIndexDeviationRatio }) {
  const index = Number(indexPrice);
  if (!Number.isFinite(index) || index <= 0) throw new Error('INVALID_INDEX_PRICE');
  if (previousMarkPrice == null) return index;
  const previous = Number(previousMarkPrice);
  if (!Number.isFinite(previous) || previous <= 0) throw new Error('INVALID_PREVIOUS_MARK_PRICE');
  const deviation = positiveRatio(maxMarkIndexDeviationRatio, 'INVALID_MARK_INDEX_DEVIATION');
  const lower = index * (1 - deviation);
  const upper = index * (1 + deviation);
  return Math.min(upper, Math.max(lower, previous));
}

export function createOraclePriceService({
  sourceProvider,
  guardOptions = {},
  maxMoveRatio = 0.1,
  maxMarkIndexDeviationRatio = 0.005,
  maxReadAgeMs = guardOptions.maxAgeMs ?? 30_000
} = {}) {
  if (!sourceProvider || typeof sourceProvider.getSources !== 'function') throw new Error('ORACLE_SOURCE_PROVIDER_REQUIRED');
  if (!Number.isFinite(Number(maxReadAgeMs)) || Number(maxReadAgeMs) < 0) throw new Error('INVALID_ORACLE_READ_AGE');
  positiveRatio(maxMarkIndexDeviationRatio, 'INVALID_MARK_INDEX_DEVIATION');

  const prices = new Map();
  const listeners = new Set();

  function snapshot(symbol = null) {
    if (symbol !== null) return prices.get(normalizeSymbol(symbol)) ?? null;
    return Object.freeze(Object.fromEntries(prices));
  }

  function refresh(symbol, { now = Date.now() } = {}) {
    const key = normalizeSymbol(symbol);
    const sources = sourceProvider.getSources(key);
    const validated = validateOracleSources(sources, { ...guardOptions, now });
    const previous = prices.get(key);

    if (previous) {
      const breaker = priceCircuitBreaker({ previousPrice: previous.indexPrice, nextPrice: validated.price, maxMoveRatio });
      if (!breaker.allowed) {
        const error = new Error('ORACLE_PRICE_CIRCUIT_BREAKER');
        error.breaker = breaker;
        throw error;
      }
    }

    const indexPrice = validated.price;
    const markPrice = deriveMarkPrice({
      previousMarkPrice: previous?.markPrice,
      indexPrice,
      maxMarkIndexDeviationRatio
    });
    const markIndexDeviationRatio = Math.abs(markPrice - indexPrice) / indexPrice;

    const next = Object.freeze({
      symbol: key,
      price: indexPrice, // compatibility alias for existing consumers
      indexPrice,
      markPrice,
      markIndexDeviationRatio,
      updatedAt: now,
      healthy: validated.healthy,
      sourceCount: validated.accepted.length,
      rejectedCount: validated.rejectedCount,
      sourceSpreadRatio: validated.sourceSpreadRatio
    });
    prices.set(key, next);
    for (const listener of listeners) listener(next);
    return next;
  }

  function getStatus(symbol, { now = Date.now() } = {}) {
    const key = normalizeSymbol(symbol);
    const current = prices.get(key);
    if (!current) return Object.freeze({ symbol: key, available: false, healthy: false, stale: true, ageMs: null });
    const ageMs = Math.max(0, Number(now) - Number(current.updatedAt));
    const stale = ageMs > Number(maxReadAgeMs);
    return Object.freeze({
      symbol: key, available: true, healthy: Boolean(current.healthy) && !stale, stale, ageMs,
      updatedAt: current.updatedAt, sourceCount: current.sourceCount, rejectedCount: current.rejectedCount,
      sourceSpreadRatio: current.sourceSpreadRatio, markIndexDeviationRatio: current.markIndexDeviationRatio
    });
  }

  function readablePrice(symbol, field, { now = Date.now(), allowStale = false } = {}) {
    const key = normalizeSymbol(symbol);
    const current = prices.get(key);
    if (!current) return null;
    const status = getStatus(key, { now });
    if (!allowStale && (!status.healthy || status.stale)) return null;
    return current[field];
  }

  function getIndexPrice(symbol, options = {}) {
    return readablePrice(symbol, 'indexPrice', options);
  }

  function getMarkPrice(symbol, options = {}) {
    return readablePrice(symbol, 'markPrice', options);
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new Error('INVALID_ORACLE_LISTENER');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({ snapshot, refresh, getStatus, getIndexPrice, getMarkPrice, subscribe });
}
