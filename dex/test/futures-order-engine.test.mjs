import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateDemoOrder, buildDemoOrder } from '../app/futures/order-engine.js';

describe('Futures order price precision', () => {
  it('accepts a MARKET mark price finer than the order tick', () => {
    const validated = validateDemoOrder({
      symbol: 'BTCUSDT',
      side: 'LONG',
      type: 'MARKET',
      quantity: 0.001,
      leverage: 5,
      markPrice: 115000.037
    });
    assert.equal(validated.referencePrice, 115000.037);
    assert.equal(validated.type, 'MARKET');
  });

  it('uses the raw MARKET mark price for notional and margin', () => {
    const order = buildDemoOrder({
      symbol: 'BTCUSDT',
      side: 'LONG',
      type: 'MARKET',
      quantity: 0.001,
      leverage: 5,
      markPrice: 115000.037
    });
    assert.equal(order.price, null);
    assert.equal(order.referencePrice, 115000.037);
    assert.ok(Math.abs(order.notional - 115.000037) < 1e-12);
    assert.ok(Math.abs(order.initialMargin - 23.0000074) < 1e-12);
  });

  it('still rejects a LIMIT price that is not tick aligned', () => {
    assert.throws(() => validateDemoOrder({
      symbol: 'BTCUSDT',
      side: 'LONG',
      type: 'LIMIT',
      quantity: 0.001,
      leverage: 5,
      price: 115000.037
    }), /PRICE_TICK_MISMATCH/);
  });

  it('still enforces tick precision for take-profit and stop-loss triggers', () => {
    assert.throws(() => validateDemoOrder({
      symbol: 'BTCUSDT', side: 'LONG', type: 'MARKET', quantity: 0.001,
      leverage: 5, markPrice: 115000.037, takeProfit: 116000.037
    }), /TAKE_PROFIT_TICK_MISMATCH/);
    assert.throws(() => validateDemoOrder({
      symbol: 'BTCUSDT', side: 'LONG', type: 'MARKET', quantity: 0.001,
      leverage: 5, markPrice: 115000.037, stopLoss: 114000.037
    }), /STOP_LOSS_TICK_MISMATCH/);
  });
});
