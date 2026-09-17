import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createUiMarketDataView } from '../app/futures/ui-market-data-view.js';

function client(overrides = {}) {
  return {
    markPrice: async (symbol) => ({ symbol, markPrice: 0.2 }),
    depth: async () => ({ bids: [[0.199, 10]], asks: [[0.201, 12]] }),
    trades: async () => ({ trades: [{ price: 0.2, quantity: 5 }] }),
    oracleStatus: async () => ({ available: true, healthy: true, stale: false }),
    subscribeMarkPrice: () => () => {},
    ...overrides
  };
}

describe('Futures UI market data view model', () => {
  it('loads REST market data into one stable UI snapshot', async () => {
    const updates = [];
    const view = createUiMarketDataView(client(), { onUpdate: (state) => updates.push(state) });
    const state = await view.load('lqcusdt');
    assert.equal(state.symbol, 'LQCUSDT');
    assert.equal(state.markPrice, 0.2);
    assert.deepEqual(state.bids, [[0.199, 10]]);
    assert.deepEqual(state.asks, [[0.201, 12]]);
    assert.equal(state.trades.length, 1);
    assert.equal(state.oracle.healthy, true);
    assert.equal(state.live, false);
    assert.equal(updates.length, 1);
    assert.equal(Object.isFrozen(state), true);
  });

  it('applies accepted WebSocket mark-price updates to the active symbol', () => {
    let listener;
    let closed = false;
    const updates = [];
    const view = createUiMarketDataView(client({
      subscribeMarkPrice: (_symbol, callback) => { listener = callback; return () => { closed = true; }; }
    }), { onUpdate: (state) => updates.push(state) });
    const stop = view.start('lqcusdt');
    listener({ symbol: 'LQCUSDT', markPrice: 0.215 });
    assert.equal(view.snapshot().markPrice, 0.215);
    assert.equal(view.snapshot().live, true);
    assert.equal(updates.at(-1).symbol, 'LQCUSDT');
    stop();
    assert.equal(closed, true);
  });

  it('ignores invalid stream prices instead of corrupting UI state', () => {
    let listener;
    const view = createUiMarketDataView(client({ subscribeMarkPrice: (_symbol, callback) => { listener = callback; return () => {}; } }));
    view.start('LQCUSDT');
    listener({ symbol: 'LQCUSDT', markPrice: -1 });
    assert.equal(view.snapshot().markPrice, null);
    assert.equal(view.snapshot().live, false);
  });

  it('reports REST failures and preserves the transport error', async () => {
    const expected = new Error('MARK_PRICE_UNAVAILABLE');
    const errors = [];
    const view = createUiMarketDataView(client({ markPrice: async () => { throw expected; } }), {
      onError: (error, symbol) => errors.push({ error, symbol })
    });
    await assert.rejects(() => view.load('LQCUSDT'), (error) => error === expected);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].error, expected);
    assert.equal(errors[0].symbol, 'LQCUSDT');
  });

  it('does not publish a stale REST response after the active market changes', async () => {
    let release;
    const first = new Promise((resolve) => { release = resolve; });
    const c = client({ markPrice: async (symbol) => symbol === 'LQCUSDT' ? first : ({ markPrice: 100 }) });
    const view = createUiMarketDataView(c);
    const pending = view.load('LQCUSDT');
    await view.load('BTCUSDT');
    release({ markPrice: 0.2 });
    await pending;
    assert.equal(view.snapshot().symbol, 'BTCUSDT');
    assert.equal(view.snapshot().markPrice, 100);
  });
});
