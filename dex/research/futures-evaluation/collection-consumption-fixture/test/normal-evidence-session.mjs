import fs from 'node:fs';
import path from 'node:path';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
import evidence from './failure-evidence.cjs';

// No transport cancellation claim: the unchanged RPC helper exposes no AbortSignal.
// Abort ends our waits; underlying promises remain tracked until they actually settle.
export class NormalEvidenceSession {
 constructor(f){
  this.f=f;this.started=performance.now();this.workDeadline=this.started+100000;this.writeDeadline=this.started+140000;
  this.controller=new AbortController();this.pending=new Set();this.failures=[];this.observations=[];this.sequence=0;this.files=[];this.hasPrimary=false;
  this.settled=false;this.closed=false;this.pathFailure=null;this.terminal=false;this.txState='NOT_SENT';this.sendCalls=0;
  this.raw=f.rpc.request.bind(f.rpc);this.original=f.rpc.request;
  this.guard=async request=>{
   this.checkWork();const r={method:request.method,params:[...(request.params??[])]};
   // Existing ready() preconditions also observe the chosen pre-execution block.
   if(this.readTag&&['eth_call','eth_getCode','eth_getBalance','eth_getStorageAt'].includes(r.method))r.params[r.method==='eth_getStorageAt'?2:1]=this.readTag;
   const sending=['eth_sendTransaction','eth_sendRawTransaction'].includes(r.method);
   if(sending){assert.equal(++this.sendCalls,1,'C05_DUPLICATE_SEND_BLOCKED');this.txState='UNKNOWN';}
   const value=await this.observe({kind:'rpc',request:r,blockTag:this.readTag??null},()=>this.raw(r));
   if(sending){assert.match(value,/^0x[0-9a-fA-F]{64}$/,'TRANSACTION_HASH_REQUIRED');this.transactionHash=value;this.txState='HASH_RETURNED';}
   return value;
  };
  f.rpc.request=this.guard;
  this.timer=setTimeout(()=>this.cancel(Object.assign(new Error('C05_COLLECTION_DEADLINE'),{code:'C05_COLLECTION_DEADLINE'})),100000);
 }
 fail(kind,error,context){
  // The sentinel also preserves an original throw of undefined or null.
  if(!this.hasPrimary){this.hasPrimary=true;this.primary=error;this.primaryKind=kind;}
  this.failures.push({kind,error,context});this.stderr({primary:this.primary,primaryKind:this.primaryKind,kind,error,context,failures:this.failures});return error;
 }
 stderr(value){try{fs.writeSync(2,evidence.stringify(value));}catch{}}
 cancel(error){if(!this.controller.signal.aborted){if(error)this.fail('deadline',error);this.controller.abort(error??new Error('C05_COLLECTION_CLOSED'));}}
 checkWork(){if(this.closed||this.controller.signal.aborted||performance.now()>=this.workDeadline){if(!this.controller.signal.aborted)this.cancel(Object.assign(new Error('C05_COLLECTION_DEADLINE'),{code:'C05_COLLECTION_DEADLINE'}));throw this.controller.signal.reason??new Error('C05_COLLECTION_CLOSED');}}
 checkWrite(){assert(performance.now()<this.writeDeadline,'C05_EVIDENCE_DEADLINE');assert(!this.pathFailure,'C05_OUTPUT_DISABLED');}
 output(name){
  this.checkWrite();
  try{
   assert(/^[a-z0-9-]+\.(json|jsonl)$/.test(name),'EVIDENCE_FILENAME');
   assert(process.env.LQC_COLLECTION_RESULT_DIR,'RESULT_DIRECTORY_REQUIRED');const root=path.resolve(process.env.LQC_COLLECTION_RESULT_DIR);
   let current=root;while(path.dirname(current)!==current){const info=fs.lstatSync(current);assert(!info.isSymbolicLink()&&info.isDirectory(),'RESULT_PATH_LINK_OR_TYPE');current=path.dirname(current);}
   return path.join(root,name);
  }catch(error){this.pathFailure=error;throw error;}
 }
 save(name,value,typed=true){
  try{const file=this.output(name),bytes=typed?evidence.stringify(value):JSON.stringify(value,null,2)+'\n';this.checkWrite();fs.writeFileSync(file,bytes,{flag:'wx'});this.files.push(name);return {file,bytes};}
  catch(error){this.fail('evidence-write:'+name,error);throw error;}
 }
 append(value){
  try{this.checkWrite();assert(this.journal!==undefined,'JOURNAL_UNAVAILABLE');const bytes=Buffer.from(JSON.stringify(evidence.encode(value))+'\n');this.checkWrite();assert.equal(fs.writeSync(this.journal,bytes),bytes.length,'JOURNAL_SHORT_WRITE');}
  catch(error){this.fail('evidence-journal',error,{entry:value});throw error;}
 }
 start(){
  this.save('normal-consumption-started.json',{caseId:'C05',state:'STARTED',workBudgetMs:100000,writeBudgetMs:140000},false);
  const file=this.output('normal-consumption-queries.jsonl');this.journal=fs.openSync(file,'wx');this.files.push('normal-consumption-queries.jsonl');
 }
 async wait(operation){
  this.checkWork();
  const promise=Promise.resolve().then(()=>{this.checkWork();return operation();});this.pending.add(promise);
  promise.then(()=>this.pending.delete(promise),()=>this.pending.delete(promise));
  let abort;
  try{return await Promise.race([promise,new Promise((_,reject)=>{abort=()=>reject(this.controller.signal.reason);this.controller.signal.addEventListener('abort',abort,{once:true});if(this.controller.signal.aborted)abort();})]);}
  finally{this.controller.signal.removeEventListener('abort',abort);}
 }
 async observe(request,operation){
  this.checkWork();const id=++this.sequence;
  const requested={id,state:'REQUESTED',request};this.observations.push(requested);this.append(requested);
  try{
   const value=await this.wait(operation);this.checkWork();const completed={id,state:'SUCCESS',request,value};this.observations.push(completed);this.append(completed);return value;
  }catch(error){
   // Establish the operation error BEFORE any fallible journal/stderr recording.
   this.fail('operation',error,{id,request});
   // A cancellation result is not proof that its underlying operation terminated.
   const failed={id,state:this.controller.signal.aborted?'UNKNOWN':'ERROR',request,error,underlyingTerminationConfirmed:this.pending.size===0};this.observations.push(failed);
   if(performance.now()<this.writeDeadline){try{this.append(failed);}catch{}}
   throw error;
  }
 }
 async rpc(method,params){return this.f.rpc.request({method,params});}
 finishQueries(){clearTimeout(this.timer);this.closed=true;this.cancel();}
 end(){
  clearTimeout(this.timer);this.closed=true;
  if(this.journal!==undefined){try{fs.closeSync(this.journal);}catch(error){this.fail('journal-close',error);}this.journal=undefined;}
 }
 async beforeRestore(){
  const limit=performance.now()+5000;
  // This waits for the real C05 task and tracked underlying operations, not only a race winner.
  while((!this.settled||this.pending.size)&&performance.now()<limit)await new Promise(resolve=>setTimeout(resolve,20));
  if(!this.settled||this.pending.size){
   this.f.collectionPoisoned=true;this.cancel();
   const error=Object.assign(new Error('C05_TERMINATION_UNCONFIRMED'),{code:'C05_TERMINATION_UNCONFIRMED',taskSettled:this.settled,pending:this.pending.size,failures:this.failures.slice()});this.fail('cleanup-before-restore',error);throw error;
  }
  assert(this.f.rpc.request===this.guard,'RPC_GUARD_CHANGED');this.f.rpc.request=this.original;
 }
}
