import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createUiMarketDataClient } from '../app/futures/ui-market-data-client.js';

function response(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => ({ data }) };
}

describe('Futures UI market data transport client', () => {
  it('reads mark price through the shared REST API contract', async () => {
    let requested;
    const client = createUiMarketDataClient({
      apiBase: 'https://flow.example',
      fetchImpl: async (url) => { requested = url; return response({ symbol: 'LQCUSDT', markPrice: 0.2 }); }
    });
    const value = await client.markPrice('lqcusdt');
    assert.equal(value.markPrice, 0.2);
    assert.equal(requested, 'https://flow.example/api/v1/markPrice?symbol=LQCUSDT');
  });

  it('maps depth, trades, klines and oracle status to REST boundaries', async () => {
    const urls = [];
    const client = createUiMarketDataClient({
      apiBase: 'https://flow.example',
      fetchImpl: async (url) => { urls.push(url); return response({}); }
    });
    await client.depth('btcusdt', 25);
    await client.trades('btcusdt', 10);
    await client.klines('btcusdt', '5m', 50);
    await client.oracleStatus('btcusdt');
    assert.deepEqual(urls, [
      'https://flow.example/api/v1/depth?symbol=BTCUSDT&limit=25',
      'https://flow.example/api/v1/trades?symbol=BTCUSDT&limit=10',
      'https://flow.example/api/v1/klines?symbol=BTCUSDT&interval=5m&limit=50',
      'https://flow.example/api/v1/oracle/status?symbol=BTCUSDT'
    ]);
  });

  it('surfaces REST failures without falling back to engine internals', async () => {
    const client = createUiMarketDataClient({
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({ code: 'MARK_PRICE_UNAVAILABLE' }) })
    });
    await assert.rejects(() => client.markPrice('LQCUSDT'), /MARK_PRICE_UNAVAILABLE/);
  });

  it('subscribes to mark price WebSocket envelopes and closes cleanly', () => {
    let socket;
    class FakeWebSocket {
      constructor(url) { this.url = url; this.listeners = {}; socket = this; }
      addEventListener(type, listener) { this.listeners[type] = listener; }
      close() { this.closed = true; }
    }
    const events = [];
    const client = createUiMarketDataClient({ fetchImpl: async () => response({}), WebSocketImpl: FakeWebSocket, apiBase: 'https://flow.example' });
    const unsubscribe = client.subscribeMarkPrice('lqcusdt', (event) => events.push(event));
    assert.equal(socket.url, 'wss://flow.example/api/v1/ws?channel=markPrice&symbol=LQCUSDT');
    socket.listeners.message({ data: JSON.stringify({ channel: 'trade', symbol: 'LQCUSDT', price: 1 }) });
    socket.listeners.message({ data: JSON.stringify({ channel: 'markPrice', symbol: 'LQCUSDT', markPrice: 0.21 }) });
    assert.equal(events.length, 1);
    assert.equal(events[0].markPrice, 0.21);
    unsubscribe();
    assert.equal(socket.closed, true);
  });
});
