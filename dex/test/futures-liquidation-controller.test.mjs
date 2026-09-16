import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDemoLiquidationController } from '../app/futures/liquidation-controller.js';

function fixture({ liquidatable = false, settlementError = null, mutateBeforeRemove = false } = {}) {
  const cross = Object.freeze({ symbol: 'BTCUSDT', side: 'LONG', marginMode: 'CROSS', quantity: 1 });
  const isolated = Object.freeze({ symbol: 'ETHUSDT', side: 'SHORT', marginMode: 'ISOLATED', quantity: 2 });
  const positions = [cross, isolated];
  let settlements = 0;
  const account = {
    health(received) {
      assert.deepEqual(received, [cross]);
      return Object.freeze({ liquidatable, equity: liquidatable ? 40 : 1000, maintenanceMargin: 50, positions: [] });
    },
    liquidateCross(received) {
      assert.deepEqual(received, [cross]);
      settlements += 1;
      if (settlementError) throw settlementError;
      return Object.freeze({ liquidated: true, survivingEquity: 40, liquidatedAt: '2026-09-16T00:00:00.000Z', health: { positions: [] } });
    }
  };
  const positionBook = {
    list: () => [...positions],
    removeCross(expected) {
      if (mutateBeforeRemove) positions.unshift(Object.freeze({ symbol: 'SOLUSDT', side: 'LONG', marginMode: 'CROSS', quantity: 1 }));
      const current = positions.filter((p) => p.marginMode === 'CROSS');
      const key = (p) => `${p.symbol}:${p.side}:${p.marginMode}`;
      if (current.map(key).sort().join('|') !== expected.map(key).sort().join('|')) throw new Error('CROSS_POSITION_SET_CHANGED');
      const closed = [];
      for (let i = positions.length - 1; i >= 0; i -= 1) if (positions[i].marginMode === 'CROSS') closed.unshift(positions.splice(i, 1)[0]);
      return Object.freeze(closed);
    }
  };
  return { account, positionBook, positions, cross, isolated, settlements: () => settlements };
}

describe('Futures cross-margin liquidation controller', () => {
  it('returns NO_CROSS_POSITIONS without settling the account', () => {
    let settled = false;
    const controller = createDemoLiquidationController({
      account: { health: () => ({ liquidatable: false }), liquidateCross: () => { settled = true; } },
      positionBook: { list: () => [{ symbol: 'ETHUSDT', side: 'LONG', marginMode: 'ISOLATED' }], removeCross: () => [] },
      markPriceOf: () => 100
    });
    assert.deepEqual(controller.liquidateCrossIfRequired(), { liquidated: false, reason: 'NO_CROSS_POSITIONS' });
    assert.equal(settled, false);
  });

  it('keeps healthy cross positions open', () => {
    const f = fixture();
    const controller = createDemoLiquidationController({ account: f.account, positionBook: f.positionBook, markPriceOf: () => 100 });
    const result = controller.liquidateCrossIfRequired();
    assert.equal(result.liquidated, false);
    assert.equal(result.reason, 'ACCOUNT_HEALTHY');
    assert.equal(f.settlements(), 0);
    assert.deepEqual(f.positions, [f.cross, f.isolated]);
  });

  it('settles once, removes the exact cross set, preserves isolated positions and emits one event', () => {
    const f = fixture({ liquidatable: true });
    const events = [];
    const controller = createDemoLiquidationController({ account: f.account, positionBook: f.positionBook, markPriceOf: () => 100, onLiquidated: (event) => events.push(event) });
    const result = controller.liquidateCrossIfRequired();
    assert.equal(result.liquidated, true);
    assert.equal(result.reason, 'CROSS_ACCOUNT_LIQUIDATION');
    assert.equal(f.settlements(), 1);
    assert.deepEqual(result.closedPositions, [f.cross]);
    assert.deepEqual(f.positions, [f.isolated]);
    assert.equal(events.length, 1);
    assert.equal(events[0], result);
  });

  it('aborts before account settlement when the cross position set changed', () => {
    const f = fixture({ liquidatable: true, mutateBeforeRemove: true });
    const controller = createDemoLiquidationController({ account: f.account, positionBook: f.positionBook, markPriceOf: () => 100 });
    assert.throws(() => controller.liquidateCrossIfRequired(), /CROSS_POSITION_SET_CHANGED/);
    assert.equal(f.settlements(), 0);
  });

  it('surfaces a hard consistency error if account settlement fails after removal', () => {
    const f = fixture({ liquidatable: true, settlementError: new Error('LEDGER_UNAVAILABLE') });
    const controller = createDemoLiquidationController({ account: f.account, positionBook: f.positionBook, markPriceOf: () => 100 });
    assert.throws(() => controller.liquidateCrossIfRequired(), (error) => {
      assert.equal(error.message, 'CROSS_LIQUIDATION_SETTLEMENT_FAILED');
      assert.equal(error.cause.message, 'LEDGER_UNAVAILABLE');
      assert.deepEqual(error.closedPositions, [f.cross]);
      return true;
    });
    assert.equal(f.settlements(), 1);
    assert.deepEqual(f.positions, [f.isolated]);
  });

  it('evaluateCross excludes isolated positions from shared-risk health', () => {
    const f = fixture();
    const controller = createDemoLiquidationController({ account: f.account, positionBook: f.positionBook, markPriceOf: () => 100 });
    const health = controller.evaluateCross();
    assert.equal(health.liquidatable, false);
    assert.equal(health.equity, 1000);
  });
});
