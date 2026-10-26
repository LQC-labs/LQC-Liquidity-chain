import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {AsyncLocalStorage} from 'node:async_hooks';
import evidence from './failure-evidence.cjs';

// Instance-local only. Does not replace fs, global timers, or shared session defaults.
export const F01_BUDGET=Object.freeze({work:120000,termination:5000,evidence:15000,cleanup:5000,terminal:5000,mocha:180000,child:200000,phase:210000});
export class FundingLifetime {
 constructor(note,{clock,writeStderr}={}){
  this.clock=clock??{now:()=>performance.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)};
  this.writeStderr=writeStderr??(value=>process.stderr.write(evidence.stringify(value)));
  this.note=note;this.start=this.clock.now();this.deadline=this.start+F01_BUDGET.work;
  this.controller=new AbortController();this.pending=new Set();this.failures=[];this.observations=[];this.submissions=[];this.hasPrimary=false;this.sealed=false;this.taskSettled=false;this.journalOpen=true;this.recordUntil=this.deadline+F01_BUDGET.termination+F01_BUDGET.evidence;
  this.expectedReverts=new AsyncLocalStorage();
  this.timer=this.clock.setTimeout(()=>this.cancel(Object.assign(Error('F01_WORK_DEADLINE'),{code:'F01_WORK_DEADLINE'})),F01_BUDGET.work);
 }
 fail(kind,error){if(!this.hasPrimary){this.hasPrimary=true;this.primary=error;}this.failures.push({kind,error});this.stderr({primary:this.primary,failures:this.failures});return error;}
 stderr(value){try{this.writeStderr(value);}catch{}}
 cancel(error){if(error)this.fail('work',error);if(!this.controller.signal.aborted)this.controller.abort(error??Error('F01_CLOSED'));if(this.session)this.session.cancel(this.controller.signal.reason);}
 check(){if(this.sealed||this.controller.signal.aborted||this.clock.now()>=this.deadline){if(!this.controller.signal.aborted)this.cancel(Object.assign(Error('F01_WORK_DEADLINE'),{code:'F01_WORK_DEADLINE'}));throw this.controller.signal.reason??Error('F01_CLOSED');}}
 checkRecord(){assert(!this.sealed&&this.journalOpen,'F01_RECORDING_SEALED');assert(this.clock.now()<this.recordUntil,'F01_RECORD_DEADLINE');}
 record(value,priorError){
  try{this.checkRecord();this.observations.push(value);this.note(value);}catch(error){if(priorError!==undefined)this.fail('rpc-before-recording',priorError);this.fail('recording',error);this.stderr({failedRecord:value,primary:this.primary});throw error;}
 }
 async expectRpcRevert({from,to,data,selector},operation,validate){
  this.check();assert(!this.expectedReverts.getStore(),'NESTED_EXPECTED_REVERT');
  for(const address of [from,to])assert(/^0x[0-9a-fA-F]{40}$/.test(address),'EXPECTED_REVERT_ADDRESS');
  assert(/^0x(?:[0-9a-fA-F]{2})+$/.test(data),'EXPECTED_REVERT_CALLDATA');assert(/^0x[0-9a-fA-F]{8}$/.test(selector),'EXPECTED_REVERT_SELECTOR');
  assert.equal(typeof operation,'function');assert.equal(typeof validate,'function');
  const scope={from:from.toLowerCase(),to:to.toLowerCase(),data:data.toLowerCase(),selector:selector.toLowerCase(),active:true,candidates:[]};
  return this.expectedReverts.run(scope,async()=>{
   try{
    await operation();scope.active=false;this.check();if(this.hasPrimary)throw this.primary;
    assert.equal(scope.candidates.length,1,'EXACTLY_ONE_EXPECTED_RPC_REVERT');
    const result=await validate();this.check();if(this.hasPrimary)throw this.primary;
    this.record({kind:'expected-rpc-revert',state:'VERIFIED',from:scope.from,to:scope.to,data:scope.data,selector:scope.selector,error:scope.candidates[0]},scope.candidates[0]);
    return result;
   }catch(error){
    scope.active=false;
    if(scope.candidates.length)this.fail('unverified-rpc-revert',scope.candidates[0]);
    this.fail('expected-revert-validation',error);throw this.primary;
   }finally{scope.active=false;}
  });
 }
 track(operation){
  const promise=Promise.resolve().then(()=>{this.check();return operation();});this.pending.add(promise);
  promise.then(()=>this.pending.delete(promise),()=>this.pending.delete(promise));return promise;
 }
 async wait(operation){
  const promise=this.track(operation);let abort;
  try{return await Promise.race([promise,new Promise((_,reject)=>{abort=()=>reject(this.controller.signal.reason);this.controller.signal.addEventListener('abort',abort,{once:true});if(this.controller.signal.aborted)abort();})]);}
  finally{this.controller.signal.removeEventListener('abort',abort);}
 }
 install(f){
  this.f=f;this.original=f.rpc.request;this.raw=this.original.bind(f.rpc);
  this.guard=async request=>{
   this.check();const item={kind:'setup-rpc',request,state:'REQUESTED'};this.record(item);
   let result;
   try{result=await this.wait(async()=>{
    const value=await this.raw(request);
    if(['eth_sendTransaction','eth_sendRawTransaction'].includes(request.method)&&typeof value==='string'&&/^0x[0-9a-fA-F]{64}$/.test(value)){
     this.submissions.push({request,hash:value}); // Retain even if the following journal write fails.
     if(this.sealed||this.controller.signal.aborted)this.stderr({kind:'late-submission-hash',hash:value,recordingSealed:this.sealed});
    }
    return value;
   });}
   catch(error){
    const scope=this.expectedReverts.getStore(),tx=request.params?.[0];
    const expected=scope?.active&&!this.hasPrimary&&!this.sealed&&!this.controller.signal.aborted&&this.clock.now()<this.deadline&&request.method==='eth_call'&&request.params?.length===2&&request.params[1]==='latest'&&typeof tx?.from==='string'&&tx.from.toLowerCase()===scope.from&&typeof tx?.to==='string'&&tx.to.toLowerCase()===scope.to&&typeof tx?.data==='string'&&tx.data.toLowerCase()===scope.data&&(tx.value===undefined||tx.value==='0x0')&&error instanceof Error&&error.code===3&&/execution reverted/i.test(error.message)&&typeof error.data==='string'&&error.data.toLowerCase()===scope.selector;
    if(expected){
     scope.candidates.push(error);
     if(scope.candidates.length>1){this.fail('repeated-expected-rpc-revert',scope.candidates[0]);this.fail('rpc',error);}
     this.record({kind:'setup-rpc',request,state:'EXPECTED_REVERT_CANDIDATE',error},error);throw error;
    }
    this.fail('rpc',error);try{this.record({kind:'setup-rpc',request,state:'ERROR_OR_UNKNOWN',error});}catch{}throw error;
   }
   this.check();
   // In particular, a returned send hash is journaled before any Receipt polling.
   this.record({kind:'setup-rpc',request,state:'SUCCESS',value:result});return result;
  };
  f.rpc.request=this.guard;
 }
 async drain(){
  this.clock.clearTimeout(this.timer);this.cancel();const until=this.clock.now()+F01_BUDGET.termination;
  while((!this.taskSettled||this.pending.size||this.session?.pending.size)&&this.clock.now()<until)await new Promise(resolve=>this.clock.setTimeout(resolve,20));
  this.terminationConfirmed=this.taskSettled&&this.pending.size===0&&(!this.session||this.session.pending.size===0);
  if(!this.terminationConfirmed){if(this.f)this.f.collectionPoisoned=true;this.fail('termination',Object.assign(Error('F01_TERMINATION_UNCONFIRMED'),{code:'F01_TERMINATION_UNCONFIRMED',taskSettled:this.taskSettled,pending:this.pending.size,sessionPending:this.session?.pending.size??0}));}
  return this.terminationConfirmed;
 }
 restore(){
  assert(this.terminationConfirmed,'F01_UNCONFIRMED_RESTORE_BLOCKED');
  if(this.f){assert(this.f.rpc.request===this.guard,'F01_GUARD_CHANGED');this.f.rpc.request=this.original;}
 }
 seal(){this.sealed=true;this.journalOpen=false;this.clock.clearTimeout(this.timer);}
 async cleanup(operation){
  let timer;const promise=Promise.resolve().then(operation);this.cleanupSettled=false;this.cleanupSucceeded=false;
  promise.then(()=>{this.cleanupSettled=true;},error=>{this.cleanupSettled=true;this.fail('cleanup-late-or-current',error);});
  try{await Promise.race([promise,new Promise((_,reject)=>{timer=this.clock.setTimeout(()=>reject(Object.assign(Error('F01_CLEANUP_UNCONFIRMED'),{code:'F01_CLEANUP_UNCONFIRMED'})),F01_BUDGET.cleanup);})]);this.cleanupSucceeded=true;}
  catch(error){this.fail('cleanup',error);}finally{this.clock.clearTimeout(timer);}
  return this.cleanupSettled;
 }
}
