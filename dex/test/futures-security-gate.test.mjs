import assert from 'node:assert/strict';

import { createApiKeyDescriptor, API_PERMISSIONS, assertPermission, createReplayGuard } from '../app/futures/api-auth-contract.js';
import { evaluateEmergencyTriggers } from '../app/futures/emergency-controls.js';
import { validateOracleSources, priceCircuitBreaker } from '../app/futures/oracle-guard.js';
import { createOraclePriceService } from '../app/futures/oracle-price-service.js';
import { activateFuturesListing, validateFuturesListingCandidate } from '../app/futures/listing-activation-gate.js';

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
      assert.equal(breaker.allowed, breaker.moveRatio <= 0.10);
    }
  });
  it('blocks new market activation until oracle, risk, stress, security and approval gates pass', () => {
    const candidate = {
      market: { symbol: 'DOGEUSDT', base: 'DOGE', quote: 'USDT', type: 'PERPETUAL', status: 'DEMO', maxLeverage: 10, tickSize: 0.00001, stepSize: 1, maintenanceMarginRate: 0.02 },
      oracle: { minSources: 3, maxAgeMs: 30_000, maxDeviationRatio: 0.01 },
      riskLimits: { maxOpenInterest: 1_000_000, maxPositionNotional: 100_000, maxOrderNotional: 25_000 },
      approvals: { oracleValidated: true, riskValidated: true, liquidationStressPassed: true, insuranceAdlStressPassed: true, securityGatePassed: true, activationApproved: false }
    };
    const pending = validateFuturesListingCandidate(candidate);
    assert.equal(pending.activatable, false);
    assert.deepEqual(pending.missing, ['activationApproved']);
    assert.throws(() => activateFuturesListing(candidate), /FUTURES_LISTING_ACTIVATION_BLOCKED/);

    const approved = { ...candidate, approvals: { ...candidate.approvals, activationApproved: true } };
    assert.deepEqual(activateFuturesListing(approved), { symbol: 'DOGEUSDT', status: 'ACTIVE' });

    assert.throws(() => validateFuturesListingCandidate({ ...approved, oracle: { ...approved.oracle, minSources: 2 } }), /LISTING_ORACLE_REQUIRES_THREE_SOURCES/);
    assert.throws(() => validateFuturesListingCandidate({ ...approved, riskLimits: { ...approved.riskLimits, maxOrderNotional: 200_000 } }), /LISTING_ORDER_LIMIT_EXCEEDS_POSITION_LIMIT/);
  });
  it('keeps 100 independently configured listing candidates isolated under mixed failures', () => {
    const candidates = Array.from({ length: 100 }, (_, index) => {
      const base = `T${String(index).padStart(3, '0')}`;
      return {
        market: { symbol: `${base}USDT`, base, quote: 'USDT', type: 'PERPETUAL', status: 'DEMO', maxLeverage: 10, tickSize: 0.0001, stepSize: 1, maintenanceMarginRate: 0.02 },
        oracle: { minSources: 3, maxAgeMs: 30_000, maxDeviationRatio: 0.01 },
        riskLimits: { maxOpenInterest: 1_000_000, maxPositionNotional: 100_000, maxOrderNotional: 25_000 },
        approvals: { oracleValidated: true, riskValidated: true, liquidationStressPassed: true, insuranceAdlStressPassed: true, securityGatePassed: true, activationApproved: true }
      };
    });

    candidates[20].oracle.minSources = 2;
    candidates[50].riskLimits.maxOrderNotional = 200_000;
    candidates[80].approvals.securityGatePassed = false;

    const results = candidates.map((candidate, index) => {
      try {
        return { index, result: validateFuturesListingCandidate(candidate) };
      } catch (error) {
        return { index, error: error.message };
      }
    });

    assert.equal(results.filter(({ result }) => result?.activatable).length, 97);
    assert.match(results[20].error, /LISTING_ORACLE_REQUIRES_THREE_SOURCES/);
    assert.match(results[50].error, /LISTING_ORDER_LIMIT_EXCEEDS_POSITION_LIMIT/);
    assert.equal(results[80].result.activatable, false);
    assert.deepEqual(results[80].result.missing, ['securityGatePassed']);
    for (const { index, result } of results) {
      if ([20, 50, 80].includes(index)) continue;
      assert.equal(result.symbol, candidates[index].market.symbol);
      assert.equal(result.activatable, true);
    }
  });
});
