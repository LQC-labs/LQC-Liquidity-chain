import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSharedServices, createLqcFlowServiceBoundary } from '../app/futures/service-boundary.js';

function services(events, emit = event => events.push(event)) {
  return createSharedServices({
    tokenRegistry: { get() { return {}; } },
    oracle: { getMarkPrice() { return 1; } },
    account: { get() { return {}; } },
    monitoring: { emit }
  });
}

describe('LQC Flow sibling failure isolation', () => {
  it('does not invoke Futures Engine when DEX Router fails', () => {
    const events = [];
    let futuresCalls = 0;
    const boundary = createLqcFlowServiceBoundary({
      dexRouter: { quote() { throw new Error('DEX_DOWN'); } },
      futuresEngine: { placeOrder() { futuresCalls += 1; } },
      sharedServices: services(events)
    });
    assert.throws(() => boundary.dex.quote('LQCUSDT'), /DEX_DOWN/);
    assert.equal(futuresCalls, 0);
    assert.deepEqual(events[0], { type: 'SERVICE_BOUNDARY_FAILURE', domain: 'DEX_ROUTER', operation: 'quote', code: 'DEX_DOWN' });
  });

  it('does not invoke DEX Router when Futures Engine fails', () => {
    const events = [];
    let dexCalls = 0;
    const boundary = createLqcFlowServiceBoundary({
      dexRouter: { quote() { dexCalls += 1; } },
      futuresEngine: { placeOrder() { throw new Error('FUTURES_DOWN'); } },
      sharedServices: services(events)
    });
    assert.throws(() => boundary.futures.placeOrder({ symbol: 'LQCUSDT' }), /FUTURES_DOWN/);
    assert.equal(dexCalls, 0);
    assert.equal(events[0].domain, 'FUTURES_ENGINE');
  });

  it('preserves the original domain error when Monitoring also fails', () => {
    const original = new Error('DEX_PRIMARY_FAILURE');
    const boundary = createLqcFlowServiceBoundary({
      dexRouter: { quote() { throw original; } },
      futuresEngine: { placeOrder() { return true; } },
      sharedServices: services([], () => { throw new Error('MONITORING_DOWN'); })
    });
    assert.throws(() => boundary.dex.quote('LQCUSDT'), error => error === original);
    assert.equal(boundary.futures.placeOrder({ symbol: 'LQCUSDT' }), true);
  });
});
