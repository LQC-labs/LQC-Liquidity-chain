import assert from 'node:assert/strict';
import { clientAddress, FixedWindowRateLimiter, TtlCache } from '../scripts/candle-indexer-http.mjs';

describe('LQC candle indexer HTTP abuse controls',function(){
  it('limits each client and resets only after the configured window',function(){
    const limiter=new FixedWindowRateLimiter({limit:2,windowMs:1000,maxClients:10});
    assert.equal(limiter.consume('a',100).allowed,true);assert.equal(limiter.consume('a',101).allowed,true);assert.deepEqual(limiter.consume('a',102),{allowed:false,remaining:0,retryAfterSeconds:1});assert.equal(limiter.consume('a',1100).allowed,true);assert.equal(limiter.consume('b',102).allowed,true);
  });

  it('bounds tracked client identities under address churn',function(){
    const limiter=new FixedWindowRateLimiter({limit:1,windowMs:1000,maxClients:2});limiter.consume('a',0);limiter.consume('b',0);limiter.consume('c',1);assert.equal(limiter.clients.size,2);assert.equal(limiter.clients.has('a'),false);
  });

  it('expires and bounds cached signed responses',function(){
    const cache=new TtlCache({ttlMs:10,maxEntries:2});cache.set('a','one',0);assert.equal(cache.get('a',9),'one');assert.equal(cache.get('a',10),null);cache.set('a',1,20);cache.set('b',2,20);cache.set('c',3,20);assert.equal(cache.get('a',20),null);assert.equal(cache.get('c',20),3);
  });

  it('trusts forwarded addresses only when the proxy boundary is explicit',function(){
    const request={socket:{remoteAddress:'::ffff:127.0.0.1'},headers:{'x-forwarded-for':'203.0.113.8, 10.0.0.1'}};
    assert.equal(clientAddress(request),'127.0.0.1');assert.equal(clientAddress(request,{trustProxy:true}),'203.0.113.8');assert.throws(()=>clientAddress({...request,headers:{'x-forwarded-for':'spoofed'}},{trustProxy:true}),/invalid/);
  });
});
