import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createWebSocketStreamGateway } from '../app/futures/websocket-stream.js';

function providerHarness() {
  let listener = null;
  return {
    provider: { subscribe(fn) { listener = fn; return () => { listener = null; }; } },
    emit(event) { listener?.(event); }
  };
}

describe('Futures WebSocket Oracle health boundary', () => {
  it('publishes markPrice only while shared oracle is healthy and fresh', () => {
    const h = providerHarness();
    let healthy = true;
    const received = [];
    const gateway = createWebSocketStreamGateway(h.provider, undefined, {
      now: () => 1_000,
      oracleStatus: () => ({ available: true, healthy, stale: !healthy })
    });
    gateway.subscribe({ channel: 'markPrice', symbol: 'LQCUSDT' }, event => received.push(event));
    h.emit({ symbol: 'LQCUSDT', price: 1 });
    healthy = false;
    h.emit({ symbol: 'LQCUSDT', price: 2 });
    assert.equal(received.length, 1);
    assert.equal(received[0].data.price, 1);
    assert.equal(received[0].eventTime, 1_000);
  });

  it('blocks unavailable and stale markPrice events', () => {
    for (const status of [
      { available: false, healthy: false, stale: false },
      { available: true, healthy: false, stale: true },
      { available: true, healthy: true, stale: true }
    ]) {
      const h = providerHarness(); const received = [];
      const gateway = createWebSocketStreamGateway(h.provider, undefined, { oracleStatus: () => status });
      gateway.subscribe({ channel: 'markPrice', symbol: 'LQCUSDT' }, event => received.push(event));
      h.emit({ symbol: 'LQCUSDT', price: 1 });
      assert.equal(received.length, 0);
    }
  });

  it('does not apply oracle gate to non-markPrice channels', () => {
    const h = providerHarness(); const received = [];
    const gateway = createWebSocketStreamGateway(h.provider, undefined, {
      oracleStatus: () => ({ available: false, healthy: false, stale: true })
    });
    gateway.subscribe({ channel: 'trade', symbol: 'LQCUSDT' }, event => received.push(event));
    h.emit({ symbol: 'LQCUSDT', price: 1, qty: 2 });
    assert.equal(received.length, 1);
    assert.equal(received[0].channel, 'trade');
  });
});
