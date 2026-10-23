import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test,after} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {createProviderForTests} from './anvil-compat.mjs';

// This suite supplies every process/RPC/timer dependency; it never starts Anvil.
const observations=[];
class Child extends EventEmitter {
  pid=123;exitCode=null;signalCode=null;killCalls=0;
  get killed(){throw Error('killed must not be used as a liveness check');}
  end(code=0,signal=null){this.exitCode=code;this.signalCode=signal;this.emit('exit',code,signal);this.emit('close',code,signal);}
  kill(signal){this.killCalls++;assert.equal(signal,'SIGTERM');if(this.onKill)return this.onKill();queueMicrotask(()=>this.end(null,'SIGTERM'));return true;}
}
function harness(name,{start,fetch,options={}}={}){
  const child=new Child(),calls=[],spawns=[],timers=new Set();
  const deps={
    spawn:(...args)=>{spawns.push(args);if(start)start(child);return child;},
    fetch:async(...args)=>{calls.push(JSON.parse(args[1].body));if(fetch)return fetch(child,calls,args);return {json:async()=>({result:'0x7a69'})};},
    setTimeout:(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);fn();},ms===100?0:10);timers.add(id);return id;},
    clearTimeout:id=>{clearTimeout(id);timers.delete(id);},
  };
  const api=createProviderForTests(options,deps),h={api,child,calls,spawns,timers};observations.push({name,h});return h;
}
const request=api=>api.request({method:'eth_chainId'});
const ready=async h=>{assert.equal(await request(h.api),'0x7a69');assert.equal(h.api.diagnostics().ready,true);};
after(()=>{
  for(const {h}of observations)assert.equal(h.timers.size,0,'NO_TIMER_LEAK');
  if(process.env.LQC_LIFECYCLE_RESULT_DIR)fs.writeFileSync(path.join(process.env.LQC_LIFECYCLE_RESULT_DIR,'mock-process-observations.json'),JSON.stringify(observations.map(({name,h})=>({name,spawnCount:h.spawns.length,rpcCount:h.calls.length,killCount:h.child.killCalls,diagnostics:h.api.diagnostics()})),null,2)+'\n');
});

test('synchronous spawn failure preserves startup error and needs no cleanup kill',async t=>{
  const h=harness(t.name,{start:()=>{const e=new Error('mock spawn denied');e.code='MOCK_DENIED';throw e;}});
  await assert.rejects(request(h.api),e=>e.code==='ANVIL_STARTUP_FAILURE'&&e.originalCode==='MOCK_DENIED'&&e.anvilLifecycle.spawnFailed);
  await h.api.disconnect();assert.equal(h.child.killCalls,0);assert.equal(h.calls.length,0);assert.equal(h.api.diagnostics().cleanupFailure,null);
});
test('spawn error event is recorded with close and stops an in-flight readiness RPC',async t=>{
  const h=harness(t.name,{start:c=>{c.pid=undefined;queueMicrotask(()=>{const e=new Error('mock spawn error');e.code='MOCK_SPAWN';c.emit('error',e);c.emit('close',null,null);});},fetch:()=>new Promise(()=>{})});
  await assert.rejects(request(h.api),e=>e.code==='ANVIL_STARTUP_FAILURE'&&e.originalCode==='MOCK_SPAWN');
  await h.api.disconnect();assert.deepEqual(h.api.diagnostics().events.filter(x=>['error','close'].includes(x.event)).map(x=>x.event),['error','close']);assert.equal(h.child.killCalls,0);assert(h.calls.length<=1);
});
test('early exit before RPC readiness rejects immediately without another probe',async t=>{
  const h=harness(t.name,{fetch:c=>{queueMicrotask(()=>c.end(7));return new Promise(()=>{});}});
  await assert.rejects(request(h.api),/Anvil child exit: code=7/);await h.api.disconnect();assert.equal(h.calls.length,1);assert.equal(h.child.killCalls,0);assert.equal(h.api.diagnostics().startupFailure.phase,'startup');
});
test('close without exit before readiness is observed as termination',async t=>{
  const h=harness(t.name,{fetch:c=>{queueMicrotask(()=>c.emit('close',9,null));return new Promise(()=>{});}});
  await assert.rejects(request(h.api),/Anvil child close: code=9/);await h.api.disconnect();assert.equal(h.api.diagnostics().terminated,true);assert.equal(h.child.killCalls,0);
});
test('exit after normal readiness rejects later requests and records exit and close',async t=>{
  const h=harness(t.name);await ready(h);h.child.end(0);const count=h.calls.length;
  await assert.rejects(request(h.api),e=>e.code==='ANVIL_PROCESS_FAILURE');await h.api.disconnect();assert.equal(h.calls.length,count);assert.equal(h.child.killCalls,0);assert.equal(h.api.diagnostics().startupFailure,null);
});
test('already exited child before cleanup finishes immediately without kill',async t=>{
  const h=harness(t.name);await ready(h);h.child.exitCode=12;await h.api.disconnect();assert.equal(h.child.killCalls,0);assert.equal(h.api.diagnostics().terminated,true);assert(h.api.diagnostics().events.some(x=>x.event==='already-exited'));
});
test('natural exit racing with kill false is accepted only after termination',async t=>{
  const h=harness(t.name);await ready(h);h.child.onKill=()=>{queueMicrotask(()=>h.child.end(0));return false;};
  await h.api.disconnect();assert.equal(h.child.killCalls,1);assert.equal(h.api.diagnostics().terminated,true);assert.equal(h.api.diagnostics().cleanupFailure,null);
});
test('missing termination events cause bounded cleanup failure retained on repeat',async t=>{
  const h=harness(t.name);await ready(h);h.child.onKill=()=>true;const first=h.api.disconnect();
  await assert.rejects(first,e=>e.code==='ANVIL_CLEANUP_FAILURE'&&e.anvilLifecycle.terminated===false);assert.equal(h.api.disconnect(),first);await assert.rejects(h.api.disconnect(),/termination was not confirmed/);assert.equal(h.child.killCalls,1);
});
test('concurrent and repeated disconnect share completion and send one kill',async t=>{
  const h=harness(t.name);await ready(h);const first=h.api.disconnect(),second=h.api.disconnect();assert.equal(first,second);await Promise.all([first,second]);assert.equal(h.api.disconnect(),first);await h.api.disconnect();assert.equal(h.child.killCalls,1);
});
test('disconnect before first request never spawns and permanently rejects requests',async t=>{
  const h=harness(t.name);await h.api.disconnect();await assert.rejects(request(h.api),e=>e.code==='ANVIL_DISCONNECTED');assert.equal(h.spawns.length,0);assert.equal(h.calls.length,0);
});
test('readiness probe exhaustion preserves the exact maximum of 100 attempts',async t=>{
  const h=harness(t.name,{fetch:()=>{throw Error('mock RPC unavailable');}});
  await assert.rejects(request(h.api),/after 100 attempts: mock RPC unavailable/);assert.equal(h.calls.length,100);await h.api.disconnect();assert.equal(h.child.killCalls,1);assert.equal(h.api.diagnostics().cleanupFailure,null);
});
test('process exit during retry delay cancels the timer without a second probe',async t=>{
  const h=harness(t.name,{fetch:()=>{throw Error('mock unavailable');}});const pending=request(h.api);const caught=assert.rejects(pending,/Anvil child exit/);
  for(let i=0;i<100&&!h.timers.size;i++)await Promise.resolve();assert.equal(h.timers.size,1);h.child.end(8);await caught;assert.equal(h.calls.length,1);await h.api.disconnect();assert.equal(h.timers.size,0);
});
test('synchronous exit during kill cannot be missed by cleanup',async t=>{
  const h=harness(t.name);await ready(h);h.child.onKill=()=>{h.child.end(null,'SIGTERM');return true;};await h.api.disconnect();assert.equal(h.child.killCalls,1);assert.equal(h.timers.size,0);
});
test('startup failure and subsequent cleanup failure remain distinct',async t=>{
  const h=harness(t.name,{fetch:()=>{throw Error('mock startup unavailable');}});await assert.rejects(request(h.api),/after 100 attempts/);h.child.onKill=()=>{throw Error('mock kill denied');};
  await assert.rejects(h.api.disconnect(),e=>e.code==='ANVIL_CLEANUP_FAILURE');const d=h.api.diagnostics();assert.match(d.startupFailure.message,/mock startup unavailable/);assert.equal(d.cleanupFailure.message,'mock kill denied');assert.equal(d.terminated,false);
});
test('disconnect cancels a hanging readiness RPC and confirms child termination',async t=>{
  const h=harness(t.name,{fetch:()=>new Promise(()=>{})});const pending=request(h.api),caught=assert.rejects(pending,e=>e.code==='ANVIL_DISCONNECTED');await h.api.disconnect();await caught;assert.equal(h.child.killCalls,1);assert.equal(h.api.diagnostics().terminated,true);assert.equal(h.api.diagnostics().startupFailure,null);
});
test('existing spawn arguments and RPC semantics are preserved with explicit mocks',async t=>{
  const h=harness(t.name,{options:{wallet:{totalAccounts:4},chain:{chainId:31337,hardfork:'shanghai'},stepsTracing:true}});await ready(h);
  assert.equal(h.spawns.length,1);const [executable,args,opts]=h.spawns[0];assert.equal(executable,process.execPath);assert.match(args[0],/anvil[\\/]bin\.mjs$/);assert.deepEqual(args.slice(1,7),['--host','127.0.0.1','--port',new URL('http://127.0.0.1:'+args[4]).port,'--silent','--steps-tracing']);assert(args.includes('--accounts'));assert(args.includes('4'));assert(args.includes('31337'));assert(args.includes('shanghai'));assert.deepEqual(opts,{stdio:['ignore','ignore','inherit']});
  await h.api.request({method:'evm_setTime',params:['2026-01-01T00:00:00Z']});assert.deepEqual(h.calls.at(-1).params,[1767225600]);await h.api.disconnect();assert.throws(()=>createProviderForTests({},{}),/Mock dependency required/);
});
