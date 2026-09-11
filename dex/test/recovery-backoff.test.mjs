import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'app/recovery-backoff.js'),'utf8');
const context={};vm.runInNewContext(source,context);
const {delay}=context.LQCRecoveryBackoff;

describe('LQC pending settlement recovery backoff',function(){
  it('backs off from 30 seconds and caps at five minutes',function(){
    assert.deepEqual([0,1,2,3,4,20].map(attempt=>delay(attempt)),[30000,60000,120000,240000,300000,300000]);
  });
  it('supports reviewed deployment-specific bounds',function(){
    assert.equal(delay(2,{baseMs:1000,maxMs:3500}),3500);
  });
  it('rejects malformed attempts and unsafe bounds',function(){
    assert.throws(()=>delay(-1),/attempt/);
    assert.throws(()=>delay(1.5),/attempt/);
    assert.throws(()=>delay(0,{baseMs:999,maxMs:300000}),/base/);
    assert.throws(()=>delay(0,{baseMs:30000,maxMs:29999}),/maximum/);
  });
});
