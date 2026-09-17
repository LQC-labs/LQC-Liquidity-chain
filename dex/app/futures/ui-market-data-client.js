// Browser-facing market-data client for LQC Flow Futures UI.
// The UI consumes REST/WebSocket transport boundaries only; it never imports
// DEX Router or Futures Engine internals, preserving sibling-service isolation.

import { API_PREFIX, publicApiPath } from './api-contract.js';

function normalizeSymbol(symbol) {
  const value = String(symbol || '').trim().toUpperCase();
  if (!value) throw new Error('INVALID_SYMBOL');
  return value;
}

function unwrap(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('INVALID_API_RESPONSE');
  if ('data' in payload) return payload.data;
  return payload;
}

export function createUiMarketDataClient({ fetchImpl = globalThis.fetch, WebSocketImpl = globalThis.WebSocket, apiBase = '' } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('FETCH_REQUIRED');

  async function get(resource, symbol = null, params = {}) {
    const key = symbol == null ? null : normalizeSymbol(symbol);
    const path = publicApiPath(resource, key);
    const url = new URL(`${apiBase}${path}`, globalThis.location?.origin || 'http://localhost');
    for (const [name, value] of Object.entries(params)) if (value != null) url.searchParams.set(name, String(value));
    const response = await fetchImpl(url.toString(), { headers: { accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.code || `HTTP_${response.status}`);
    return unwrap(payload);
  }

  const markPrice = (symbol) => get('markPrice', symbol);
  const ticker24h = (symbol) => get('ticker/24hr', symbol);
  const depth = (symbol, limit = 100) => get('depth', symbol, { limit });
  const trades = (symbol, limit = 100) => get('trades', symbol, { limit });
  const klines = (symbol, interval = '1m', limit = 500) => get('klines', symbol, { interval, limit });
  const oracleStatus = (symbol) => get('oracle/status', symbol);

  function subscribeMarkPrice(symbol, listener, { wsPath = `${API_PREFIX}/ws` } = {}) {
    if (typeof WebSocketImpl !== 'function') throw new Error('WEBSOCKET_REQUIRED');
    if (typeof listener !== 'function') throw new Error('INVALID_STREAM_LISTENER');
    const key = normalizeSymbol(symbol);
    const origin = globalThis.location?.origin || 'http://localhost';
    const wsUrl = new URL(`${apiBase}${wsPath}`, origin);
    wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    wsUrl.searchParams.set('channel', 'markPrice');
    wsUrl.searchParams.set('symbol', key);
    const socket = new WebSocketImpl(wsUrl.toString());
    socket.addEventListener('message', (event) => {
      const envelope = JSON.parse(event.data);
      if (envelope?.channel !== 'markPrice' || envelope?.symbol !== key) return;
      listener(envelope);
    });
    return () => socket.close();
  }

  return Object.freeze({ markPrice, ticker24h, depth, trades, klines, oracleStatus, subscribeMarkPrice });
}
