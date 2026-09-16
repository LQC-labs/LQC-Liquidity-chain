import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDemoLiquidationController } from '../app/futures/liquidation-controller.js';

function fixture({ liquidatable = false, settlementError = null, mutateBeforeRemove = false, rollbackError = null } = {}) {
  const crossLong = Object.freeze({ symbol: 'BTCUSDT', side: 'LONG', marginMode: 'CROSS', quantity: 1 });
  const crossShort = Object.freeze({ symbol: 'SOLUSDT', side: 'SHORT', marginMode: 'CROSS', quantity: 3 });
  const isolated = Object.freeze({ symbol: 'ETHUSDT', side: 'SHORT', marginMode: 'ISOLATED', quantity: 2 });
  const positions = [crossLong, crossShort, isolated];
  let settlements = 0, rollbacks = 0;
  const expectedCross = [crossLong, crossShort];
  const account = {
    health(received) {
      assert.deepEqual(received, expectedCross);
      return Object.freeze({ liquidatable, equity: liquidatable ? 40 : 1000, maintenanceMargin: 50, positions: [] });
    },
    liquidateCross(received) {
      assert.deepEqual(received, expectedCross);
      settlements += 1;
      if (settlementError) throw settlementError;
      return Object.freeze({ liquidated: true, survivingEquity: 40, liquidatedAt: '2026-09-16T00:00:00.000Z', health: { positions: [] } });
    }
  };
  const key = (p) => `${p.symbol}:${p.side}:${p.marginMode}`;
  const positionBook = {
    list: () => [...positions],
    removeCross(expected) {
      if (mutateBeforeRemove) positions.unshift(Object.freeze({ symbol: 'XRPUSDT', side: 'LONG', marginMode: 'CROSS', quantity: 1 }));
      const current = positions.filter((p) => p.marginMode === 'CROSS');
      if (current.map(key).sort().join('|') !== expected.map(key).sort().join('|')) throw new Error('CROSS_POSITION_SET_CHANGED');
      const closed = [];
      for (let i = positions.length - 1; i >= 0; i -= 1) if (positions[i].marginMode === 'CROSS') closed.unshift(positions.splice(i, 1)[0]);
      return Object.freeze(closed);
    },
    restoreCross(snapshot) {
      rollbacks += 1;
      if (rollbackError) throw rollbackError;
      for (const position of snapshot) {
        if (positions.some((current) => key(current) === key(position))) throw new Error('CROSS_POSITION_RESTORE_CONFLICT');
        positions.splice(positions.length - 1, 0, position);
      }
      return Object.freeze([...snapshot]);
    }
  };
  return { account, positionBook, positions, crossLong, crossShort, isolated, settlements: () => settlements, rollbacks: () => rollbacks };
}

describe('Futures cross-margin liquidation controller', () => {
  it('returns NO_CROSS_POSITIONS without settling the account', () => {
    let settled = false;
    const controller = createDemoLiquidationController({
      account: { health: () => ({ liquidatable: false }), liquidateCross: () => { settled = true; } },
      positionBook: { list: () => [{ symbol: 'ETHUSDT', side: 'LONG', marginMode: 'ISOLATED' }], removeCross: () => [], restoreCross: () => [] },
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
    assert.deepEqual(f.positions, [f.crossLong, f.crossShort, f.isolated]);
  });

  it('settles once, removes all cross positions, preserves isolated positions and emits one event', () => {
    const f = fixture({ liquidatable: true }), events = [];
    const controller = createDemoLiquidationController({ account: f.account, positionBook: f.positionBook, markPriceOf: () => 100, onLiquidated: (event) => events.push(event) });
    const result = controller.liquidateCrossIfRequired();
    assert.equal(result.liquidated, true);
    assert.equal(f.settlements(), 1);
    assert.equal(f.rollbacks(), 0);
    assert.deepEqual(result.closedPositions, [f.crossLong, f.crossShort]);
    assert.deepEqual(f.positions, [f.isolated]);
    assert.equal(events.length, 1);
  });

  it('aborts before account settlement when the cross position set changed', () => {
    const f = fixture({ liquidatable: true, mutateBeforeRemove: true });
    const controller = createDemoLiquidationController({ account: f.account, positionBook: f.positionBook, markPriceOf: () => 100 });
    assert.throws(() => controller.liquidateCrossIfRequired(), /CROSS_POSITION_SET_CHANGED/);
    assert.equal(f.settlements(), 0);
    assert.equal(f.rollbacks(), 0);
  });

  it('restores all cross positions when account settlement fails', () => {
    const f = fixture({ liquidatable: true, settlementError: new Error('LEDGER_UNAVAILABLE') });
    const controller = createDemoLiquidationController({ account: f.account, positionBook: f.positionBook, markPriceOf: () => 100 });
    assert.throws(() => controller.liquidateCrossIfRequired(), (error) => {
      assert.equal(error.message, 'CROSS_LIQUIDATION_SETTLEMENT_FAILED');
      assert.equal(error.cause.message, 'LEDGER_UNAVAILABLE');
      assert.equal(error.rolledBack, true);
      return true;
    });
    assert.equal(f.settlements(), 1);
    assert.equal(f.rollbacks(), 1);
    assert.deepEqual(f.positions, [f.crossLong, f.crossShort, f.isolated]);
  });

  it('surfaces rollback failure separately from settlement failure', () => {
    const f = fixture({ liquidatable: true, settlementError: new Error('LEDGER_UNAVAILABLE'), rollbackError: new Error('RESTORE_CONFLICT') });
    const controller = createDemoLiquidationController({ account: f.account, positionBook: f.positionBook, markPriceOf: () => 100 });
    assert.throws(() => controller.liquidateCrossIfRequired(), (error) => {
      assert.equal(error.message, 'CROSS_LIQUIDATION_ROLLBACK_FAILED');
      assert.equal(error.cause.message, 'LEDGER_UNAVAILABLE');
      assert.equal(error.rollbackError.message, 'RESTORE_CONFLICT');
      return true;
    });
  });

  it('evaluateCross excludes isolated positions from shared-risk health', () => {
    const f = fixture();
    const controller = createDemoLiquidationController({ account: f.account, positionBook: f.positionBook, markPriceOf: () => 100 });
    const health = controller.evaluateCross();
    assert.equal(health.liquidatable, false);
    assert.equal(health.equity, 1000);
  });
});
