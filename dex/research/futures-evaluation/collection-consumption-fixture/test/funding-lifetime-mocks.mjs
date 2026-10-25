// Unit scenarios import the actual lifetime, never a fixture/provider/Anvil helper.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getEventListeners} from 'node:events';
import {fileURLToPath} from 'node:url';
import {FundingLifetime,F01_BUDGET} from './positive-funding-lifetime.mjs';
import support from './stored-tamper-io.cjs';
const {checkedFile,record,errorRecord}=support;
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.argv[2];
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
const capture=p=>{const r={state:'PENDING'};r.done=p.then(value=>{r.state='FULFILLED';r.value=value;},error=>{r.state='REJECTED';r.error=error;});return r;};
class Clock {
 time=0;nextId=1;timers=new Map();
 now(){return this.time;}
 setTimeout(fn,ms){assert(Number.isFinite(ms)&&ms>=0);const id=this.nextId++;this.timers.set(id,{at:this.time+ms,fn});return id;}
 clearTimeout(id){this.timers.delete(id);}
 jump(ms){assert(ms>=0);this.time+=ms;}
 async advance(ms){
  assert(ms>=0);const end=this.time+ms;let count=0;
  for(;;){const next=[...this.timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;
   assert(++count<10000,'CLOCK_PROGRESS_LIMIT');const [id,t]=next;this.timers.delete(id);this.time=Math.max(this.time,t.at);t.fn();await flush();}
  this.time=end;await flush();
 }
}
function harness(){
 const clock=new Clock(),writes=[],stderr=[],calls=[],owned=[];let journalFailure,behavior=()=>Promise.resolve('OK');
 const life=new FundingLifetime(value=>{if(journalFailure)throw journalFailure;writes.push(value);},{clock,writeStderr:value=>stderr.push(value)});
 const rpc={request:function(request){assert.equal(this,rpc);calls.push(request);return behavior(request);}},original=rpc.request,f={rpc,collectionPoisoned:false};life.install(f);life.taskSettled=true;
 const h={clock,writes,stderr,calls,life,f,original,checkpoints:[],behavior:fn=>{behavior=fn;},journalFailure:error=>{journalFailure=error;}};
 h.deferred=()=>{let resolve,reject;const d={state:'PENDING',promise:new Promise((a,b)=>{resolve=a;reject=b;})};d.resolve=v=>{assert.equal(d.state,'PENDING');d.state='FULFILLED';resolve(v);};d.reject=e=>{assert.equal(d.state,'PENDING');d.state='REJECTED';reject(e);};owned.push(d);return d;};
 h.snapshot=()=>({now:clock.time,timers:clock.timers.size,pending:life.pending.size,sessionPending:life.session?.pending.size??0,abortListeners:getEventListeners(life.controller.signal,'abort').length,taskSettled:life.taskSettled,poisoned:f.collectionPoisoned,originalRestored:f.rpc.request===original,sealed:life.sealed,submissionHashes:life.submissions.map(x=>x.hash),writes:writes.length,primary:errorRecord(life.primary),failures:life.failures.map(x=>({kind:x.kind,error:errorRecord(x.error)}))});
 h.mark=name=>h.checkpoints.push({name,...h.snapshot()});
 h.dispose=async()=>{
  // Settle only owned fake work; abort is never treated as transport termination.
  life.cancel();for(const d of owned)if(d.state==='PENDING')d.resolve('HARNESS_DISPOSAL');await flush();
  life.taskSettled=true;if(life.session)life.session.pending.clear();
  assert.equal(await life.drain(),true);if(f.rpc.request!==original){f.rpc.request=life.guard;life.restore();}
  life.seal();await flush();assert.equal(life.pending.size,0);assert.equal(clock.timers.size,0);assert.equal(getEventListeners(life.controller.signal,'abort').length,0);assert.equal(f.rpc.request,original);
 };
 return h;
}
const implementations=[
 ['L01',async h=>{
  assert.deepEqual(F01_BUDGET,{work:120000,termination:5000,evidence:15000,cleanup:5000,terminal:5000,mocha:180000,child:200000,phase:210000});assert(Object.isFrozen(F01_BUDGET));
  const hash='0x'+'12'.repeat(32);h.behavior(()=>Promise.resolve(hash));assert.equal(await h.f.rpc.request({method:'eth_sendTransaction',params:[{}]}),hash);
  assert.equal(h.life.submissions[0].hash,hash);assert.equal(h.writes.at(-1).state,'SUCCESS');assert.equal(h.calls.length,1);assert.equal(h.life.pending.size,0);
  let cleanupCalls=0;assert.equal(await h.life.drain(),true);assert.equal(await h.life.cleanup(async()=>{cleanupCalls++;}),true);assert(h.life.cleanupSucceeded);assert.equal(cleanupCalls,1);h.life.restore();h.life.seal();
  assert.equal(h.clock.timers.size,0);assert.equal(getEventListeners(h.life.controller.signal,'abort').length,0);h.mark('NORMAL_HASH_AND_CLEANUP');
 }],
 ['L02',async h=>{
  h.clock.jump(119999);h.life.check();h.clock.jump(1);assert.throws(()=>h.life.check(),e=>e.code==='F01_WORK_DEADLINE');const first=h.life.primary;
  const blocked=capture(h.f.rpc.request({method:'eth_call',params:[]}));await blocked.done;assert.equal(blocked.error,first);assert.equal(h.calls.length,0);h.mark('MONOTONIC_BOUNDARY_BLOCKS_LATE_WORK');
 }],
 ['L03',async h=>{
  const d=h.deferred();h.behavior(()=>d.promise);const result=capture(h.f.rpc.request({method:'eth_call',params:[]}));await flush();assert.equal(h.life.pending.size,1);
  await h.clock.advance(120000);await result.done;assert.equal(result.error.code,'F01_WORK_DEADLINE');assert.equal(d.state,'PENDING');assert.equal(h.life.pending.size,1);h.mark('ABORT_REJECTS_WAIT_NOT_UNDERLYING');
  d.resolve('LATE');await flush();assert.equal(h.life.pending.size,0);assert.equal(result.state,'REJECTED');assert(!h.writes.some(x=>x.state==='SUCCESS'));h.mark('REAL_SETTLEMENT_DRAINS_PENDING');
 }],
 ['L04',async h=>{
  const d=h.deferred(),hash='0x'+'ab'.repeat(32);h.behavior(()=>d.promise);const result=capture(h.f.rpc.request({method:'eth_sendRawTransaction',params:['0x00']}));await flush();
  await h.clock.advance(120000);await result.done;assert.equal(result.error.code,'F01_WORK_DEADLINE');h.life.seal();const writes=h.writes.length;
  d.resolve(hash);await flush();assert.equal(h.life.submissions[0].hash,hash);assert(h.stderr.some(x=>x.kind==='late-submission-hash'&&x.hash===hash&&x.recordingSealed));assert.equal(h.writes.length,writes);assert.equal(h.life.pending.size,0);
  const blocked=capture(h.f.rpc.request({method:'eth_sendRawTransaction',params:['0x00']}));await blocked.done;assert.equal(blocked.state,'REJECTED');assert.equal(h.calls.length,1);h.mark('LATE_HASH_RETAINED_WITHOUT_LATE_WRITE_OR_RESEND');
 }],
 ['L05',async h=>{
  const rpcError=Object.assign(Error('RPC_PRIMARY'),{code:'RPC_PRIMARY'}),journalError=Error('JOURNAL_SECONDARY'),d=h.deferred();h.behavior(()=>d.promise);
  const result=capture(h.f.rpc.request({method:'eth_call',params:[]}));await flush();h.journalFailure(journalError);d.reject(rpcError);await result.done;
  assert.equal(result.error,rpcError);assert.equal(h.life.primary,rpcError);assert(h.life.failures.some(x=>x.error===journalError));assert(h.stderr.some(x=>x.primary===rpcError));h.mark('PRIMARY_SURVIVES_FAILURE_JOURNAL');
 }],
 ['L06',async h=>{
  h.life.taskSettled=false;const drain=capture(h.life.drain());await h.clock.advance(4999);assert.equal(drain.state,'PENDING');await h.clock.advance(1);await drain.done;
  assert.equal(drain.value,false);assert(h.f.collectionPoisoned);assert.throws(()=>h.life.restore(),/F01_UNCONFIRMED_RESTORE_BLOCKED/);assert.equal(h.f.rpc.request,h.life.guard);h.mark('TASK_ONLY_RESTORE_BLOCKED');
  h.life.taskSettled=true;assert.equal(await h.life.drain(),true);h.life.restore();assert(h.f.collectionPoisoned);h.mark('CONFIRMED_RESTORE_RETAINS_POISON');
 }],
 ['L07',async h=>{
  const d=h.deferred(),late=Error('LATE_REJECTION');const wait=capture(h.life.wait(()=>d.promise));await flush();const drain=capture(h.life.drain());await h.clock.advance(5000);await drain.done;await wait.done;
  assert.equal(drain.value,false);assert.equal(h.life.pending.size,1);assert.throws(()=>h.life.restore(),/F01_UNCONFIRMED_RESTORE_BLOCKED/);h.mark('PENDING_ONLY_RESTORE_BLOCKED');
  d.reject(late);await flush();assert.equal(h.life.pending.size,0);assert.equal(await h.life.drain(),true);h.life.restore();assert(h.f.collectionPoisoned);h.mark('LATE_REJECTION_OBSERVED');
 }],
 ['L08',async h=>{
  const sessionPending=new Set([{}]),reason=Error('SESSION_CANCEL'),seen=[];h.life.session={pending:sessionPending,cancel:e=>seen.push(e)};h.life.cancel(reason);assert.equal(seen[0],reason);
  const drain=capture(h.life.drain());await h.clock.advance(5000);await drain.done;assert.equal(drain.value,false);assert.equal(h.life.pending.size,0);assert.equal(sessionPending.size,1);assert.throws(()=>h.life.restore(),/F01_UNCONFIRMED_RESTORE_BLOCKED/);
  sessionPending.clear();assert.equal(await h.life.drain(),true);h.mark('SESSION_PENDING_AND_CANCEL_FORWARDING');
 }],
 ['L09',async h=>{
  const primary=Error('ORIGINAL'),cleanup=Error('CLEANUP');h.life.fail('operation',primary);let calls=0;
  assert.equal(await h.life.cleanup(async()=>{calls++;throw cleanup;}),true);assert.equal(calls,1);assert.equal(h.life.primary,primary);assert(!h.life.cleanupSucceeded);assert(h.life.failures.some(x=>x.kind==='cleanup'&&x.error===cleanup));h.mark('CLEANUP_FAILURE_PRESERVES_PRIMARY');
 }],
 ['L10',async h=>{
  const d=h.deferred(),late=Error('LATE_CLEANUP');const cleanup=capture(h.life.cleanup(()=>d.promise));await flush();await h.clock.advance(5000);await cleanup.done;
  assert.equal(cleanup.value,false);assert(!h.life.cleanupSucceeded);assert.equal(h.life.primary.code,'F01_CLEANUP_UNCONFIRMED');const first=h.life.primary;h.mark('CLEANUP_TIMEOUT_UNCONFIRMED');
  d.reject(late);await flush();assert(h.life.cleanupSettled);assert(!h.life.cleanupSucceeded);assert.equal(h.life.primary,first);assert(h.life.failures.some(x=>x.kind==='cleanup-late-or-current'&&x.error===late));h.mark('LATE_CLEANUP_FAILURE_PRESERVED');
 }],
 ['L11',async h=>{
  h.clock.jump(139999);h.life.record({kind:'last-allowed'});const writes=h.writes.length;h.clock.jump(1);assert.throws(()=>h.life.record({kind:'too-late'}),/F01_RECORD_DEADLINE/);assert.equal(h.writes.length,writes);
  const first=h.life.primary;h.life.seal();assert.throws(()=>h.life.record({kind:'sealed'}),/F01_RECORDING_SEALED/);assert.equal(h.life.primary,first);assert.equal(h.writes.length,writes);h.mark('RECORD_BOUNDARY_AND_SEAL');
 }],
 ['L12',async h=>{
  assert.equal(await h.life.drain(),true);const foreign=()=>{throw Error('FOREIGN');};h.f.rpc.request=foreign;assert.throws(()=>h.life.restore(),/F01_GUARD_CHANGED/);assert.equal(h.f.rpc.request,foreign);
  h.f.rpc.request=h.life.guard;h.life.restore();assert.equal(h.f.rpc.request,h.original);h.mark('GUARD_OWNERSHIP_REQUIRED');
 }]
];
const flags={amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
const report={state:'FAIL',required:[],actual:[],unique:[],notRun:[],cases:[],unhandled:[],recordingErrors:[],...flags};let primary;
const unhandled=error=>report.unhandled.push(errorRecord(error));process.on('unhandledRejection',unhandled);
function save(name,value){try{record(root,out,name,value);}catch(error){report.recordingErrors.push({file:name,error:errorRecord(error)});throw error;}}
try{
 const plan=JSON.parse(fs.readFileSync(checkedFile(root,'funding-lifetime-plan.json')));report.required=plan.cases.map(x=>x.id);assert.deepEqual(implementations.map(x=>x[0]),report.required);
 for(const [id,run]of implementations){
  const spec=plan.cases.find(x=>x.id===id),h=harness(),item={id,title:spec.title,state:'FAIL',checkpoints:[],cleanup:'NOT_RUN'};let failure;
  report.actual.push(id);
  try{await run(h);assert.deepEqual(h.checkpoints.map(x=>x.name),spec.requiredCheckpoints);}
  catch(error){failure=error;item.error=errorRecord(error);}
  finally{item.checkpoints=h.checkpoints;try{await h.dispose();item.cleanup='COMPLETE';item.afterCleanup=h.snapshot();}catch(error){item.cleanup='FAIL';item.cleanupError=errorRecord(error);failure??=error;}}
  await new Promise(resolve=>setImmediate(resolve));if(report.unhandled.length)failure??=Error('UNHANDLED_REJECTION');
  if(!failure)item.state='PASS';report.cases.push(item);save(id+'.json',item);if(failure)throw failure;
 }
 report.unique=[...new Set(report.actual)];assert.deepEqual(report.unique,report.required);assert.deepEqual(report.unhandled,[]);report.state='PASS';
}catch(error){primary=error;report.primary=errorRecord(error);process.exitCode=1;}
finally{
 process.removeListener('unhandledRejection',unhandled);report.unique=[...new Set(report.actual)];report.notRun=report.required.filter(x=>!report.actual.includes(x));
 try{save('cases.json',report);}catch{process.exitCode=1;}
 if(primary||report.recordingErrors.length)try{fs.writeSync(2,JSON.stringify({primary:errorRecord(primary),report})+'\n');}catch{}
}
