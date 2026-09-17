import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { markDemoPosition, openDemoPosition } from '../app/futures/position-engine.js';

describe('Futures position mark price precision', () => {
  const position = openDemoPosition({
    symbol: 'BTCUSDT',
    side: 'LONG',
    quantity: 0.01,
    entryPrice: 50000,
    leverage: 5,
    collateral: 100
  });

  test('accepts a mark price finer than the order tick', () => {
    const marked = markDemoPosition(position, 50000.123456);
    assert.equal(marked.markPrice, 50000.123456);
    assert.ok(Number.isFinite(marked.unrealizedPnl));
  });

  test('uses the raw mark price in position health calculations', () => {
    const markPrice = 50123.456789;
    const marked = markDemoPosition(position, markPrice);
    const expectedPnl = position.quantity * (markPrice - position.entryPrice);
    assert.ok(Math.abs(marked.unrealizedPnl - expectedPnl) < 1e-9);
  });

  test('still rejects invalid non-positive mark prices', () => {
    assert.throws(() => markDemoPosition(position, 0), /INVALID_MARK_PRICE/);
    assert.throws(() => markDemoPosition(position, -1), /INVALID_MARK_PRICE/);
  });
});
