// Market-data presentation boundary for the Futures UI.
// Converts REST/WebSocket transport data into a stable UI view model without
// exposing DEX Router or Futures Engine internals to browser rendering code.

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

export function createUiMarketDataView(client, { onUpdate = () => {}, onError = () => {} } = {}) {
  if (!client || typeof client.markPrice !== 'function' || typeof client.depth !== 'function' || typeof client.trades !== 'function') {
    throw new Error('MARKET_DATA_CLIENT_REQUIRED');
  }
  if (typeof onUpdate !== 'function' || typeof onError !== 'function') throw new Error('INVALID_UI_MARKET_DATA_CALLBACK');

  let activeSymbol = null;
  let unsubscribe = null;
  let state = Object.freeze({ symbol: null, markPrice: null, bids: [], asks: [], trades: [], oracle: null, live: false });

  function publish(patch) {
    state = Object.freeze({ ...state, ...patch });
    onUpdate(state);
    return state;
  }

  async function load(symbol) {
    const key = String(symbol || '').trim().toUpperCase();
    if (!key) throw new Error('INVALID_SYMBOL');
    activeSymbol = key;
    try {
      const [mark, depth, trades, oracle] = await Promise.all([
        client.markPrice(key),
        client.depth(key, 50),
        client.trades(key, 50),
        typeof client.oracleStatus === 'function' ? client.oracleStatus(key) : Promise.resolve(null)
      ]);
      if (activeSymbol !== key) return state;
      return publish({
        symbol: key,
        markPrice: number(mark?.markPrice ?? mark?.price),
        bids: rows(depth?.bids),
        asks: rows(depth?.asks),
        trades: rows(trades?.trades ?? trades),
        oracle,
        live: false
      });
    } catch (error) {
      if (activeSymbol === key) onError(error, key);
      throw error;
    }
  }

  function start(symbol) {
    const key = String(symbol || '').trim().toUpperCase();
    if (!key) throw new Error('INVALID_SYMBOL');
    stop();
    activeSymbol = key;
    if (typeof client.subscribeMarkPrice !== 'function') return () => {};
    unsubscribe = client.subscribeMarkPrice(key, (event) => {
      if (activeSymbol !== key) return;
      const price = number(event?.markPrice ?? event?.price);
      if (price == null || price <= 0) return;
      publish({ symbol: key, markPrice: price, live: true });
    });
    return stop;
  }

  function stop() {
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
  }

  function snapshot() {
    return state;
  }

  return Object.freeze({ load, start, stop, snapshot });
}
