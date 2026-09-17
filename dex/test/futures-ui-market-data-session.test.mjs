import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createUiMarketDataSession } from '../app/futures/ui-market-data-session.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function demo(prices = {}) {
  return { getMarkPrice(symbol) { return prices[symbol] ?? 1; } };
}

function state(symbol, markPrice, extra = {}) {
  return { symbol, markPrice, bids: [], asks: [], trades: [], oracle: null, live: false, ...extra };
}

describe('Futures UI market data session', () => {
  it('stores REST depth, trades, oracle and promotes mark-price stream updates to LIVE without clearing REST book data', async () => {
    const starts = [];
    const view = {
      stop() {},
      start(symbol) { starts.push(symbol); },
      async load(symbol) {
        return state(symbol, 100, {
          bids: [[99, 2]], asks: [[101, 3]], trades: [{ price: 100, qty: 1 }], oracle: { healthy: true }
        });
      }
    };
    const session = createUiMarketDataSession({ view, demoMarketData: demo({ BTCUSDT: 90 }) });
    const rest = await session.select('btcusdt');
    assert.equal(rest.source, 'REST');
    assert.equal(rest.markPrice, 100);
    assert.deepEqual(rest.bids, [[99, 2]]);
    assert.deepEqual(rest.asks, [[101, 3]]);
    assert.equal(rest.trades.length, 1);
    assert.deepEqual(rest.oracle, { healthy: true });
    assert.deepEqual(starts, ['BTCUSDT']);

    session.onViewUpdate({ symbol: 'BTCUSDT', markPrice: 102, live: true });
    const live = session.snapshot();
    assert.equal(live.source, 'LIVE');
    assert.equal(live.markPrice, 102);
    assert.deepEqual(live.bids, [[99, 2]]);
    assert.deepEqual(live.asks, [[101, 3]]);
    assert.equal(live.trades.length, 1);
    assert.deepEqual(live.oracle, { healthy: true });
  });

  it('does not start a stale symbol after a newer selection wins', async () => {
    const a = deferred();
    const b = deferred();
    const starts = [];
    const view = {
      stop() {},
      start(symbol) { starts.push(symbol); },
      load(symbol) { return symbol === 'BTCUSDT' ? a.promise : b.promise; }
    };
    const session = createUiMarketDataSession({ view, demoMarketData: demo({ BTCUSDT: 90, ETHUSDT: 190 }) });
    const first = session.select('BTCUSDT');
    const second = session.select('ETHUSDT');
    b.resolve(state('ETHUSDT', 200));
    await second;
    a.resolve(state('BTCUSDT', 100));
    await first;
    assert.deepEqual(starts, ['ETHUSDT']);
    assert.equal(session.snapshot().symbol, 'ETHUSDT');
    assert.equal(session.snapshot().markPrice, 200);
  });

  it('clears a stale live price when reselect fails and falls back to demo', async () => {
    let fail = false;
    const view = {
      stop() {}, start() {},
      async load(symbol) {
        if (fail) throw new Error('REST_DOWN');
        return state(symbol, 100);
      }
    };
    const session = createUiMarketDataSession({ view, demoMarketData: demo({ BTCUSDT: 90 }) });
    await session.select('BTCUSDT');
    session.onViewUpdate(state('BTCUSDT', 110, { live: true }));
    assert.equal(session.markPrice('BTCUSDT'), 110);
    fail = true;
    const result = await session.select('BTCUSDT');
    assert.equal(result.source, 'DEMO');
    assert.equal(result.markPrice, 90);
    assert.equal(result.error.message, 'REST_DOWN');
  });

  it('stop invalidates a pending selection', async () => {
    const pending = deferred();
    const starts = [];
    const view = { stop() {}, start(symbol) { starts.push(symbol); }, load() { return pending.promise; } };
    const session = createUiMarketDataSession({ view, demoMarketData: demo({ BTCUSDT: 90 }) });
    const selecting = session.select('BTCUSDT');
    session.stop();
    pending.resolve(state('BTCUSDT', 100));
    await selecting;
    assert.deepEqual(starts, []);
    assert.equal(session.snapshot().symbol, null);
  });
});
