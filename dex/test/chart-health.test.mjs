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
});
