// LQC Flow Futures — shared guarded Oracle/Price service boundary.
// DEX Router and Futures Engine may consume this service, but neither owns it.
// External feed adapters stay behind sourceProvider so trading engines remain isolated.

import { validateOracleSources, priceCircuitBreaker } from './oracle-guard.js';

function normalizeSymbol(symbol) {
  const key = String(symbol || '').trim().toUpperCase();
  if (!key) throw new Error('ORACLE_SYMBOL_REQUIRED');
  return key;
}

export function createOraclePriceService({
  sourceProvider,
  guardOptions = {},
  maxMoveRatio = 0.1,
  maxReadAgeMs = guardOptions.maxAgeMs ?? 30_000
} = {}) {
  if (!sourceProvider || typeof sourceProvider.getSources !== 'function') throw new Error('ORACLE_SOURCE_PROVIDER_REQUIRED');
  if (!Number.isFinite(Number(maxReadAgeMs)) || Number(maxReadAgeMs) < 0) throw new Error('INVALID_ORACLE_READ_AGE');

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
      const breaker = priceCircuitBreaker({ previousPrice: previous.price, nextPrice: validated.price, maxMoveRatio });
      if (!breaker.allowed) {
        const error = new Error('ORACLE_PRICE_CIRCUIT_BREAKER');
        error.breaker = breaker;
        throw error;
      }
    }

    const next = Object.freeze({
      symbol: key,
      price: validated.price,
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
    return Object.freeze({ symbol: key, available: true, healthy: Boolean(current.healthy) && !stale, stale, ageMs, updatedAt: current.updatedAt, sourceCount: current.sourceCount, rejectedCount: current.rejectedCount, sourceSpreadRatio: current.sourceSpreadRatio });
  }

  function getMarkPrice(symbol, { now = Date.now(), allowStale = false } = {}) {
    const key = normalizeSymbol(symbol);
    const current = prices.get(key);
    if (!current) return null;
    const status = getStatus(key, { now });
    if (!allowStale && (!status.healthy || status.stale)) return null;
    return current.price;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new Error('INVALID_ORACLE_LISTENER');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({ snapshot, refresh, getStatus, getMarkPrice, subscribe });
}
