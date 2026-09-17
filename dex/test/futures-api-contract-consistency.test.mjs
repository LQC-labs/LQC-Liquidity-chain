import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { API_VERSION, API_PREFIX, publicApiPath, recoverySnapshotPath, parseKlineChannel } from '../app/futures/api-contract.js';
import { REST_API_VERSION, REST_API_PREFIX } from '../app/futures/rest-api-router.js';
import { sequenceRecovery } from '../app/futures/websocket-stream.js';

describe('Futures REST and WebSocket shared API contract', () => {
  it('keeps REST version and prefix aligned with the shared contract', () => {
    assert.equal(REST_API_VERSION, API_VERSION);
    assert.equal(REST_API_PREFIX, API_PREFIX);
    assert.equal(API_PREFIX, `/api/${API_VERSION}`);
  });

  it('normalizes symbols in public API paths', () => {
    assert.equal(publicApiPath('markPrice', ' lqcusdt '), `${API_PREFIX}/markPrice?symbol=LQCUSDT`);
  });

  it('uses the shared recovery contract for WebSocket sequence gaps', () => {
    const channels = ['depth', 'trade', 'markPrice', 'ticker', 'bookTicker'];
    for (const channel of channels) {
      const recovery = sequenceRecovery(10, 12, { channel, symbol: 'LQCUSDT' });
      assert.equal(recovery.action, 'REBUILD_FROM_REST');
      assert.equal(recovery.snapshot, recoverySnapshotPath(channel, 'LQCUSDT'));
      assert.equal(recovery.snapshot.startsWith(`${REST_API_PREFIX}/`), true);
    }
  });

  it('parses kline channels and recovers from the matching REST snapshot', () => {
    assert.deepEqual(parseKlineChannel('kline.1m'), { channel: 'kline', interval: '1m' });
    assert.deepEqual(parseKlineChannel('kline.4h'), { channel: 'kline', interval: '4h' });
    assert.equal(parseKlineChannel('ticker'), null);

    const recovery = sequenceRecovery(4, 6, { channel: 'kline.1m', symbol: 'lqcusdt' });
    assert.equal(recovery.action, 'REBUILD_FROM_REST');
    assert.equal(recovery.snapshot, `${REST_API_PREFIX}/klines?symbol=LQCUSDT&interval=1m`);
    assert.equal(recovery.snapshot, recoverySnapshotPath('kline.1m', 'LQCUSDT'));
  });

  it('keeps truly unknown streams on the versioned exchangeInfo boundary', () => {
    const recovery = sequenceRecovery(4, 6, { channel: 'unknownChannel', symbol: 'LQCUSDT' });
    assert.equal(recovery.snapshot, `${REST_API_PREFIX}/exchangeInfo?symbol=LQCUSDT`);
  });
});
