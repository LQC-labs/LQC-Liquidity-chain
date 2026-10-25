import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import evidence from './failure-evidence.cjs';

// Instance-local only. Does not replace fs, global timers, or shared session defaults.
export const F01_BUDGET=Object.freeze({work:120000,termination:5000,evidence:15000,cleanup:5000,terminal:5000,mocha:180000,child:200000,phase:210000});
export class FundingLifetime {
 constructor(note){
  this.note=note;this.start=performance.now();this.deadline=this.start+F01_BUDGET.work;
  this.controller=new AbortController();this.pending=new Set();this.failures=[];this.observations=[];this.submissions=[];this.hasPrimary=false;this.sealed=false;this.taskSettled=false;this.journalOpen=true;this.recordUntil=this.deadline+F01_BUDGET.termination+F01_BUDGET.evidence;
  this.timer=setTimeout(()=>this.cancel(Object.assign(Error('F01_WORK_DEADLINE'),{code:'F01_WORK_DEADLINE'})),F01_BUDGET.work);
 }
 fail(kind,error){if(!this.hasPrimary){this.hasPrimary=true;this.primary=error;}this.failures.push({kind,error});this.stderr({primary:this.primary,failures:this.failures});return error;}
 stderr(value){try{process.stderr.write(evidence.stringify(value));}catch{}}
 cancel(error){if(error)this.fail('work',error);if(!this.controller.signal.aborted)this.controller.abort(error??Error('F01_CLOSED'));if(this.session)this.session.cancel(this.controller.signal.reason);}
 check(){if(this.sealed||this.controller.signal.aborted||performance.now()>=this.deadline){if(!this.controller.signal.aborted)this.cancel(Object.assign(Error('F01_WORK_DEADLINE'),{code:'F01_WORK_DEADLINE'}));throw this.controller.signal.reason??Error('F01_CLOSED');}}
 checkRecord(){assert(!this.sealed&&this.journalOpen,'F01_RECORDING_SEALED');assert(performance.now()<this.recordUntil,'F01_RECORD_DEADLINE');}
 record(value){
  try{this.checkRecord();this.observations.push(value);this.note(value);}catch(error){this.fail('recording',error);this.stderr({failedRecord:value,primary:this.primary});throw error;}
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
   catch(error){this.fail('rpc',error);try{this.record({kind:'setup-rpc',request,state:'ERROR_OR_UNKNOWN',error});}catch{}throw error;}
   this.check();
   // In particular, a returned send hash is journaled before any Receipt polling.
   this.record({kind:'setup-rpc',request,state:'SUCCESS',value:result});return result;
  };
  f.rpc.request=this.guard;
 }
 async drain(){
  clearTimeout(this.timer);this.cancel();const until=performance.now()+F01_BUDGET.termination;
  while((!this.taskSettled||this.pending.size||this.session?.pending.size)&&performance.now()<until)await new Promise(resolve=>setTimeout(resolve,20));
  this.terminationConfirmed=this.taskSettled&&this.pending.size===0&&(!this.session||this.session.pending.size===0);
  if(!this.terminationConfirmed){if(this.f)this.f.collectionPoisoned=true;this.fail('termination',Object.assign(Error('F01_TERMINATION_UNCONFIRMED'),{code:'F01_TERMINATION_UNCONFIRMED',taskSettled:this.taskSettled,pending:this.pending.size,sessionPending:this.session?.pending.size??0}));}
  return this.terminationConfirmed;
 }
 restore(){
  assert(this.terminationConfirmed,'F01_UNCONFIRMED_RESTORE_BLOCKED');
  if(this.f){assert(this.f.rpc.request===this.guard,'F01_GUARD_CHANGED');this.f.rpc.request=this.original;}
 }
 seal(){this.sealed=true;this.journalOpen=false;clearTimeout(this.timer);}
 async cleanup(operation){
  let timer;const promise=Promise.resolve().then(operation);this.cleanupSettled=false;this.cleanupSucceeded=false;
  promise.then(()=>{this.cleanupSettled=true;},error=>{this.cleanupSettled=true;this.fail('cleanup-late-or-current',error);});
  try{await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('F01_CLEANUP_UNCONFIRMED'),{code:'F01_CLEANUP_UNCONFIRMED'})),F01_BUDGET.cleanup);})]);this.cleanupSucceeded=true;}
  catch(error){this.fail('cleanup',error);}finally{clearTimeout(timer);}
  return this.cleanupSettled;
 }
}
