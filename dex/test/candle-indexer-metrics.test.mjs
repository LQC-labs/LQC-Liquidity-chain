import assert from 'node:assert/strict';
import { IndexerMetrics, metricsAuthorized } from '../scripts/candle-indexer-metrics.mjs';

describe('LQC candle indexer operational metrics',function(){
  it('renders bounded low-cardinality Prometheus counters and gauges',function(){
    const metrics=new IndexerMetrics();metrics.increment('candle_requests_total');metrics.increment('candle_cache_hits_total',2);metrics.set('active_candle_requests',3);const output=metrics.render();
    assert.match(output,/# TYPE lqc_candle_requests_total counter/);assert.match(output,/lqc_candle_cache_hits_total 2/);assert.match(output,/lqc_active_candle_requests 3/);assert.doesNotMatch(output,/wallet|client_ip/);
  });

  it('rejects unknown, negative, and non-finite metric updates',function(){
    const metrics=new IndexerMetrics();assert.throws(()=>metrics.increment('unknown'),/invalid/);assert.throws(()=>metrics.set('indexer_lag_blocks',-1),/invalid/);assert.throws(()=>metrics.set('indexed_cursor',Infinity),/invalid/);
  });

  it('requires a sufficiently strong exact bearer token',function(){
    const token='a'.repeat(32);assert.equal(metricsAuthorized(`Bearer ${token}`,token),true);assert.equal(metricsAuthorized(`Bearer ${token}x`,token),false);assert.equal(metricsAuthorized('Bearer short','short'),false);
  });
});
