import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createOraclePriceService } from '../app/futures/oracle-price-service.js';

function providerFor(sourceMap) {
  return { getSources(symbol) { return sourceMap[symbol] ?? []; } };
}

const now = 1_800_000_000_000;

describe('Shared Oracle/Price service', () => {
  test('aggregates fresh independent sources and publishes mark price', () => {
    const service = createOraclePriceService({ sourceProvider: providerFor({ BTCUSDT: [
      { id: 'a', price: 100, timestamp: now - 1000 },
      { id: 'b', price: 100.5, timestamp: now - 500 },
      { id: 'c', price: 99.8, timestamp: now - 200 }
    ] }) });
    const result = service.refresh('btcusdt', { now });
    assert.equal(result.symbol, 'BTCUSDT');
    assert.equal(result.price, 100);
    assert.equal(result.sourceCount, 3);
    assert.equal(service.getMarkPrice('BTCUSDT', { now }), 100);
  });

  test('rejects stale sources before publishing a price', () => {
    const service = createOraclePriceService({ sourceProvider: providerFor({ BTCUSDT: [
      { id: 'a', price: 100, timestamp: now - 60_000 },
      { id: 'b', price: 100, timestamp: now - 60_000 }
    ] }) });
    assert.throws(() => service.refresh('BTCUSDT', { now }), /INSUFFICIENT_FRESH_ORACLE_SOURCES/);
    assert.equal(service.getMarkPrice('BTCUSDT', { now }), null);
  });

  test('rejects excessive source disagreement', () => {
    const service = createOraclePriceService({ sourceProvider: providerFor({ BTCUSDT: [
      { id: 'a', price: 100, timestamp: now },
      { id: 'b', price: 120, timestamp: now }
    ] }) });
    assert.throws(() => service.refresh('BTCUSDT', { now }), /ORACLE_SOURCE_SPREAD_TOO_HIGH|ORACLE_PRICE_DEVIATION_TOO_HIGH/);
  });

  test('circuit breaker blocks a sudden aggregate price move and preserves last price', () => {
    const sources = { BTCUSDT: [
      { id: 'a', price: 100, timestamp: now },
      { id: 'b', price: 100, timestamp: now },
      { id: 'c', price: 100, timestamp: now }
    ] };
    const service = createOraclePriceService({ sourceProvider: providerFor(sources), maxMoveRatio: 0.1 });
    service.refresh('BTCUSDT', { now });
    sources.BTCUSDT = [
      { id: 'a', price: 130, timestamp: now + 1000 },
      { id: 'b', price: 130, timestamp: now + 1000 },
      { id: 'c', price: 130, timestamp: now + 1000 }
    ];
    assert.throws(() => service.refresh('BTCUSDT', { now: now + 1000 }), /ORACLE_PRICE_CIRCUIT_BREAKER/);
    assert.equal(service.getMarkPrice('BTCUSDT', { now: now + 1000 }), 100);
  });

  test('production mode requires at least three fresh sources', () => {
    const service = createOraclePriceService({
      sourceProvider: providerFor({ BTCUSDT: [
        { id: 'a', price: 100, timestamp: now },
        { id: 'b', price: 100, timestamp: now }
      ] }),
      guardOptions: { productionMode: true, minSources: 2 }
    });
    assert.throws(() => service.refresh('BTCUSDT', { now }), /PRODUCTION_ORACLE_REQUIRES_THREE_SOURCES/);
  });

  test('notifies subscribers only after a guarded price is accepted', () => {
    const events = [];
    const service = createOraclePriceService({ sourceProvider: providerFor({ ETHUSDT: [
      { id: 'a', price: 200, timestamp: now },
      { id: 'b', price: 200, timestamp: now }
    ] }) });
    const unsubscribe = service.subscribe((event) => events.push(event));
    service.refresh('ETHUSDT', { now });
    unsubscribe();
    assert.equal(events.length, 1);
    assert.equal(events[0].price, 200);
  });

  test('blocks stale cached prices on normal reads and exposes health status', () => {
    const service = createOraclePriceService({
      sourceProvider: providerFor({ BTCUSDT: [
        { id: 'a', price: 100, timestamp: now },
        { id: 'b', price: 100, timestamp: now }
      ] }),
      maxReadAgeMs: 30_000
    });
    service.refresh('BTCUSDT', { now });
    assert.equal(service.getMarkPrice('BTCUSDT', { now: now + 30_000 }), 100);
    assert.equal(service.getMarkPrice('BTCUSDT', { now: now + 30_001 }), null);
    const status = service.getStatus('BTCUSDT', { now: now + 30_001 });
    assert.equal(status.available, true);
    assert.equal(status.healthy, false);
    assert.equal(status.stale, true);
    assert.equal(status.ageMs, 30_001);
  });

  test('allows stale price only through explicit diagnostic override', () => {
    const service = createOraclePriceService({
      sourceProvider: providerFor({ BTCUSDT: [
        { id: 'a', price: 100, timestamp: now },
        { id: 'b', price: 100, timestamp: now }
      ] }),
      maxReadAgeMs: 1_000
    });
    service.refresh('BTCUSDT', { now });
    assert.equal(service.getMarkPrice('BTCUSDT', { now: now + 1_001 }), null);
    assert.equal(service.getMarkPrice('BTCUSDT', { now: now + 1_001, allowStale: true }), 100);
  });
});
