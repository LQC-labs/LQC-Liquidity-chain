// One stored-data child only; this runner never loads a harness or starts a chain.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict'),io=require('./test/stored-tamper-io.cjs');
const root=__dirname,out='results/withdrawal-tamper',sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// Shared by this runner and external collection. Loading this file does not run main.
function assessTamperEvidence({plan,exists,readBytes,inputHashes,abiSHA256}){
 const errors=[],required=new Set(),cache=new Map(),missing=new Set(),checked=[];
 const problem=(file,error)=>errors.push({file,error:io.errorRecord(error)});
 const check=(file,fn)=>{try{fn();checked.push(file);}catch(error){problem(file,error);}};
 const object=x=>assert(x!==null&&typeof x==='object'&&!Array.isArray(x),'TAMPER_EVIDENCE_OBJECT');
 const digest=x=>assert(typeof x==='string'&&/^[0-9a-f]{64}$/.test(x),'TAMPER_EVIDENCE_HASH');
 function load(file,mandatory=false){
  if(mandatory)required.add(file);
  if(!cache.has(file)){const row={present:false,value:undefined};cache.set(file,row);try{row.present=exists(file);assert.equal(typeof row.present,'boolean');if(row.present){const b=readBytes(file);assert(Buffer.isBuffer(b),'TAMPER_EVIDENCE_BYTES');row.value=JSON.parse(b);object(row.value);}}catch(error){row.value=undefined;problem(file,error);}}
  const row=cache.get(file);if(mandatory&&!row.present&&!missing.has(file)){missing.add(file);problem(file,Error('TAMPER_REQUIRED_EVIDENCE_MISSING'));}return row.value;
 }
 const report=load('cases.json',true),preflight=load('preflight.json',true),replay=load('original-replay.json');
 check('preflight.json',()=>{assert(preflight);assert.equal(inputHashes.length,3);inputHashes.forEach(digest);assert.equal(plan.inputs.length,3);assert.equal(abiSHA256,plan.abiSHA256);assert.equal(preflight.abiSHA256,abiSHA256);assert.deepEqual(preflight.inputs.map(x=>x.path),plan.inputs.map(x=>x.path));assert.deepEqual(preflight.inputs.map(x=>x.sha256),inputHashes);});
 const reported=new Map();
 check('cases.json',()=>{assert(report);assert(['PASS','FAIL'].includes(report.state));assert(Array.isArray(report.cases));assert(Array.isArray(report.recordingErrors));assert.deepEqual(report.required,plan.cases.map(x=>x.id));assert.deepEqual(report.actual,report.cases.map(x=>x.id));assert.deepEqual(report.unique,[...new Set(report.actual)]);assert.equal(report.actual.length,report.unique.length);assert.deepEqual(report.actual,plan.cases.slice(0,report.actual.length).map(x=>x.id));assert.deepEqual(report.notRun,plan.cases.map(x=>x.id).filter(id=>!report.actual.includes(id)));});
 for(const c of Array.isArray(report?.cases)?report.cases:[])check('cases.json',()=>{object(c);assert(plan.cases.some(x=>x.id===c.id));assert(!reported.has(c.id),'TAMPER_CASE_DUPLICATE');reported.set(c.id,c);});
 const records=new Map();
 for(const item of plan.cases){
  const name=item.id+'.json',caseReported=reported.get(item.id),c=load(name,caseReported!==undefined);if(c)records.set(item.id,c);
  if(c)check(name,()=>{assert.equal(c.id,item.id);assert.equal(c.title,item.title);assert(['PASS','FAIL'].includes(c.state));assert(['STARTED','READY'].includes(c.preparation));});
  if(c&&caseReported)check(name,()=>assert.deepEqual(c,caseReported,'TAMPER_CASE_REPORT_CONFLICT'));
  else if(c)problem(name,Error('TAMPER_CASE_WITHOUT_REPORT'));
  if(item.input!==undefined)continue;
  const mutationName=item.id+'.mutation.json',basis=c??caseReported;
  const prepared=basis!==undefined&&(Object.hasOwn(basis,'mutations')||Object.hasOwn(basis,'mutationRecord'));
  const m=load(mutationName,prepared);
  if(m){
   check(mutationName,()=>{assert.equal(m.id,item.id);digest(m.originalSHA256);assert.equal(m.originalSHA256,inputHashes[0]);digest(m.mutatedSHA256);assert(Array.isArray(m.operations));assert.equal(m.operations.length,item.operations);assert.deepEqual(m.declaredPaths,m.operations.map(x=>x.path));const paths=new Set();for(const op of m.operations){object(op);assert.equal(op.operation,'replace');assert(Array.isArray(op.path)&&op.path.length>0&&op.path.every(x=>typeof x==='string'));assert(!paths.has(JSON.stringify(op.path)),'TAMPER_MUTATION_PATH_DUPLICATE');paths.add(JSON.stringify(op.path));assert(Object.hasOwn(op,'before')&&Object.hasOwn(op,'after'));}});
   if(!basis)problem(mutationName,Error('TAMPER_MUTATION_WITHOUT_CASE'));
   for(const source of [c,caseReported].filter(Boolean)){
    check(mutationName,()=>assert.deepEqual(m.operations,source.mutations,'TAMPER_MUTATION_OPERATIONS_CONFLICT'));
    check(mutationName,()=>assert.deepEqual(m.declaredPaths,source.declaredPaths,'TAMPER_MUTATION_PATH_CONFLICT'));
    check(mutationName,()=>assert.equal(m.mutatedSHA256,source.mutatedSHA256,'TAMPER_MUTATED_HASH_CONFLICT'));
   }
  }
  if(basis)check(name,()=>{if(basis.mutationRecord==='WRITE_FAILED')assert(report?.recordingErrors.some(x=>x.file===mutationName),'TAMPER_WRITE_FAILURE_WITHOUT_ERROR');if(basis.observed||basis.targetValidationError){assert(basis.actualRejection&&typeof basis.actualRejection==='object','TAMPER_ACTUAL_REJECTION_MISSING');}if(basis.state==='PASS'){assert.equal(basis.preparation,'READY');assert.equal(basis.mutationRecord,'RECORDED');assert(basis.observed);assert.equal(basis.observed.code,'ERR_ASSERTION');assert.equal(basis.observed.operator,item.operator);assert.equal(basis.observed.line,item.line);assert.equal(basis.observed.column,item.column);if(item.targetMessage)assert.equal(basis.observed.message.split('\n')[0],item.targetMessage);assert.deepEqual(basis.observed.actual,basis.operands.actual);assert.deepEqual(basis.observed.expected,basis.operands.expected);}});
 }
 let replayState='UNKNOWN';
 check('cases.json',()=>{assert(report);assert(['NOT_REACHED','STARTED','PASS','FAIL'].includes(report.originalReplay),'TAMPER_REPLAY_STATE');if(report.originalReplay==='NOT_REACHED'){assert.equal(report.state,'FAIL');assert(report.error,'TAMPER_REPLAY_NOT_REACHED_UNPROVEN');assert.deepEqual(report.actual,[]);assert(!cache.get('original-replay.json').present,'TAMPER_UNEXPECTED_REPLAY_FILE');replayState='NOT_REACHED';}else{load('original-replay.json',true);}});
 if(replay){
  check('original-replay.json',()=>{assert(['PASS','FAIL'].includes(replay.state));assert.equal(replay.expectedAbiSHA256,abiSHA256);assert(Object.hasOwn(replay,'abiError'));assert(replay.abiSHA256===null||typeof replay.abiSHA256==='string');if(replay.abiSHA256!==null)digest(replay.abiSHA256);assert.equal(replay.inputs.length,3);assert.deepEqual(replay.inputs.map(x=>x.input),plan.inputs.map(x=>x.path));});
  for(let i=0;i<3;i++)check('original-replay.json',()=>{const entry=replay.inputs[i];object(entry);assert.equal(entry.input,plan.inputs[i].path);assert.equal(entry.expectedSHA256,inputHashes[i]);assert(['PASS','FAIL'].includes(entry.state));assert(entry.sha256===null||typeof entry.sha256==='string');if(entry.sha256!==null)digest(entry.sha256);if(entry.state==='PASS')assert.equal(entry.sha256,inputHashes[i]);else assert(entry.error&&typeof entry.error==='object','TAMPER_REPLAY_FAILURE_WITHOUT_ERROR');});
  check('original-replay.json',()=>{assert(replay.abiError===null||(replay.abiError&&typeof replay.abiError==='object'));if(replay.abiSHA256!==abiSHA256)assert(replay.abiError,'TAMPER_REPLAY_ABI_ERROR_MISSING');const success=replay.inputs.every(x=>x.state==='PASS')&&replay.abiError===null&&replay.abiSHA256===abiSHA256;assert.equal(replay.state,success?'PASS':'FAIL');assert(report,'TAMPER_REPLAY_WITHOUT_REPORT');assert.equal(report.originalReplay,replay.state,'TAMPER_REPLAY_REPORT_CONFLICT');});
 }
 if(replay&&['PASS','FAIL'].includes(report?.originalReplay)&&!errors.some(x=>x.file==='original-replay.json'))replayState=replay.state;
 if(report?.state==='PASS')check('cases.json',()=>{assert.equal(report.cases.length,19);assert(report.cases.every(x=>x.state==='PASS'));assert.equal(report.originalReplay,'PASS');assert.deepEqual(report.recordingErrors,[]);});
 return {state:errors.length?'FAIL':'PASS',errors,required:[...required],report,records,replayState,checked};
}
function main(){
const state={state:'FAIL',execution:'NOT_RUN',calls:0,required:[],actual:[],unique:[],notRun:[],amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'},recordingErrors=[];let ready=false,primary;
function save(name,value){try{io.record(root,out,name,value);}catch(error){recordingErrors.push({file:name,error:io.errorRecord(error)});}}
try{
 assert.equal(process.argv.length,2);assert.equal(process.platform,'linux');assert.equal(process.version,'v22.23.3');assert(!fs.existsSync(path.join(root,out)),'PRIOR_TAMPER_RESULT');io.createOutput(root,out);ready=true;
 const pins=JSON.parse(fs.readFileSync(io.checkedFile(root,'withdrawal-tamper-pins.json'))),planBytes=fs.readFileSync(io.checkedFile(root,'withdrawal-tamper-plan.json')),plan=JSON.parse(planBytes);assert.equal(sha(planBytes),pins.planSHA256);
 const sourceCheck=()=>{for(const [file,h]of Object.entries(pins.sourceHashes))assert.equal(sha(fs.readFileSync(io.checkedFile(root,file))),h,'TAMPER_SOURCE_PIN:'+file);};sourceCheck();
 state.required=plan.cases.map(x=>x.id);state.notRun=state.required.slice();assert.deepEqual(state.required,Array.from({length:19},(_,i)=>'T'+String(i+1).padStart(2,'0')));assert.equal(new Set(plan.cases.map(x=>x.title)).size,19);
 const prefix='results/protected-withdrawal/',prior=JSON.parse(fs.readFileSync(io.checkedFile(root,prefix+'runner-summary.json'))),report=JSON.parse(fs.readFileSync(io.checkedFile(root,prefix+'mocha.json'))),internal=JSON.parse(fs.readFileSync(io.checkedFile(root,prefix+'artifact/manifest.json')));
 assert.equal(prior.state,'PASS');assert.equal(prior.calls,1);assert.equal(prior.exitCode,0);assert.equal(prior.signal,null);assert.deepEqual(prior.recordingErrors,[]);for(const k of ['required','actual','unique'])assert.deepEqual(prior[k],Array.from({length:9},(_,i)=>'W'+String(i+1).padStart(2,'0')));
 assert.equal(report.reporter.state,'COMPLETE');assert.equal(report.stats.passes,9);assert.equal(report.stats.failures,0);assert.equal(report.stats.pending,0);assert.equal(internal.state,'PASS');assert.deepEqual(internal.errors,[]);
 for(const id of ['W01','W09']){const s=JSON.parse(fs.readFileSync(io.checkedFile(root,prefix+id+'/state.json')));assert.equal(s.id,id);assert.equal(s.state,'PASS');assert.equal(s.validation,'PASS');assert.equal(s.terminationConfirmed,true);assert.equal(s.cleanupSettled,true);assert.equal(s.cleanupSucceeded,true);assert.equal(s.poisoned,false);assert.equal(s.withdrawals.length,id==='W01'?1:2);for(const entry of s.withdrawals)assert.equal(entry.validation,'PASS');}
 const inputs=plan.inputs.map(x=>io.checkedFile(root,x.path)),hashes=inputs.map(x=>sha(fs.readFileSync(x))),abiHash=sha(fs.readFileSync(io.checkedFile(root,'withdrawal-abi.json')));assert.equal(abiHash,plan.abiSHA256);
 for(let i=0;i<plan.inputs.length;i++){const rel=plan.inputs[i].path.slice(prefix.length),matches=internal.copied.filter(x=>x.path===rel);assert.equal(matches.length,1,'INPUT_MANIFEST_UNIQUE');const b=fs.readFileSync(inputs[i]);assert.equal(matches[0].bytes,b.length);assert.equal(matches[0].sha256,hashes[i]);}
 save('preflight.json',{required:state.required,titles:plan.cases.map(x=>x.title),inputs:plan.inputs.map((x,i)=>({...x,sha256:hashes[i]})),abiSHA256:abiHash,sourceHashes:pins.sourceHashes,origin:'same fixed result root after W01-W09 PASS; no historical fallback',automaticRetry:false});assert.equal(recordingErrors.length,0);
 save('invocation.json',{calls:1,executable:process.execPath,args:['test/protected-withdrawal-tamper.mjs',...inputs,out],timeoutMs:plan.childTimeoutMs,automaticRetry:false});assert.equal(recordingErrors.length,0);
 state.calls=1;state.execution='EXECUTED';const child=cp.spawnSync(process.execPath,['test/protected-withdrawal-tamper.mjs',...inputs,out],{cwd:root,encoding:null,timeout:plan.childTimeoutMs,maxBuffer:32*1024*1024,windowsHide:true,env:{...process.env,NODE_OPTIONS:''}});
 state.exitCode=child.status;state.signal=child.signal;state.spawnError=io.errorRecord(child.error);if(child.status!==0||child.signal||child.error)primary=child.error??Object.assign(Error('TAMPER_CHILD_FAILED'),{exitCode:child.status,signal:child.signal});
 for(const [name,b]of [['stdout.log',child.stdout??Buffer.alloc(0)],['stderr.log',child.stderr??Buffer.alloc(0)]])try{io.checkedDirectory(root,out);fs.writeFileSync(path.join(root,out,name),b,{flag:'wx'});}catch(error){recordingErrors.push({file:name,error:io.errorRecord(error)});}
 save('exit-code.json',{calls:1,exitCode:child.status,signal:child.signal,spawnError:io.errorRecord(child.error),automaticRetry:false});
 const assessment=assessTamperEvidence({plan,inputHashes:hashes,abiSHA256:abiHash,exists:name=>fs.existsSync(path.join(root,out,name)),readBytes:name=>fs.readFileSync(io.checkedFile(root,out+'/'+name))});
 state.collection=assessment.state;state.collectionErrors=assessment.errors;state.replayEvidence=assessment.replayState;state.requiredEvidence=assessment.required;const result=assessment.report;
 if(result){state.actual=result.actual;state.unique=result.unique;state.notRun=result.notRun;if(result.state==='FAIL'&&primary===undefined)primary=Object.assign(Error('TAMPER_CASE_EXECUTION_FAILED'),{actualError:result.error??null});}
 if(assessment.state==='FAIL'&&primary===undefined)primary=Object.assign(Error('TAMPER_EVIDENCE_COLLECTION_FAILED'),{errors:assessment.errors});
 const integrity=(file,operation)=>{try{operation();}catch(error){state.collectionErrors.push({file,error:io.errorRecord(error)});state.collection='FAIL';if(primary===undefined)primary=error;}};
 for(let i=0;i<inputs.length;i++)integrity(plan.inputs[i].path,()=>assert.equal(sha(fs.readFileSync(inputs[i])),hashes[i],'TAMPER_ORIGINAL_CHANGED'));
 integrity('withdrawal-abi.json',()=>assert.equal(sha(fs.readFileSync(io.checkedFile(root,'withdrawal-abi.json'))),abiHash,'TAMPER_ABI_CHANGED'));
 for(const [file,h]of Object.entries(pins.sourceHashes))integrity(file,()=>assert.equal(sha(fs.readFileSync(io.checkedFile(root,file))),h,'TAMPER_SOURCE_CHANGED'));
 integrity('withdrawal-tamper-plan.json',()=>assert.equal(sha(fs.readFileSync(io.checkedFile(root,'withdrawal-tamper-plan.json'))),pins.planSHA256));
 if(primary)throw primary;assert(result);assert.equal(result.state,'PASS');assert.equal(state.collection,'PASS');assert.equal(recordingErrors.length,0,'TAMPER_RECORDING_FAILURE');state.state='PASS';
}catch(error){if(primary===undefined)primary=error;state.error=io.errorRecord(primary);process.exitCode=1;}
finally{state.recordingErrors=recordingErrors;if(ready)save('runner-summary.json',state);if(primary||recordingErrors.length){process.exitCode=1;try{fs.writeSync(2,JSON.stringify({primary:io.errorRecord(primary),recordingErrors,state})+'\n');}catch{}}}
}
module.exports={assessTamperEvidence};
if(require.main===module)main();
