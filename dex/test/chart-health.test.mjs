import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),source=fs.readFileSync(path.join(root,'app/chart-health.js'),'utf8'),context={globalThis:null};context.globalThis=context;vm.runInNewContext(source,context);const health=context.LQCChartHealth;

describe('LQC live chart health classification',function(){
  it('marks signed responses at or below 1.5 seconds healthy',function(){assert.equal(health.classify({latencyMs:1500}).level,'healthy')});
  it('marks slow responses and initial failures delayed',function(){assert.equal(health.classify({latencyMs:1501}).level,'delayed');assert.equal(health.classify({consecutiveFailures:2}).level,'delayed')});
  it('marks offline or three consecutive failures interrupted',function(){assert.equal(health.classify({online:false}).level,'interrupted');assert.equal(health.classify({consecutiveFailures:3}).level,'interrupted')});
  it('rejects malformed measurements',function(){assert.throws(()=>health.classify({latencyMs:-1}),/invalid/);assert.throws(()=>health.classify({consecutiveFailures:1.5}),/invalid/) });
});
