// LQC Flow Futures — DEMO position book.
// One position per symbol + side + margin mode. Opposite sides remain separate
// so the demo keeps hedge-style behavior until an explicit one-way mode exists.

import { openDemoPosition, mergeDemoPosition, reduceDemoPosition } from './position-engine.js';
import { liquidationAction } from './risk-engine.js';
import { normalizeFuturesSymbol } from './markets.js';

function keyOf({ symbol, side, marginMode = 'ISOLATED' }) {
  return `${normalizeFuturesSymbol(symbol)}:${String(side).toUpperCase()}:${marginMode === 'CROSS' ? 'CROSS' : 'ISOLATED'}`;
}

export function createDemoPositionBook() {
  const positions = new Map();

  function list() {
    return [...positions.values()];
  }

  function get(criteria) {
    return positions.get(keyOf(criteria)) || null;
  }

  function add(fill) {
    const marginMode = fill.marginMode === 'CROSS' ? 'CROSS' : 'ISOLATED';
    const key = keyOf({ ...fill, marginMode });
    const existing = positions.get(key);
    if (existing) {
      const merged = mergeDemoPosition(existing, {
        symbol: fill.symbol,
        side: fill.side,
        quantity: fill.quantity,
        entryPrice: fill.entryPrice,
        collateral: fill.collateral
      });
      const next = Object.freeze({
        ...merged,
        marginMode,
        takeProfit: fill.takeProfit ?? existing.takeProfit ?? null,
        stopLoss: fill.stopLoss ?? existing.stopLoss ?? null
      });
      positions.set(key, next);
      return Object.freeze({ position: next, merged: true });
    }

    const opened = openDemoPosition(fill);
    const next = Object.freeze({
      ...opened,
      marginMode,
      takeProfit: fill.takeProfit ?? null,
      stopLoss: fill.stopLoss ?? null
    });
    positions.set(key, next);
    return Object.freeze({ position: next, merged: false });
  }

  function reduce(criteria, quantity) {
    const key = keyOf(criteria);
    const current = positions.get(key);
    if (!current) throw new Error('NO_POSITION_TO_REDUCE');
    const result = reduceDemoPosition(current, quantity);
    if (result.position) positions.set(key, Object.freeze({ ...result.position, marginMode: current.marginMode, takeProfit: current.takeProfit, stopLoss: current.stopLoss }));
    else positions.delete(key);
    return Object.freeze({ ...result, previous: current, position: positions.get(key) || null });
  }

  function evaluateLiquidation(criteria, markPrice) {
    const key = keyOf(criteria);
    const current = positions.get(key);
    if (!current) throw new Error('NO_POSITION_TO_LIQUIDATE');
    if (current.marginMode === 'CROSS') throw new Error('CROSS_LIQUIDATION_REQUIRES_ACCOUNT_HEALTH');
    return liquidationAction(current, markPrice);
  }

  function liquidate(criteria, markPrice) {
    const key = keyOf(criteria);
    const current = positions.get(key);
    if (!current) throw new Error('NO_POSITION_TO_LIQUIDATE');
    if (current.marginMode === 'CROSS') throw new Error('CROSS_LIQUIDATION_REQUIRES_ACCOUNT_HEALTH');
    const decision = liquidationAction(current, markPrice);
    if (decision.action !== 'LIQUIDATE') throw new Error('POSITION_NOT_LIQUIDATABLE');
    positions.delete(key);
    return Object.freeze({
      liquidated: true,
      previous: current,
      position: null,
      decision,
      liquidatedAt: new Date().toISOString()
    });
  }

  function remove(criteria) {
    const key = keyOf(criteria);
    const current = positions.get(key) || null;
    if (current) positions.delete(key);
    return current;
  }

  function removeCross(expected = null) {
    const current = list().filter((position) => position.marginMode === 'CROSS');
    if (expected !== null) {
      if (!Array.isArray(expected)) throw new Error('INVALID_EXPECTED_CROSS_POSITIONS');
      const currentKeys = current.map(keyOf).sort();
      const expectedKeys = expected.map(keyOf).sort();
      if (currentKeys.length !== expectedKeys.length || currentKeys.some((key, index) => key !== expectedKeys[index])) {
        throw new Error('CROSS_POSITION_SET_CHANGED');
      }
    }
    for (const position of current) positions.delete(keyOf(position));
    return Object.freeze(current);
  }

  function clear() {
    positions.clear();
  }

  return Object.freeze({ list, get, add, reduce, evaluateLiquidation, liquidate, remove, removeCross, clear });
}
