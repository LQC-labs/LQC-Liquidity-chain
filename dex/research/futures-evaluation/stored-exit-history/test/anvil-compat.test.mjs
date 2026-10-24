import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test,after} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
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
  const child=new Child(),calls=[],spawns=[],timers=new Set(),timerDelays=new Map();
  const deps={
    spawn:(...args)=>{spawns.push(args);if(start)start(child);return child;},
    fetch:async(...args)=>{calls.push(JSON.parse(args[1].body));if(fetch)return fetch(child,calls,args);return {json:async()=>({result:'0x7a69'})};},
    // Preserve the original retry/cleanup acceleration; never compress the new deadline.
    setTimeout:(fn,ms)=>{const id=setTimeout(()=>{timers.delete(id);timerDelays.delete(id);fn();},ms===100?0:ms===1000?10:ms);timers.add(id);timerDelays.set(id,ms);return id;},
    clearTimeout:id=>{clearTimeout(id);timers.delete(id);timerDelays.delete(id);},
    now:()=>performance.now(),
  };
  const api=createProviderForTests(options,deps),h={api,child,calls,spawns,timers,timerDelays};observations.push({name,h});return h;
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
  for(let i=0;i<100&&![...h.timerDelays.values()].includes(100);i++)await Promise.resolve();assert.equal([...h.timerDelays.values()].filter(ms=>ms===100).length,1);h.child.end(8);await caught;assert.equal(h.calls.length,1);await h.api.disconnect();assert.equal(h.timers.size,0);
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

// New deadline checks use one manually advanced monotonic clock, not wall-clock sleeps.
const flush=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const response=()=>({json:async()=>({result:'0x7a69'})});
class Clock {
  time=0;next=0;tasks=new Map();
  setTimeout=(fn,ms)=>{const id=++this.next;this.tasks.set(id,{fn,at:this.time+ms,ms});return id;};
  clearTimeout=id=>this.tasks.delete(id);
  elapseWithoutDispatch(ms){this.time+=ms;}
  async advance(ms){
    const target=this.time+ms;await flush();
    for(;;){const next=[...this.tasks].filter(([,x])=>x.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;
      const[id,x]=next;this.time=Math.max(this.time,x.at);this.tasks.delete(id);x.fn();await flush();
    }
    this.time=Math.max(this.time,target);await flush();
  }
}
function virtualHarness(name,{fetch,start,clock=new Clock()}={}){
  const child=new Child(),calls=[],spawns=[],signals=[];
  const deps={spawn:(...args)=>{spawns.push(args);if(start)start(child,clock);return child;},
    fetch:(...args)=>{calls.push(JSON.parse(args[1].body));signals.push(args[1].signal);return fetch?fetch(child,calls,args,clock):Promise.resolve(response());},
    setTimeout:clock.setTimeout,clearTimeout:clock.clearTimeout,now:()=>clock.time};
  const api=createProviderForTests({},deps),h={api,child,calls,spawns,signals,clock,timers:clock.tasks};observations.push({name,h});return h;
}
const timeout=e=>e.code==='ANVIL_STARTUP_TIMEOUT'&&e.phase==='startup'&&e.timeoutMs===15000;

test('startup deadline aborts a hanging fetch at exactly 15000ms without another probe',async t=>{
  const h=virtualHarness(t.name,{fetch:()=>new Promise(()=>{})});const pending=request(h.api),caught=assert.rejects(pending,timeout);
  await h.clock.advance(14999);assert.equal(h.signals[0].aborted,false);assert.equal(h.api.diagnostics().startupFailure,null);
  await h.clock.advance(1);await caught;assert.equal(h.signals[0].aborted,true);assert.equal(h.calls.length,1);
  const event=h.api.diagnostics().events.find(e=>e.event==='startup-timeout');assert.equal(event.elapsedMs,15000);assert.equal(event.stage,'fetch');
  await assert.rejects(request(h.api),timeout);assert.equal(h.calls.length,1);await h.api.disconnect();
});
test('startup deadline aborts a hanging JSON body at exactly 15000ms',async t=>{
  const h=virtualHarness(t.name,{fetch:async()=>({json:()=>new Promise(()=>{})})});const caught=assert.rejects(request(h.api),timeout);await flush();
  assert.equal(h.api.diagnostics().startupTiming.stage,'json-body');await h.clock.advance(15000);await caught;
  assert.equal(h.signals[0].aborted,true);assert.equal(h.calls.length,1);assert.equal(h.api.diagnostics().ready,false);await h.api.disconnect();
});
test('startup deadline shares one budget across fetch JSON and retry delays',async t=>{
  const headers=deferred(),body=deferred();const h=virtualHarness(t.name,{fetch:(_,calls)=>calls.length===1?headers.promise:new Promise(()=>{})});
  const caught=assert.rejects(request(h.api),timeout);await h.clock.advance(4000);headers.resolve({json:()=>body.promise});await flush();
  await h.clock.advance(4000);body.reject(Error('mock body failure'));await flush();assert.equal(h.api.diagnostics().startupTiming.stage,'retry-delay');
  await h.clock.advance(100);assert.equal(h.calls.length,2);assert.equal(h.api.diagnostics().startupTiming.deadline,15000);
  await h.clock.advance(6900);await caught;assert(h.signals.every(s=>s.aborted));assert.equal(h.calls.length,2);await h.api.disconnect();
});
test('startup deadline interrupts a retry delay without starting another probe',async t=>{
  const headers=deferred(),h=virtualHarness(t.name,{fetch:()=>headers.promise});const caught=assert.rejects(request(h.api),timeout);
  await h.clock.advance(14950);headers.reject(Error('mock fetch failure'));await flush();assert.equal(h.api.diagnostics().startupTiming.stage,'retry-delay');
  await h.clock.advance(50);await caught;assert.equal(h.calls.length,1);assert.equal(h.timers.size,0);await h.api.disconnect();
});
test('startup success before deadline clears its timer',async t=>{
  const headers=deferred(),h=virtualHarness(t.name,{fetch:(_,calls)=>calls.length===1?headers.promise:Promise.resolve(response())});const pending=request(h.api);
  await h.clock.advance(14999);headers.resolve(response());await flush();assert.equal(await pending,'0x7a69');assert.equal(h.api.diagnostics().ready,true);assert.equal(h.timers.size,0);
  await h.clock.advance(20000);assert.equal(h.api.diagnostics().startupFailure,null);assert(!h.api.diagnostics().events.some(e=>e.event==='startup-timeout'));await h.api.disconnect();
});
test('startup success at the deadline is rejected even before timer dispatch',async t=>{
  const body=deferred(),h=virtualHarness(t.name,{fetch:async()=>({json:()=>body.promise})});const caught=assert.rejects(request(h.api),timeout);await flush();
  h.clock.elapseWithoutDispatch(15000);body.resolve({result:'0x7a69'});await flush();await caught;
  assert.equal(h.api.diagnostics().ready,false);assert.equal(h.calls.length,1);assert.equal(h.timers.size,0);await h.api.disconnect();
});
test('startup budget starts before spawn and includes synchronous spawn elapsed time',async t=>{
  const h=virtualHarness(t.name,{start:(_,clock)=>clock.elapseWithoutDispatch(15000)});await assert.rejects(request(h.api),timeout);
  assert.equal(h.calls.length,0);assert.equal(h.api.diagnostics().startupTiming.startedAt,0);assert.equal(h.api.diagnostics().startupTiming.stage,'spawn');assert.equal(h.timers.size,0);await h.api.disconnect();
});
test('child exit before deadline wins and cancels the active request',async t=>{
  const h=virtualHarness(t.name,{fetch:()=>new Promise(()=>{})});const caught=assert.rejects(request(h.api),e=>e.code==='ANVIL_STARTUP_FAILURE'&&/code=7/.test(e.message));
  await h.clock.advance(14999);h.child.end(7);await caught;await h.clock.advance(1000);
  assert.equal(h.signals[0].aborted,true);assert.equal(h.api.diagnostics().startupFailure.code,'ANVIL_STARTUP_FAILURE');assert(!h.api.diagnostics().events.some(e=>e.event==='startup-timeout'));await h.api.disconnect();assert.equal(h.child.killCalls,0);
});
test('deadline before child exit preserves timeout and records later termination',async t=>{
  const h=virtualHarness(t.name,{fetch:()=>new Promise(()=>{})});const caught=assert.rejects(request(h.api),timeout);await h.clock.advance(15000);await caught;
  const original=h.api.diagnostics().startupFailure;h.child.end(8);assert.deepEqual(h.api.diagnostics().startupFailure,original);
  assert(h.api.diagnostics().events.some(e=>e.event==='exit'&&e.code===8));await h.api.disconnect();assert.equal(h.child.killCalls,0);
});
test('same-time child exit before deadline preserves the child startup failure',async t=>{
  const h=virtualHarness(t.name,{fetch:()=>new Promise(()=>{})});h.clock.setTimeout(()=>h.child.end(9),15000);
  const caught=assert.rejects(request(h.api),e=>e.code==='ANVIL_STARTUP_FAILURE'&&/code=9/.test(e.message));await h.clock.advance(15000);await caught;
  assert(!h.api.diagnostics().events.some(e=>e.event==='startup-timeout'));assert.equal(h.signals[0].aborted,true);await h.api.disconnect();
});
test('same-time deadline before child exit preserves the timeout failure',async t=>{
  const h=virtualHarness(t.name,{fetch:()=>new Promise(()=>{})});const caught=assert.rejects(request(h.api),timeout);h.clock.setTimeout(()=>h.child.end(10),15000);
  await h.clock.advance(15000);await caught;assert.equal(h.api.diagnostics().startupFailure.code,'ANVIL_STARTUP_TIMEOUT');assert.equal(h.api.diagnostics().terminated,true);assert.equal(h.signals[0].aborted,true);await h.api.disconnect();
});
test('disconnect before deadline cancels startup without creating a timeout failure',async t=>{
  const h=virtualHarness(t.name,{fetch:()=>new Promise(()=>{})});const caught=assert.rejects(request(h.api),e=>e.code==='ANVIL_DISCONNECTED');await h.clock.advance(14999);
  const first=h.api.disconnect();assert.equal(h.api.disconnect(),first);await first;await caught;await h.clock.advance(20000);
  assert.equal(h.child.killCalls,1);assert.equal(h.signals[0].aborted,true);assert.equal(h.api.diagnostics().startupFailure,null);assert.equal(h.api.diagnostics().cleanupFailure,null);
});
test('startup timeout and cleanup timeout stay distinct on repeated disconnect',async t=>{
  const h=virtualHarness(t.name,{fetch:()=>new Promise(()=>{})});const startup=assert.rejects(request(h.api),timeout);await h.clock.advance(15000);await startup;h.child.onKill=()=>true;
  const first=h.api.disconnect(),cleanup=assert.rejects(first,e=>e.code==='ANVIL_CLEANUP_FAILURE');assert.equal(h.api.disconnect(),first);
  await h.clock.advance(999);assert.equal(h.api.diagnostics().cleanupFailure,null);await h.clock.advance(1);await cleanup;
  const d=h.api.diagnostics();assert.equal(d.startupFailure.code,'ANVIL_STARTUP_TIMEOUT');assert.equal(d.cleanupFailure.code,'ANVIL_CLEANUP_FAILURE');assert.equal(d.terminated,false);assert.equal(h.api.disconnect(),first);assert.equal(h.child.killCalls,1);
});
test('late fetch completion after timeout cannot parse a body or become ready',async t=>{
  let parsed=0;const headers=deferred(),h=virtualHarness(t.name,{fetch:()=>headers.promise});const caught=assert.rejects(request(h.api),timeout);await h.clock.advance(15000);await caught;
  headers.resolve({json:async()=>{parsed++;return{result:'0x7a69'};}});await flush();assert.equal(parsed,0);assert.equal(h.calls.length,1);assert.equal(h.api.diagnostics().ready,false);await h.api.disconnect();
});
test('late JSON completion after timeout cannot become ready or issue another probe',async t=>{
  const body=deferred(),h=virtualHarness(t.name,{fetch:async()=>({json:()=>body.promise})});const caught=assert.rejects(request(h.api),timeout);await flush();await h.clock.advance(15000);await caught;
  body.resolve({result:'0x7a69'});await flush();assert.equal(h.calls.length,1);assert.equal(h.api.diagnostics().ready,false);assert.equal(h.signals[0].aborted,true);await h.api.disconnect();
});
test('ordinary RPC after readiness has no startup deadline',async t=>{
  const headers=deferred(),h=virtualHarness(t.name,{fetch:(_,calls)=>calls.length<=2?Promise.resolve(response()):headers.promise});await ready(h);
  let settled=false;const pending=request(h.api).then(x=>{settled=true;return x;});await flush();await h.clock.advance(60000);
  assert.equal(settled,false);assert.equal(h.signals.at(-1).aborted,false);assert.equal(h.api.diagnostics().startupFailure,null);headers.resolve(response());await flush();assert.equal(await pending,'0x7a69');await h.api.disconnect();
});
test('concurrent startup callers share one budget and the first timeout error',async t=>{
  const h=virtualHarness(t.name,{fetch:()=>new Promise(()=>{})}),a=request(h.api).catch(e=>e),b=request(h.api).catch(e=>e);await h.clock.advance(15000);
  const[first,second]=await Promise.all([a,b]);assert(timeout(first));assert.equal(first,second);assert.equal(h.spawns.length,1);assert.equal(h.calls.length,1);assert.equal(h.api.diagnostics().events.filter(e=>e.event==='startup-timeout').length,1);await h.api.disconnect();
});
test('all 100 failed probes can exhaust before the startup deadline',async t=>{
  const h=virtualHarness(t.name,{fetch:()=>{throw Error('mock unavailable');}});const caught=assert.rejects(request(h.api),e=>e.code==='ANVIL_STARTUP_FAILURE'&&/after 100 attempts/.test(e.message));
  await h.clock.advance(9900);await caught;assert.equal(h.calls.length,100);assert.equal(h.clock.time,9900);assert(!h.api.diagnostics().events.some(e=>e.event==='startup-timeout'));await h.api.disconnect();
});
