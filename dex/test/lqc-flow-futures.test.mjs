import assert from 'node:assert/strict';
import { calculateLiquidationPrice } from '../app/futures/risk-engine.js';
import { openDemoPosition, markDemoPosition } from '../app/futures/position-engine.js';

describe('LQC Flow Futures demo risk extensions', () => {
  it('calculates long and short isolated liquidation prices', () => {
    const longPrice = calculateLiquidationPrice({ side: 'LONG', quantity: 100, entryPrice: 10, collateral: 200, maintenanceMarginRate: 0.01 });
    const shortPrice = calculateLiquidationPrice({ side: 'SHORT', quantity: 100, entryPrice: 10, collateral: 200, maintenanceMarginRate: 0.01 });
    assert.ok(Math.abs(longPrice - 8.0808080808) < 1e-9);
    assert.ok(Math.abs(shortPrice - 11.8811881188) < 1e-9);
  });

  it('rejects invalid demo position inputs', () => {
    assert.throws(() => openDemoPosition({ symbol: 'LQCUSDT', side: 'BAD', quantity: 100, entryPrice: 0.1854, leverage: 10, collateral: 1.854 }), /INVALID_SIDE/);
    assert.throws(() => openDemoPosition({ symbol: 'LQCUSDT', side: 'LONG', quantity: 0, entryPrice: 0.1854, leverage: 10, collateral: 1.854 }), /INVALID_QUANTITY/);
    assert.throws(() => openDemoPosition({ symbol: 'LQCUSDT', side: 'LONG', quantity: 100, entryPrice: 0.1854, leverage: 21, collateral: 1.854 }), /LEVERAGE_EXCEEDS_MARKET_MAX/);
  });

  it('exposes liquidation price when marking a demo position', () => {
    const position = openDemoPosition({ symbol: 'LQCUSDT', side: 'LONG', quantity: 100, entryPrice: 0.1854, leverage: 10, collateral: 1.854 });
    const marked = markDemoPosition(position, 0.19);
    assert.ok(Number.isFinite(marked.liquidationPrice));
    assert.equal(marked.liquidatable, false);
  });
});
