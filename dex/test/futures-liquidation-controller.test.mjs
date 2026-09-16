import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDemoLiquidationController } from '../app/futures/liquidation-controller.js';

function fixture({ liquidatable = false } = {}) {
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
      return Object.freeze({ liquidated: true, survivingEquity: 40, liquidatedAt: '2026-09-16T00:00:00.000Z', health: { positions: [] } });
    }
  };
  const positionBook = {
    list: () => [...positions],
    remove(criteria) {
      const index = positions.findIndex((p) => p.symbol === criteria.symbol && p.side === criteria.side && p.marginMode === criteria.marginMode);
      return index < 0 ? null : positions.splice(index, 1)[0];
    }
  };
  return { account, positionBook, positions, cross, isolated, settlements: () => settlements };
}

describe('Futures cross-margin liquidation controller', () => {
  it('returns NO_CROSS_POSITIONS without settling the account', () => {
    let settled = false;
    const controller = createDemoLiquidationController({
      account: { health: () => ({ liquidatable: false }), liquidateCross: () => { settled = true; } },
      positionBook: { list: () => [{ symbol: 'ETHUSDT', side: 'LONG', marginMode: 'ISOLATED' }], remove: () => null },
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

  it('settles once, removes every cross position, preserves isolated positions and emits one event', () => {
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

  it('evaluateCross excludes isolated positions from shared-risk health', () => {
    const f = fixture();
    const controller = createDemoLiquidationController({ account: f.account, positionBook: f.positionBook, markPriceOf: () => 100 });
    const health = controller.evaluateCross();
    assert.equal(health.liquidatable, false);
    assert.equal(health.equity, 1000);
  });
});
