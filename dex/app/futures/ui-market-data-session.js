// Resilient browser-side market-data session for LQC Flow Futures.
// Keeps transport data behind the UI boundary and preserves demo prices as an
// explicit fallback. It never imports DEX Router or Futures Engine internals.

export function createUiMarketDataSession({ view, demoMarketData, onSourceChange = () => {} } = {}) {
  if (!view || typeof view.load !== 'function' || typeof view.start !== 'function' || typeof view.stop !== 'function') {
    throw new Error('MARKET_DATA_VIEW_REQUIRED');
  }
  if (!demoMarketData || typeof demoMarketData.getMarkPrice !== 'function') {
    throw new Error('DEMO_MARKET_DATA_REQUIRED');
  }
  if (typeof onSourceChange !== 'function') throw new Error('INVALID_SOURCE_CALLBACK');

  const livePrices = new Map();
  let activeSymbol = null;
  let source = 'DEMO';

  function normalize(symbol) {
    const key = String(symbol || '').trim().toUpperCase();
    if (!key) throw new Error('INVALID_SYMBOL');
    return key;
  }

  function setSource(next, detail = null) {
    if (source === next) return;
    source = next;
    onSourceChange(Object.freeze({ source, symbol: activeSymbol, detail }));
  }

  function markPrice(symbol) {
    const key = normalize(symbol);
    const live = Number(livePrices.get(key));
    if (Number.isFinite(live) && live > 0) return live;
    return demoMarketData.getMarkPrice(key);
  }

  function accept(state) {
    if (!state || state.symbol !== activeSymbol) return state;
    const price = Number(state.markPrice);
    if (Number.isFinite(price) && price > 0) {
      livePrices.set(state.symbol, price);
      setSource(state.live ? 'LIVE' : 'REST');
    }
    return state;
  }

  async function select(symbol) {
    const key = normalize(symbol);
    view.stop();
    activeSymbol = key;
    setSource('DEMO');
    try {
      accept(await view.load(key));
      view.start(key);
      return Object.freeze({ symbol: key, source, markPrice: markPrice(key) });
    } catch (error) {
      if (activeSymbol === key) setSource('DEMO', error?.message || 'MARKET_DATA_UNAVAILABLE');
      return Object.freeze({ symbol: key, source: 'DEMO', markPrice: markPrice(key), error });
    }
  }

  function onViewUpdate(state) {
    return accept(state);
  }

  function stop() {
    activeSymbol = null;
    view.stop();
  }

  function snapshot() {
    return Object.freeze({ symbol: activeSymbol, source, markPrice: activeSymbol ? markPrice(activeSymbol) : null });
  }

  return Object.freeze({ select, stop, markPrice, onViewUpdate, snapshot });
}
