import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sequenceRecovery } from '../app/futures/websocket-stream.js';

describe('Futures WebSocket REST sequence recovery', () => {
  it('applies contiguous events without a REST rebuild', () => {
    const result = sequenceRecovery(10, 11, { channel: 'depth', symbol: 'LQCUSDT' });
    assert.equal(result.gap, false);
    assert.equal(result.action, 'APPLY_EVENT');
    assert.equal(result.snapshot, null);
  });

  it('requires the depth REST snapshot when a sequence is skipped', () => {
    const result = sequenceRecovery(10, 12, { channel: 'depth', symbol: 'LQCUSDT' });
    assert.equal(result.gap, true);
    assert.equal(result.expected, 11);
    assert.equal(result.received, 12);
    assert.equal(result.action, 'REBUILD_FROM_REST');
    assert.equal(result.snapshot, '/api/v1/depth?symbol=LQCUSDT');
  });

  it('requires a markPrice REST snapshot for duplicate or old events', () => {
    const result = sequenceRecovery(10, 10, { channel: 'markPrice', symbol: 'LQCUSDT' });
    assert.equal(result.gap, true);
    assert.equal(result.duplicateOrOld, true);
    assert.equal(result.action, 'REBUILD_FROM_REST');
    assert.equal(result.snapshot, '/api/v1/markPrice?symbol=LQCUSDT');
  });

  it('maps public channels to their matching REST recovery boundary', () => {
    assert.equal(sequenceRecovery(2, 4, { channel: 'trade', symbol: 'LQCUSDT' }).snapshot, '/api/v1/trades?symbol=LQCUSDT');
    assert.equal(sequenceRecovery(2, 4, { channel: 'ticker', symbol: 'LQCUSDT' }).snapshot, '/api/v1/ticker/24hr?symbol=LQCUSDT');
    assert.equal(sequenceRecovery(2, 4, { channel: 'bookTicker', symbol: 'LQCUSDT' }).snapshot, '/api/v1/ticker/24hr?symbol=LQCUSDT');
  });

  it('maps kline channels to the interval-specific REST snapshot', () => {
    const result = sequenceRecovery(5, 7, { channel: 'kline.1m', symbol: 'LQCUSDT' });
    assert.equal(result.action, 'REBUILD_FROM_REST');
    assert.equal(result.snapshot, '/api/v1/klines?symbol=LQCUSDT&interval=1m');
  });
});
