import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDemoPositionBook } from '../app/futures/position-book.js';

function fill(symbol, side, marginMode) {
  return {
    symbol,
    side,
    marginMode,
    quantity: symbol === 'BTCUSDT' ? 0.01 : 1,
    entryPrice: symbol === 'BTCUSDT' ? 50000 : symbol === 'SOLUSDT' ? 100 : 3000,
    collateral: 100,
    leverage: 5
  };
}

describe('Futures position book cross rollback', () => {
  it('removes the exact cross set and restores it without touching isolated positions', () => {
    const book = createDemoPositionBook();
    book.add(fill('BTCUSDT', 'LONG', 'CROSS'));
    book.add(fill('SOLUSDT', 'SHORT', 'CROSS'));
    book.add(fill('ETHUSDT', 'LONG', 'ISOLATED'));

    const before = book.list();
    const expectedCross = before.filter((position) => position.marginMode === 'CROSS');
    const isolated = before.find((position) => position.marginMode === 'ISOLATED');
    const closed = book.removeCross(expectedCross);

    assert.equal(closed.length, 2);
    assert.deepEqual(book.list(), [isolated]);

    const restored = book.restoreCross(closed);
    assert.deepEqual(restored, closed);
    assert.equal(book.list().length, 3);
    assert.equal(book.get({ symbol: 'BTCUSDT', side: 'LONG', marginMode: 'CROSS' }), closed[0]);
    assert.equal(book.get({ symbol: 'SOLUSDT', side: 'SHORT', marginMode: 'CROSS' }), closed[1]);
    assert.equal(book.get({ symbol: 'ETHUSDT', side: 'LONG', marginMode: 'ISOLATED' }), isolated);
  });

  it('rejects a stale expected cross-position set before removal', () => {
    const book = createDemoPositionBook();
    book.add(fill('BTCUSDT', 'LONG', 'CROSS'));
    const stale = book.list().filter((position) => position.marginMode === 'CROSS');
    book.add(fill('SOLUSDT', 'SHORT', 'CROSS'));

    assert.throws(() => book.removeCross(stale), /CROSS_POSITION_SET_CHANGED/);
    assert.equal(book.list().filter((position) => position.marginMode === 'CROSS').length, 2);
  });

  it('rejects restore conflicts without partially restoring the snapshot', () => {
    const book = createDemoPositionBook();
    book.add(fill('BTCUSDT', 'LONG', 'CROSS'));
    book.add(fill('SOLUSDT', 'SHORT', 'CROSS'));
    const closed = book.removeCross(book.list());

    book.add(fill('BTCUSDT', 'LONG', 'CROSS'));
    assert.throws(() => book.restoreCross(closed), /CROSS_POSITION_RESTORE_CONFLICT/);
    assert.equal(book.get({ symbol: 'SOLUSDT', side: 'SHORT', marginMode: 'CROSS' }), null);
    assert.notEqual(book.get({ symbol: 'BTCUSDT', side: 'LONG', marginMode: 'CROSS' }), null);
  });

  it('rejects invalid rollback snapshots', () => {
    const book = createDemoPositionBook();
    assert.throws(() => book.restoreCross(null), /INVALID_CROSS_POSITION_SNAPSHOT/);
    assert.throws(() => book.restoreCross([{ symbol: 'BTCUSDT', side: 'LONG', marginMode: 'ISOLATED' }]), /INVALID_CROSS_POSITION_SNAPSHOT/);
  });
});
