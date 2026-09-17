import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createOraclePriceService } from '../app/futures/oracle-price-service.js';
import { createMarketDataGateway } from '../app/futures/market-data-gateway.js';

const now = 1_800_000_000_000;
function oracleWith(sources, options = {}) { return createOraclePriceService({ sourceProvider: { getSources: () => sources }, ...options }); }

describe('Market Data Gateway + Shared Oracle/Price service', () => {
  test('uses guarded shared oracle price instead of raw provider mark price', () => {
    const oracle = oracleWith([{ id: 'a', price: 100, timestamp: now }, { id: 'b', price: 100, timestamp: now }]);
    oracle.refresh('BTCUSDT', { now });
    const gateway = createMarketDataGateway({ getMarkPrice: () => 999 }, { oraclePriceService: oracle, now: () => now });
    assert.equal(gateway.markPrice('BTCUSDT').markPrice, 100);
  });

  test('overrides ticker mark price with guarded oracle price', () => {
    const oracle = oracleWith([{ id: 'a', price: 200, timestamp: now }, { id: 'b', price: 200, timestamp: now }]);
    oracle.refresh('ETHUSDT', { now });
    const provider = { getMarkPrice: () => 999, getTicker24h: () => ({ lastPrice: 198, markPrice: 999, openPrice: 190, highPrice: 205, lowPrice: 185, volume: 10, quoteVolume: 1950 }) };
    const gateway = createMarketDataGateway(provider, { oraclePriceService: oracle, now: () => now });
    assert.equal(gateway.ticker24h('ETHUSDT').markPrice, 200);
  });

  test('does not fall back to unguarded provider price when shared oracle has no accepted price', () => {
    const oracle = oracleWith([]);
    const gateway = createMarketDataGateway({ getMarkPrice: () => 999 }, { oraclePriceService: oracle, now: () => now });
    assert.throws(() => gateway.markPrice('BTCUSDT'), /MARK_PRICE_UNAVAILABLE/);
  });

  test('blocks an accepted oracle price after it becomes stale at gateway read time', () => {
    let clock = now;
    const oracle = oracleWith([{ id: 'a', price: 100, timestamp: now }, { id: 'b', price: 100, timestamp: now }], { maxReadAgeMs: 1_000 });
    oracle.refresh('BTCUSDT', { now });
    const gateway = createMarketDataGateway({ getMarkPrice: () => 999 }, { oraclePriceService: oracle, now: () => clock });
    assert.equal(gateway.markPrice('BTCUSDT').markPrice, 100);
    clock += 1_001;
    assert.throws(() => gateway.markPrice('BTCUSDT'), /MARK_PRICE_UNAVAILABLE/);
    assert.throws(() => gateway.ticker24h('BTCUSDT'), /MARK_PRICE_UNAVAILABLE/);
    const status = gateway.oracleStatus('BTCUSDT');
    assert.equal(status.available, true);
    assert.equal(status.healthy, false);
    assert.equal(status.stale, true);
    assert.equal(status.ageMs, 1_001);
  });

  test('streams only accepted shared oracle updates through the gateway', () => {
    const sources = [{ id: 'a', price: 100, timestamp: now }, { id: 'b', price: 100, timestamp: now }];
    const oracle = oracleWith(sources);
    const gateway = createMarketDataGateway({}, { oraclePriceService: oracle, now: () => now });
    const events = [];
    const unsubscribe = gateway.subscribe('BTCUSDT', (event) => events.push(event));
    oracle.refresh('BTCUSDT', { now });
    unsubscribe();
    assert.equal(events.length, 1);
    assert.equal(events[0].symbol, 'BTCUSDT');
    assert.equal(events[0].price, 100);
  });
});
