import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSharedServices, createLqcFlowServiceBoundary } from '../app/futures/service-boundary.js';

function sharedHarness() {
  return createSharedServices({
    tokenRegistry: { get: symbol => ({ symbol }) },
    oracle: { getMarkPrice: symbol => ({ symbol, price: 1 }) },
    account: { get: id => ({ id }) },
    monitoring: { emit: event => event }
  });
}

describe('LQC Flow sibling service boundary', () => {
  it('exposes DEX Router and Futures Engine as independent sibling ports', () => {
    const shared = sharedHarness();
    const boundary = createLqcFlowServiceBoundary({
      dexRouter: { quote: symbol => `dex:${symbol}` },
      futuresEngine: { placeOrder: order => ({ ...order, accepted: true }) },
      sharedServices: shared
    });
    assert.equal(boundary.dex.quote('LQCUSDT'), 'dex:LQCUSDT');
    assert.deepEqual(boundary.futures.placeOrder({ symbol: 'LQCUSDT' }), { symbol: 'LQCUSDT', accepted: true });
    assert.equal(boundary.shared, shared);
    assert.equal('futuresEngine' in boundary.dex, false);
    assert.equal('dexRouter' in boundary.futures, false);
  });

  it('requires all Shared Service ports explicitly', () => {
    assert.throws(() => createSharedServices({}), /TOKEN_REGISTRY_REQUIRED/);
    assert.throws(() => createSharedServices({ tokenRegistry: {} }), /TOKEN_REGISTRY_INVALID_PORT/);
  });

  it('rejects invalid DEX and Futures engine ports', () => {
    const shared = sharedHarness();
    assert.throws(() => createLqcFlowServiceBoundary({ dexRouter: {}, futuresEngine: { placeOrder() {} }, sharedServices: shared }), /DEX_ROUTER_INVALID_PORT/);
    assert.throws(() => createLqcFlowServiceBoundary({ dexRouter: { quote() {} }, futuresEngine: {}, sharedServices: shared }), /FUTURES_ENGINE_INVALID_PORT/);
  });

  it('keeps the returned boundary immutable', () => {
    const boundary = createLqcFlowServiceBoundary({
      dexRouter: { quote() { return 1; } },
      futuresEngine: { placeOrder() { return 1; } },
      sharedServices: sharedHarness()
    });
    assert.equal(Object.isFrozen(boundary), true);
    assert.equal(Object.isFrozen(boundary.dex), true);
    assert.equal(Object.isFrozen(boundary.futures), true);
  });
});
