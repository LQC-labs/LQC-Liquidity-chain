import assert from 'node:assert/strict';
import { indexerHealth } from '../scripts/candle-indexer-health.mjs';

describe('LQC candle indexer operational health',function(){
  const base={now:100000,startedAt:1000,lastSuccessfulSyncAt:99000,cursor:989,head:1000,confirmations:12,maxStaleMs:30000,maxLagBlocks:20};

  it('reports ready only when finalized indexing is fresh and within lag policy',function(){
    const health=indexerHealth(base);
    assert.equal(health.status,'ready');assert.equal(health.ready,true);assert.equal(health.finalizedHead,988);assert.equal(health.indexedThrough,988);assert.equal(health.lagBlocks,0);
  });

  it('reports starting before the first successful synchronization',function(){
    const health=indexerHealth({...base,lastSuccessfulSyncAt:null,head:null,cursor:0});
    assert.equal(health.status,'starting');assert.equal(health.ready,false);assert.equal(health.lagBlocks,null);
  });

  it('reports degraded for stale or lagging synchronization',function(){
    assert.equal(indexerHealth({...base,lastSuccessfulSyncAt:60000}).status,'degraded');
    const lagging=indexerHealth({...base,cursor:900});assert.equal(lagging.status,'degraded');assert.equal(lagging.lagBlocks,89);
  });

  it('exposes reorg counters without leaking error text',function(){
    const health=indexerHealth({...base,reorgCount:2,lastReorgAt:97000,lastErrorAt:98000});
    assert.equal(health.reorgCount,2);assert.equal(health.lastReorgAt,97000);assert.equal(health.lastErrorAt,98000);assert.equal('lastError' in health,false);
  });

  it('requires an independent quorum when redundant RPC sources are configured',function(){
    const healthy=indexerHealth({...base,rpcConfigured:3,rpcHealthy:2,independentRpcVerified:true});assert.equal(healthy.ready,true);
    const unverified=indexerHealth({...base,rpcConfigured:3,rpcHealthy:2,independentRpcVerified:false});assert.equal(unverified.ready,false);assert.equal(unverified.status,'degraded');
  });
});
