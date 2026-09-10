import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),source=fs.readFileSync(path.join(root,'app/chart-health.js'),'utf8'),context={globalThis:null};context.globalThis=context;vm.runInNewContext(source,context);const health=context.LQCChartHealth;

describe('LQC live chart health classification',function(){
  it('marks signed responses at or below 1.5 seconds healthy',function(){assert.equal(health.classify({latencyMs:1500}).level,'healthy')});
  it('marks slow, stale, and initially failed responses delayed',function(){assert.equal(health.classify({latencyMs:1501}).level,'delayed');assert.equal(health.classify({ageSeconds:16}).level,'delayed');assert.equal(health.classify({consecutiveFailures:2}).level,'delayed')});
  it('marks offline or three consecutive failures interrupted',function(){assert.equal(health.classify({online:false}).level,'interrupted');assert.equal(health.classify({consecutiveFailures:3}).level,'interrupted')});
  it('rejects malformed measurements',function(){assert.throws(()=>health.classify({latencyMs:-1}),/invalid/);assert.throws(()=>health.classify({ageSeconds:-1}),/invalid/);assert.throws(()=>health.classify({consecutiveFailures:1.5}),/invalid/) });
  it('classifies finalized-block distance from the BSC testnet head',function(){assert.equal(health.chainSync(988,1000).level,'synced');assert.equal(health.chainSync(980,1000).level,'catching-up');assert.equal(health.chainSync(900,1000).level,'stale')});
  it('refuses to trust a browser RPC behind the signed finalized block',function(){assert.equal(health.chainSync(1001,1000).level,'unverified');assert.throws(()=>health.chainSync(-1,1000),/invalid/)});
  it('selects a conservative majority head while isolating an outlier',function(){const result=health.consensusHead([1002,1000,900],3);assert.equal(result.head,1000);assert.equal(result.healthySources,2);assert.equal(result.independent,true)});
  it('fails closed without a configured-source majority',function(){assert.equal(health.consensusHead([1000],3),null);assert.equal(health.consensusHead([1000,1010],2),null);assert.equal(health.consensusHead([1000],1).head,1000);assert.throws(()=>health.consensusHead([-1],1),/invalid/)});
  it('requires a configured-source majority for one canonical block hash',function(){const a=`0x${'ab'.repeat(32)}`,b=`0x${'cd'.repeat(32)}`,result=health.consensusHash([a,a.toUpperCase().replace('0X','0x'),b],3);assert.equal(result.blockHash,a);assert.equal(result.healthySources,2);assert.equal(result.independent,true)});
  it('fails closed for conflicting or malformed block hashes',function(){const a=`0x${'ab'.repeat(32)}`,b=`0x${'cd'.repeat(32)}`;assert.equal(health.consensusHash([a,b],3),null);assert.equal(health.consensusHash([a],1).blockHash,a);assert.throws(()=>health.consensusHash(['0x1234'],1),/invalid/)});
});
