import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createRestApiRouter, REST_API_PREFIX } from '../app/futures/rest-api-router.js';

describe('Futures REST Oracle status boundary', () => {
  test('returns shared oracle health metadata through the versioned REST API', () => {
    const gateway = {
      oracleStatus(symbol) {
        assert.equal(symbol, 'BTCUSDT');
        return Object.freeze({ available: true, healthy: false, stale: true, ageMs: 31_000 });
      }
    };
    const api = createRestApiRouter(gateway);
    const result = api.route({ path: `${REST_API_PREFIX}/oracle/status`, query: { symbol: 'BTCUSDT' }, id: 'oracle-status-test' });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.data, { available: true, healthy: false, stale: true, ageMs: 31_000 });
    assert.equal(result.headers['x-request-id'], 'oracle-status-test');
  });

  test('returns 503 when the market gateway does not expose oracle status', () => {
    const api = createRestApiRouter({});
    const result = api.route({ path: `${REST_API_PREFIX}/oracle/status`, query: { symbol: 'BTCUSDT' }, id: 'oracle-unavailable-test' });
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'ORACLE_STATUS_UNAVAILABLE');
  });

  test('returns 503 when no oracle status is available for the requested market', () => {
    const api = createRestApiRouter({ oracleStatus: () => null });
    const result = api.route({ path: `${REST_API_PREFIX}/oracle/status`, query: { symbol: 'BTCUSDT' }, id: 'oracle-missing-test' });
    assert.equal(result.status, 503);
    assert.equal(result.body.code, 'ORACLE_STATUS_UNAVAILABLE');
  });
});
