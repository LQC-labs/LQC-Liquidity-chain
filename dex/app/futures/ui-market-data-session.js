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
  let selectionId = 0;
  let marketState = Object.freeze({ symbol: null, bids: [], asks: [], trades: [], oracle: null, live: false });

  function normalize(symbol) {
    const key = String(symbol || '').trim().toUpperCase();
    if (!key) throw new Error('INVALID_SYMBOL');
    return key;
  }

  function setSource(next, detail = null) {
    if (source === next && detail == null) return;
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
    marketState = Object.freeze({
      symbol: state.symbol,
      bids: Array.isArray(state.bids) ? state.bids : marketState.bids,
      asks: Array.isArray(state.asks) ? state.asks : marketState.asks,
      trades: Array.isArray(state.trades) ? state.trades : marketState.trades,
      oracle: state.oracle ?? marketState.oracle,
      live: Boolean(state.live)
    });
    const price = Number(state.markPrice);
    if (Number.isFinite(price) && price > 0) {
      livePrices.set(state.symbol, price);
      setSource(state.live ? 'LIVE' : 'REST');
    }
    return state;
  }

  async function select(symbol) {
    const key = normalize(symbol);
    const id = ++selectionId;
    view.stop();
    activeSymbol = key;
    livePrices.delete(key);
    marketState = Object.freeze({ symbol: key, bids: [], asks: [], trades: [], oracle: null, live: false });
    setSource('DEMO');
    try {
      const state = await view.load(key);
      if (id !== selectionId || activeSymbol !== key) return snapshot();
      accept(state);
      if (id !== selectionId || activeSymbol !== key) return snapshot();
      view.start(key);
      return snapshot();
    } catch (error) {
      if (id !== selectionId || activeSymbol !== key) return snapshot();
      livePrices.delete(key);
      setSource('DEMO', error?.message || 'MARKET_DATA_UNAVAILABLE');
      return Object.freeze({ ...snapshot(), error });
    }
  }

  function onViewUpdate(state) {
    return accept(state);
  }

  function stop() {
    selectionId += 1;
    activeSymbol = null;
    marketState = Object.freeze({ symbol: null, bids: [], asks: [], trades: [], oracle: null, live: false });
    view.stop();
  }

  function snapshot() {
    return Object.freeze({
      symbol: activeSymbol,
      source,
      markPrice: activeSymbol ? markPrice(activeSymbol) : null,
      bids: marketState.bids,
      asks: marketState.asks,
      trades: marketState.trades,
      oracle: marketState.oracle,
      live: marketState.live
    });
  }

  return Object.freeze({ select, stop, markPrice, onViewUpdate, snapshot });
}
