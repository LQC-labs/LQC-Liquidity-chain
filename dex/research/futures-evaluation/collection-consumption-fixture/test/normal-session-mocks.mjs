// Import the actual session; never imports a fixture, provider or Anvil helper.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {getEventListeners} from 'node:events';
import {fileURLToPath} from 'node:url';
import {NormalEvidenceSession,assertNormalCollectionReady} from './normal-evidence-session.mjs';
import support from './stored-tamper-io.cjs';
const {checkedFile,record,errorRecord}=support;
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.argv[2];
const flush=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function capture(promise){
 const result={state:'PENDING'};
 result.done=promise.then(value=>{result.state='FULFILLED';result.value=value;},error=>{result.state='REJECTED';result.error=error;});
 return result;
}
function rejected(result,code,message){assert.equal(result.state,'REJECTED');assert.equal(result.error.code,code);if(message)assert.equal(result.error.message.split('\n')[0],message);return result.error;}

class Clock {
 time=0;nextId=1;timers=new Map();fired=[];
 now(){return this.time;}
 setTimeout(fn,ms){assert(Number.isFinite(ms)&&ms>=0);const id=this.nextId++;this.timers.set(id,{at:this.time+ms,fn});return id;}
 clearTimeout(id){this.timers.delete(id);}
 jump(ms){assert(ms>=0);this.time+=ms;}
 async advance(ms){
  assert(ms>=0);const target=this.time+ms;let count=0;
  for(;;){
   const next=[...this.timers].filter(([,x])=>x.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];
   if(!next)break;assert(++count<10000,'FAKE_TIMER_PROGRESS_LIMIT');
   const [id,item]=next;this.time=Math.max(this.time,item.at);this.timers.delete(id);this.fired.push({id,at:this.time});item.fn();await flush();
  }
  this.time=target;await flush();
 }
}
function memoryIO(){
 const io={files:new Map(),fds:new Set(),writes:[],stderr:[],nextFd:10,journalFailure:null,saveFailure:null,closeFailure:null};
 io.lstatSync=()=>({isSymbolicLink:()=>false,isDirectory:()=>true});
 io.writeFileSync=(file,bytes,options)=>{assert.equal(options.flag,'wx');if(io.saveFailure)throw io.saveFailure;assert(!io.files.has(file));io.files.set(file,bytes);io.writes.push({kind:'file',file});};
 io.openSync=(file,flag)=>{assert.equal(flag,'wx');assert(!io.files.has(file));io.files.set(file,'');const fd=io.nextFd++;io.fds.add(fd);return fd;};
 io.writeSync=(fd,bytes)=>{
  if(fd===2){io.stderr.push(String(bytes));return Buffer.byteLength(bytes);}
  assert(io.fds.has(fd),'FAKE_FD_REQUIRED');const state=JSON.parse(bytes.toString()).properties.state;io.writes.push({kind:'journal',state});
  if(io.journalFailure&&state==='ERROR')throw io.journalFailure;
  return bytes.length;
 };
 io.closeSync=fd=>{assert(io.fds.has(fd));if(io.closeFailure)throw io.closeFailure;io.fds.delete(fd);};
 return io;
}
function harness(){
 const clock=new Clock(),io=memoryIO(),calls=[],deferreds=[];let behavior=()=>Promise.resolve('OK');
 const rpc={request:function(request){assert.equal(this,rpc,'ORIGINAL_RPC_THIS');calls.push(request);return behavior(request);}},f={rpc,collectionPoisoned:false},original=rpc.request;
 const session=new NormalEvidenceSession(f,{clock,io,resultDirectory:()=>path.join(root,'memory-only-result')});
 // No full C05 collector task exists in this unit harness; individual scenarios attach a real latch when needed.
 session.settled=true;session.start();
 assert.equal(session.workDeadline-session.started,100000);assert.equal(session.writeDeadline-session.started,140000);
 const h={clock,io,calls,f,original,session,checkpoints:[],setBehavior:fn=>{behavior=fn;}};
 h.deferred=()=>{let yes,no;const d={state:'PENDING',promise:new Promise((resolve,reject)=>{yes=resolve;no=reject;})};d.resolve=value=>{assert.equal(d.state,'PENDING');d.state='FULFILLED';yes(value);};d.reject=error=>{assert.equal(d.state,'PENDING');d.state='REJECTED';no(error);};deferreds.push(d);return d;};
 h.task=d=>{session.settled=false;session.task=d.promise;session.task.then(()=>{session.settled=true;},()=>{session.settled=true;});};
 h.listeners=()=>getEventListeners(session.controller.signal,'abort').length;
 h.summary=()=>({now:clock.time,timers:clock.timers.size,abortListeners:h.listeners(),pending:session.pending.size,taskSettled:session.settled,poisoned:f.collectionPoisoned,rpcGuardInstalled:f.rpc.request===session.guard,rpcOriginalRestored:f.rpc.request===original,txState:session.txState,sendCalls:session.sendCalls,rawCalls:calls.length,fakeOpenDescriptors:io.fds.size,primary:errorRecord(session.primary),failures:session.failures.map(x=>({kind:x.kind,error:errorRecord(x.error)})),journalStates:io.writes.filter(x=>x.kind==='journal').map(x=>x.state),observations:session.observations.map(x=>({id:x.id,state:x.state,underlyingTerminationConfirmed:x.underlyingTerminationConfirmed}))});
 h.mark=name=>h.checkpoints.push({name,...h.summary()});
 h.dispose=async()=>{
  session.finishQueries();session.end();
  // Release only this harness's owned deferreds. This is actual settlement, not a claim that abort cancelled them.
  for(const d of deferreds)if(d.state==='PENDING')d.resolve('HARNESS_TEARDOWN');await flush();
  if(f.rpc.request!==original){const restored=capture(session.beforeRestore());await clock.advance(5000);assert.notEqual(restored.state,'PENDING','HARNESS_RESTORE_DID_NOT_SETTLE');await restored.done;assert.equal(restored.state,'FULFILLED');}
  assert.equal(session.settled,true);
  assert.equal(f.rpc.request,original);assert.equal(session.pending.size,0);assert.equal(h.listeners(),0);assert.equal(clock.timers.size,0);
  // A deliberately failed fake close leaves a fake descriptor; cleanup of the harness is separate from the session result.
  io.closeFailure=null;for(const fd of [...io.fds])io.closeSync(fd);assert.equal(io.fds.size,0);
 };
 return h;
}

const implementations=[
 ['N01',async h=>{
  const rpcError=Object.assign(new Error('RPC_PRIMARY'),{code:'RPC_PRIMARY'}),journalError=Object.assign(new Error('JOURNAL_SECONDARY'),{code:'JOURNAL_SECONDARY'});
  h.io.journalFailure=journalError;h.setBehavior(()=>Promise.reject(rpcError));const call=capture(h.session.rpc('eth_call',[]));await call.done;
  assert.equal(call.error,rpcError);assert.equal(h.session.primary,rpcError);assert.equal(h.session.primaryKind,'operation');
  assert.deepEqual(h.session.failures.map(x=>x.kind),['operation','evidence-journal']);assert.equal(h.session.failures[1].error,journalError);assert.equal(h.session.pending.size,0);assert.equal(h.listeners(),0);
  assert.deepEqual(h.io.writes.filter(x=>x.kind==='journal').map(x=>x.state),['REQUESTED','ERROR']);
  h.mark('RPC_ERROR_AND_JOURNAL_ERROR');
 }],
 ['N02',async h=>{
  h.clock.jump(100000);const call=capture(h.session.rpc('eth_call',[]));await call.done;const first=rejected(call,'C05_COLLECTION_DEADLINE');
  assert.equal(h.calls.length,0);assert.equal(h.session.primary,first);assert(h.session.controller.signal.aborted);
  h.clock.jump(39999);h.session.save('within-budget.json',{ok:true});const files=h.io.files.size;h.clock.jump(1);
  assert.throws(()=>h.session.save('past-budget.json',{}),error=>error.code==='ERR_ASSERTION'&&error.message.split('\n')[0]==='C05_EVIDENCE_DEADLINE');
  assert.equal(h.io.files.size,files);assert.equal(h.session.primary,first);assert.equal(h.calls.length,0);
  h.mark('BOTH_DEADLINE_BOUNDARIES');
 }],
 ['N03',async h=>{
  const d=h.deferred();h.setBehavior(()=>d.promise);const call=capture(h.session.rpc('eth_call',[]));await flush();assert.equal(h.calls.length,1);assert.equal(h.session.pending.size,1);assert.equal(h.listeners(),1);
  await h.clock.advance(100000);await call.done;rejected(call,'C05_COLLECTION_DEADLINE');assert.equal(d.state,'PENDING');assert.equal(h.session.pending.size,1);assert.equal(h.listeners(),0);
  assert.equal(call.error,h.session.controller.signal.reason);assert.equal(h.session.primary,call.error);
  const unknown=h.session.observations.find(x=>x.state==='UNKNOWN');assert(unknown);assert.equal(unknown.underlyingTerminationConfirmed,false);
  h.mark('WAIT_REJECTED_UNDERLYING_STILL_PENDING');
  d.resolve('LATE_SUCCESS');assert.equal(h.session.pending.size,1);await flush();assert.equal(h.session.pending.size,0);assert.equal(call.state,'REJECTED');assert(!h.session.observations.some(x=>x.state==='SUCCESS'));
  h.mark('UNDERLYING_FINALLY_SETTLED');
 }],
 ['N04',async h=>{
  const d=h.deferred(),transport=Object.assign(new Error('SEND_RESULT_UNKNOWN'),{code:'SEND_RESULT_UNKNOWN'});h.setBehavior(()=>d.promise);
  const first=capture(h.session.rpc('eth_sendTransaction',[{}]));await flush();assert.equal(h.session.txState,'UNKNOWN');assert.equal(h.calls.length,1);
  const second=capture(h.session.rpc('eth_sendRawTransaction',['0x00']));await second.done;rejected(second,'ERR_ASSERTION','C05_DUPLICATE_SEND_BLOCKED');assert.equal(h.calls.length,1);
  h.mark('SECOND_SEND_BLOCKED_WITH_FIRST_UNKNOWN');
  d.reject(transport);await first.done;assert.equal(first.error,transport);assert.equal(h.session.primary,transport);assert.equal(h.session.txState,'UNKNOWN');assert.equal(h.session.transactionHash,undefined);assert.equal(h.session.pending.size,0);
  h.mark('TRANSPORT_REJECTED_RESULT_REMAINS_UNKNOWN');
 }],
 ['N05',async h=>{
  const task=h.deferred();h.task(task);assert.equal(h.session.pending.size,0);h.f.rpc.request=()=>{throw Error('FOREIGN_RPC_MUST_NOT_RUN');};
  const cleanup=capture(h.session.beforeRestore());await h.clock.advance(4999);assert.equal(cleanup.state,'PENDING');await h.clock.advance(1);assert.equal(cleanup.state,'REJECTED','TASK_CLEANUP_DID_NOT_REJECT');await cleanup.done;
  const error=rejected(cleanup,'C05_TERMINATION_UNCONFIRMED');assert.equal(error.taskSettled,false);assert.equal(error.pending,0);assert.equal(task.state,'PENDING');
  assert.equal(h.session.primary,error);
  assert.equal(h.f.collectionPoisoned,true);assert.equal(h.f.rpc.request,h.session.guard);
  assert.throws(()=>assertNormalCollectionReady(h.f),error=>error.code==='ERR_ASSERTION'&&error.message.split('\n')[0]==='C05_TERMINATION_UNCONFIRMED_BLOCKS_FOLLOWING_TESTS');
  const blocked=capture(h.f.rpc.request({method:'eth_call',params:[]}));await blocked.done;assert.equal(blocked.state,'REJECTED');assert.equal(blocked.error,h.session.controller.signal.reason);assert.equal(h.calls.length,0);
  h.mark('TASK_UNCONFIRMED_GUARD_REINSTALLED');
  task.resolve();assert.equal(h.session.settled,false);await flush();await h.session.beforeRestore();assert.equal(h.f.rpc.request,h.original);assert.equal(h.f.collectionPoisoned,true);
  h.mark('TASK_SETTLED_ORIGINAL_RPC_RESTORED');
 }],
 ['N06',async h=>{
  const d=h.deferred(),late=Object.assign(new Error('LATE_REJECTION'),{code:'LATE_REJECTION'});h.setBehavior(()=>d.promise);const call=capture(h.session.rpc('eth_call',[]));await flush();
  assert.equal(h.session.settled,true);assert.equal(h.session.pending.size,1);const cleanup=capture(h.session.beforeRestore());await h.clock.advance(5000);assert.equal(cleanup.state,'REJECTED','PENDING_CLEANUP_DID_NOT_REJECT');await cleanup.done;
  const first=rejected(cleanup,'C05_TERMINATION_UNCONFIRMED');assert.equal(first.taskSettled,true);assert.equal(first.pending,1);assert.equal(h.session.primary,first);assert.equal(h.session.pending.size,1);assert.equal(h.f.rpc.request,h.session.guard);assert(h.f.collectionPoisoned);
  assert.throws(()=>assertNormalCollectionReady(h.f),error=>error.message.split('\n')[0]==='C05_TERMINATION_UNCONFIRMED_BLOCKS_FOLLOWING_TESTS');await call.done;assert.equal(call.state,'REJECTED');
  h.mark('PENDING_UNCONFIRMED_RESTORE_BLOCKED');
  d.reject(late);assert.equal(h.session.pending.size,1);await flush();assert.equal(h.session.pending.size,0);assert.equal(h.listeners(),0);assert.equal(h.session.primary,first);
  await h.session.beforeRestore();assert.equal(h.f.rpc.request,h.original);assert.equal(h.f.collectionPoisoned,true);h.setBehavior(()=>Promise.resolve('RESTORED'));assert.equal(await h.f.rpc.request({method:'read-after-termination'}),'RESTORED');
  h.mark('LATE_REJECTION_HANDLED_ORIGINAL_RPC_WORKS');
 }],
 ['N07',async h=>{
  assert.equal(await h.session.rpc('eth_call',[]),'OK');assert.equal(h.session.pending.size,0);assert.equal(h.listeners(),0);
  h.session.finishQueries();h.session.end();await h.session.beforeRestore();assert.equal(h.f.rpc.request,h.original);assert.equal(h.clock.timers.size,0);assert.equal(h.io.fds.size,0);assert.equal(h.session.hasPrimary,false);
  const failureCount=h.session.failures.length;await h.clock.advance(200000);assert.equal(h.session.failures.length,failureCount);assertNormalCollectionReady(h.f);
  h.mark('SUCCESS_END_NO_TIMER_OR_LISTENER');
 }],
 ['N08',async h=>{
  const first=Object.assign(new Error('FIRST_OPERATION'),{code:'FIRST_OPERATION'}),save=Object.assign(new Error('SAVE_SECONDARY'),{code:'SAVE_SECONDARY'}),close=Object.assign(new Error('CLOSE_SECONDARY'),{code:'CLOSE_SECONDARY'});
  h.setBehavior(()=>Promise.reject(first));const call=capture(h.session.rpc('eth_call',[]));await call.done;assert.equal(call.error,first);
  h.io.saveFailure=save;assert.throws(()=>h.session.save('failed-save.json',{}),error=>error===save);h.io.closeFailure=close;h.session.end();
  assert.equal(h.session.primary,first);assert.equal(h.clock.timers.size,0);assert.equal(h.listeners(),0);assert.equal(h.session.failures.find(x=>x.kind==='evidence-write:failed-save.json').error,save);assert.equal(h.session.failures.find(x=>x.kind==='journal-close').error,close);
  const task=h.deferred();h.task(task);const cleanup=capture(h.session.beforeRestore());await h.clock.advance(5000);assert.equal(cleanup.state,'REJECTED','FAILED_TASK_CLEANUP_DID_NOT_REJECT');await cleanup.done;rejected(cleanup,'C05_TERMINATION_UNCONFIRMED');assert.equal(h.session.primary,first);assert.equal(h.session.failures[0].error,first);assert.equal(h.clock.timers.size,0);
  h.mark('FIRST_ERROR_SURVIVES_SAVE_CLOSE_AND_CLEANUP');
  task.resolve();await flush();await h.session.beforeRestore();assert.equal(h.f.rpc.request,h.original);
 }]
];

const plan=JSON.parse(fs.readFileSync(checkedFile(root,'normal-session-plan.json'))),unhandled=[];
const result={schema:'LQC_NORMAL_SESSION_MOCKS_1',state:'FAIL',required:plan.cases.map(x=>x.id),actual:[],unique:[],cases:[],unhandled:[],amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
const onUnhandled=error=>unhandled.push(error);let primary;
process.on('unhandledRejection',onUnhandled);
try{
 assert.deepEqual(implementations.map(x=>x[0]),result.required,'SESSION_IMPLEMENTATION_ROSTER');assert.equal(new Set(result.required).size,result.required.length);
 for(const [id,run]of implementations){
  const item={id,title:plan.cases.find(x=>x.id===id).title,state:'RUNNING'},h=harness();result.actual.push(id);result.cases.push(item);let first;
  try{await run(h);await flush();item.observed=h.summary();}catch(error){first=error;item.error=errorRecord(error);item.observed=h.summary();}
  item.checkpoints=h.checkpoints;
  try{await h.dispose();item.cleanup='COMPLETE';item.afterCleanup=h.summary();}catch(error){item.cleanup='FAIL';item.cleanupError=errorRecord(error);first??=error;}
  await new Promise(resolve=>setImmediate(resolve));
  try{assert.equal(unhandled.length,0,'UNHANDLED_REJECTION');}catch(error){item.unhandledError=errorRecord(error);first??=error;}
  item.state=first?'FAIL':'PASS';
  try{record(root,out,id+'.json',item);}catch(recording){try{fs.writeSync(2,JSON.stringify({primary:errorRecord(first),recording:errorRecord(recording),item})+'\n');}catch{}throw first??recording;}
  if(first)throw first;
 }
 result.unique=[...new Set(result.actual)];assert.deepEqual(result.actual,result.required);assert.deepEqual(result.unique,result.required);result.state='PASS';
}catch(error){primary=error;result.error=errorRecord(error);process.exitCode=1;}
finally{
 await flush();await new Promise(resolve=>setImmediate(resolve));process.removeListener('unhandledRejection',onUnhandled);result.unhandled=unhandled.map(errorRecord);
 if(unhandled.length){result.state='FAIL';process.exitCode=1;}result.unique=[...new Set(result.actual)];result.notRun=result.required.filter(x=>!result.actual.includes(x));
 try{record(root,out,'cases.json',result);}catch(recording){process.exitCode=1;try{fs.writeSync(2,JSON.stringify({primary:errorRecord(primary),recording:errorRecord(recording),result})+'\n');}catch{}}
}
