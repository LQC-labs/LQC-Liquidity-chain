import assert from 'node:assert/strict';

import { createApiKeyDescriptor, API_PERMISSIONS, assertPermission, createReplayGuard } from '../app/futures/api-auth-contract.js';
import { evaluateEmergencyTriggers } from '../app/futures/emergency-controls.js';
import { validateOracleSources, priceCircuitBreaker } from '../app/futures/oracle-guard.js';
import { createOraclePriceService } from '../app/futures/oracle-price-service.js';

function providerFor(sourceMap) {
  return { getSources(symbol) { return sourceMap[symbol] ?? []; } };
}

describe('11/10 Futures security gate', () => {
  it('rejects stale, duplicate, future-dated and manipulated oracle inputs', () => {
    const now = 1_800_000_000_000;
    assert.throws(() => validateOracleSources([
      { id: 'a', price: 100, timestamp: now },
      { id: 'a', price: 100, timestamp: now }
    ], { now }), /DUPLICATE_ORACLE_SOURCE_ID/);
    assert.throws(() => validateOracleSources([
      { id: 'a', price: 100, timestamp: now + 1 },
      { id: 'b', price: 100, timestamp: now }
    ], { now }), /ORACLE_TIMESTAMP_IN_FUTURE/);
    assert.throws(() => validateOracleSources([
      { id: 'a', price: 100, timestamp: now - 31_000 },
      { id: 'b', price: 100, timestamp: now }
    ], { now, maxAgeMs: 30_000 }), /INSUFFICIENT_FRESH_ORACLE_SOURCES/);
    assert.throws(() => validateOracleSources([
      { id: 'a', price: 100, timestamp: now },
      { id: 'b', price: 140, timestamp: now }
    ], { now }), /ORACLE_SOURCE_SPREAD_TOO_HIGH/);
  });

  it('bounds mark/index divergence and halts on a circuit-breaker attack', () => {
    const now = 1_800_000_000_000;
    const sources = { BTCUSDT: [
      { id: 'a', price: 100, timestamp: now },
      { id: 'b', price: 100, timestamp: now },
      { id: 'c', price: 100, timestamp: now }
    ] };
    const oracle = createOraclePriceService({
      sourceProvider: providerFor(sources),
      maxMoveRatio: 0.10,
      maxMarkIndexDeviationRatio: 0.005
    });
    oracle.refresh('BTCUSDT', { now });
    sources.BTCUSDT = [
      { id: 'a', price: 105, timestamp: now + 1 },
      { id: 'b', price: 105, timestamp: now + 1 },
      { id: 'c', price: 105, timestamp: now + 1 }
    ];
    const safe = oracle.refresh('BTCUSDT', { now: now + 1 });
    assert.ok(safe.markIndexDeviationRatio <= 0.005 + Number.EPSILON);

    const breaker = priceCircuitBreaker({ previousPrice: 105, nextPrice: 150, maxMoveRatio: 0.10 });
    assert.equal(breaker.allowed, false);
    assert.deepEqual(evaluateEmergencyTriggers({ circuitBreakerAllowed: breaker.allowed }),
      { state: 'HALTED', reason: 'PRICE_CIRCUIT_BREAKER' });
  });

  it('enforces least privilege and replay protection for authenticated operations', () => {
    const readOnly = createApiKeyDescriptor({ keyId: 'read-only', permissions: [API_PERMISSIONS.READ] });
    assert.equal(assertPermission(readOnly, API_PERMISSIONS.READ), true);
    assert.throws(() => assertPermission(readOnly, API_PERMISSIONS.TRADE), /API_PERMISSION_DENIED/);
    assert.throws(() => assertPermission(readOnly, API_PERMISSIONS.WITHDRAW), /API_PERMISSION_DENIED/);

    const guard = createReplayGuard({ ttlMs: 60_000, maxEntries: 10 });
    assert.equal(guard.consume({ keyId: 'trader', nonce: 'n-1', now: 1000 }), true);
    assert.throws(() => guard.consume({ keyId: 'trader', nonce: 'n-1', now: 1001 }), /REPLAY_DETECTED/);
  });

  it('keeps emergency trigger invariants deterministic across stress inputs', () => {
    for (let debt = 0; debt <= 100_000; debt += 997) {
      const state = evaluateEmergencyTriggers({ oracleHealthy: true, circuitBreakerAllowed: true, residualBadDebt: debt });
      assert.equal(state.state, debt === 0 ? 'ACTIVE' : 'REDUCE_ONLY');
    }
    for (let moveBps = 1; moveBps <= 5000; moveBps += 37) {
      const next = 100 * (1 + moveBps / 10_000);
      const breaker = priceCircuitBreaker({ previousPrice: 100, nextPrice: next, maxMoveRatio: 0.10 });
      assert.equal(breaker.allowed, moveBps <= 1000);
    }
  });
});
