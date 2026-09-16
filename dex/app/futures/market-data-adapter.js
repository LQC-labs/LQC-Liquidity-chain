// LQC Flow Futures — isolated market data adapter.
// Keeps external price feeds behind one interface so Futures UI does not
// depend directly on any exchange/provider API.

const DEFAULT_PRICES = Object.freeze({
  LQCUSDT: 0.1854,
  BTCUSDT: 115000,
  ETHUSDT: 4500,
  SOLUSDT: 235,
  XRPUSDT: 3.05,
  FILUSDT: 4.2
});

export function createDemoMarketData(seed = DEFAULT_PRICES) {
  const prices = { ...seed };
  const listeners = new Set();

  function snapshot() {
    return Object.freeze({ ...prices });
  }

  function getMarkPrice(symbol) {
    const value = Number(prices[String(symbol || '').toUpperCase()]);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function setMarkPrice(symbol, price) {
    const key = String(symbol || '').toUpperCase();
    const value = Number(price);
    if (!key || !Number.isFinite(value) || value <= 0) throw new Error('INVALID_MARK_PRICE');
    prices[key] = value;
    const event = Object.freeze({ symbol: key, markPrice: value, source: 'DEMO' });
    for (const listener of listeners) listener(event);
    return event;
  }

  function moveMarkPrice(symbol, ratio) {
    const current = getMarkPrice(symbol);
    if (!current) throw new Error('UNKNOWN_MARKET_PRICE');
    return setMarkPrice(symbol, Math.max(1e-8, current * (1 + Number(ratio || 0))));
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new Error('INVALID_MARKET_DATA_LISTENER');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({ source: 'DEMO', snapshot, getMarkPrice, setMarkPrice, moveMarkPrice, subscribe });
}

// Future live providers should implement the same minimal contract:
// { source, snapshot(), getMarkPrice(symbol), subscribe(listener) }
export const demoMarketData = createDemoMarketData();
