// One stored-data child. Shared evidence assessment is definition-only on import.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict'),io=require('./test/stored-tamper-io.cjs');
const root=__dirname,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// Decode evidence data only: no Error construction, getters, verifier or provider calls.
function decodeEvidence(record){
 const ids=new Map();
 function visit(v){
  if(v===null||typeof v!=='object')return v;
  if(Object.hasOwn(v,'$ref')){assert.deepEqual(Object.keys(v),['$ref']);assert(ids.has(v.$ref),'W09_LINK_GRAPH_REF');return ids.get(v.$ref);}
  if(v.$type==='bigint'){assert(typeof v.decimal==='string'&&/^-?(0|[1-9]\d*)$/.test(v.decimal)&&v.decimal!=='-0');return BigInt(v.decimal);}
  if(v.$type==='undefined')return undefined;
  assert(['object','array','error'].includes(v.$type),'W09_LINK_GRAPH_TYPE');assert(Number.isSafeInteger(v.$id)&&v.$id>0&&!ids.has(v.$id));
  const out=v.$type==='array'?[]:Object.create(null);ids.set(v.$id,out);assert(v.properties&&typeof v.properties==='object');
  for(const [key,value]of Object.entries(v.properties)){assert(!['__proto__','prototype','constructor'].includes(key));Object.defineProperty(out,key,{value:visit(value),writable:true,enumerable:key!=='length',configurable:key!=='length'});}return out;
 }
 return visit(record);
}
// Independent mutation recipe, from original input bytes and fixed plan kind, not case claims.
function expectedMutation(item,inputBytes,abiBytes,partialLimit){
 const partial=partialLimit!==undefined,stop={};if(partial&&partialLimit===0)return {operations:[]};
 const evidence=require('./test/failure-evidence.cjs'),{ethers}=require('ethers'),fresh=i=>decodeEvidence(JSON.parse(inputBytes[i])),original=[fresh(0),fresh(1)],docs=[fresh(0),fresh(1)],operations=[];
 const replace=(node,key,value,path)=>{assert(Object.hasOwn(node,key));operations.push({path,before:evidence.encode(node[key]),after:evidence.encode(value)});if(partial&&operations.length===partialLimit)throw stop;node[key]=value;};
 try{
 if(item.kind==='reverse'){docs.reverse();operations.push({operation:'swap-pair-order',path:['pair'],before:[0,1],after:[1,0]});}
 else if(item.kind==='duplicate'){docs[1]=fresh(0);operations.push({operation:'replace-pair-input',path:['pair',1],before:1,after:0});}
 else if(item.kind==='boundary'){
  const iface=new ethers.Interface(JSON.parse(abiBytes).contracts.LocalVNextToken.abi);
  for(const sideName of ['before','after']){const side=docs[1][sideName],q=side.queries.find(x=>x.label==='governanceToken');assert(q&&q.method==='balanceOf');const value=original[1][sideName].values.governanceToken+1n;replace(side.values,'governanceToken',value,[1,sideName,'values','governanceToken']);replace(q,'value',value,[1,sideName,'queries','governanceToken','value']);replace(q,'raw',iface.encodeFunctionResult('balanceOf',[value]),[1,sideName,'queries','governanceToken','raw']);}
 }else if(item.kind==='scope'){
  const old=original[1].scope.O,value='0x1111111111111111111111111111111111111111',fixed=JSON.parse(abiBytes),names={partial:'LocalFuturesPartialV11',token:'LocalVNextToken',payoutSource:'LocalFuturesPayoutSpecification'};
  replace(docs[1].scope,'O',value,[1,'scope','O']);
  for(const sideName of ['before','after'])for(const label of ['shortLpShares','shortReturn','shortReturnWithdrawal','shortToken','shortAllowance','shortMember']){const q=docs[1][sideName].queries.find(x=>x.label===label);assert(q&&names[q.role]);const args=q.args.map(x=>x===old?value:x);assert(args.some((x,i)=>x!==q.args[i]));const iface=new ethers.Interface(fixed.contracts[names[q.role]].abi);replace(q,'args',args,[1,sideName,'queries',label,'args']);replace(q,'input',iface.encodeFunctionData(q.method,args),[1,sideName,'queries',label,'input']);}
 }else assert.equal(item.kind,'normal');
 }catch(error){if(error!==stop)throw error;}
 // Project already encoded evidence to the persisted JSON representation before strict comparison.
 if(partial){assert.equal(operations.length,partialLimit);assert.deepEqual(operations.map(x=>x.path),item.paths.slice(0,partialLimit));return {operations:JSON.parse(JSON.stringify(operations))};}
 assert.deepEqual(operations.map(x=>x.path),item.paths,'W09_LINK_FIXED_MUTATION_PATHS');assert.equal(operations.length,item.operations);
 return {operations:JSON.parse(JSON.stringify(operations)),mutatedSHA256:docs.map(x=>sha(Buffer.from(evidence.stringify(x))))};
}
function assessW09Link({plan,exists,readBytes,inputHashes,abiSHA256,inputBytes,abiBytes}){
 const errors=[],required=new Set(['runner-summary.json']),cache=new Map();
 const check=(file,fn)=>{try{fn();}catch(error){errors.push({file,error:io.errorRecord(error)});}};
 const load=(file,mandatory)=>{if(mandatory)required.add(file);if(cache.has(file))return cache.get(file);let value;check(file,()=>{if(!exists(file)){assert(!mandatory,'W09_LINK_REQUIRED_FILE');return;}const raw=readBytes(file);assert(Buffer.isBuffer(raw));value=JSON.parse(raw);assert(value&&typeof value==='object'&&!Array.isArray(value),'W09_LINK_JSON_OBJECT');});cache.set(file,value);return value;};
 const summary=load('runner-summary.json',true);let called=false;
 check('runner-summary.json',()=>{assert(summary);assert([0,1].includes(summary.calls));assert(['PASS','FAIL'].includes(summary.state));assert(Array.isArray(summary.recordingErrors));called=summary.calls===1;if(!called){assert.equal(summary.state,'FAIL');assert(summary.error||summary.recordingErrors.length,'W09_LINK_NOT_RUN_UNPROVEN');}});
 // Existing evidence must still be examined if the summary is damaged.
 if(called||exists('exit-code.json')||exists('cases.json')){
  const exit=load('exit-code.json',true),preflight=load('preflight.json',true),invocation=load('invocation.json',true),report=load('cases.json',true),replay=load('original-replay.json',true);
  for(const file of ['stdout.log','stderr.log']){required.add(file);check(file,()=>{assert(exists(file),'W09_LINK_RAW_LOG_MISSING');assert(Buffer.isBuffer(readBytes(file)));});}
  check('exit-code.json',()=>{const terminal=x=>{assert(x&&typeof x==='object');for(const k of ['calls','exitCode','signal','spawnError'])assert(Object.hasOwn(x,k),'W09_LINK_EXIT_FIELD:'+k);assert.equal(x.calls,1);assert(x.exitCode===null||(Number.isSafeInteger(x.exitCode)&&x.exitCode>=0));assert(x.signal===null||typeof x.signal==='string');assert(x.spawnError===null||(typeof x.spawnError==='object'&&x.spawnError.$type==='error'));if(x.signal!==null)assert.equal(x.exitCode,null);if(x.exitCode===null)assert(x.signal!==null||x.spawnError!==null);};terminal(exit);terminal(summary);for(const k of ['calls','exitCode','signal','spawnError'])assert.deepEqual(exit[k],summary[k]);assert.equal(exit.automaticRetry,false);});
  check('invocation.json',()=>{assert.equal(invocation.calls,1);assert.equal(invocation.timeoutMs,plan.childTimeoutMs);assert.equal(invocation.automaticRetry,false);assert.deepEqual(invocation.args,['test/w09-link.mjs']);});
  check('preflight.json',()=>{assert.equal(preflight.abiSHA256,abiSHA256);assert.equal(abiSHA256,plan.abiSHA256);assert.equal(inputHashes.length,2);assert.deepEqual(preflight.inputs.map(x=>x.file),plan.inputs);assert.deepEqual(preflight.inputs.map(x=>x.sha256),inputHashes);});
  check('cases.json',()=>{assert(report);assert(['PASS','FAIL'].includes(report.state));assert.deepEqual(report.required,plan.cases.map(x=>x.id));assert.deepEqual(report.actual,report.cases.map(x=>x.id));assert.deepEqual(report.unique,[...new Set(report.actual)]);assert.equal(report.actual.length,report.unique.length);assert.deepEqual(report.actual,report.required.slice(0,report.actual.length));assert.deepEqual(report.notRun,report.required.filter(x=>!report.actual.includes(x)));assert(Array.isArray(report.recordErrors));});
  check('preflight.json',()=>{assert(Array.isArray(inputBytes)&&inputBytes.length===2,'W09_LINK_SOURCE_BYTES');inputBytes.forEach((b,i)=>{assert(Buffer.isBuffer(b));assert.equal(sha(b),inputHashes[i]);});assert(Buffer.isBuffer(abiBytes));assert.equal(sha(abiBytes),abiSHA256);});
  const encode=require('./test/failure-evidence.cjs').encode;
  for(const item of plan.cases){
   const name=item.id+'.json',reported=Array.isArray(report?.cases)?report.cases.find(x=>x?.id===item.id):undefined,c=load(name,!!reported),mutationName=item.id+'.mutation.json',m=load(mutationName,!!c||!!reported||exists(name));
   check(name,()=>{if(!c){assert(!reported,'W09_LINK_CASE_MISSING');return;}assert(reported,'W09_LINK_CASE_WITHOUT_REPORT');assert.deepEqual(c,reported);assert.equal(c.title,item.title);assert(['PASS','FAIL'].includes(c.state));assert.deepEqual(c.originalSHA256,inputHashes);});
   // These passes are independent of case verdict and of the report/record equality above.
   if(c)check(name,()=>{
    assert(['STARTED','READY'].includes(c.preparation));assert(Array.isArray(c.individual));
    if(item.kind==='normal'){assert.equal(c.rejectionState,'NOT_REACHED');assert.equal(c.targetAssessment,'NOT_REACHED');}
    else{
     assert(['NOT_REACHED','STARTED','ABSENT','THROWN'].includes(c.rejectionState));assert(['NOT_REACHED','NOT_RUN','STARTED','PASS','FAIL'].includes(c.targetAssessment));
     if(['STARTED','PASS','FAIL'].includes(c.targetAssessment)){assert.equal(c.rejectionState,'THROWN');assert(c.actualRejection!==null&&typeof c.actualRejection==='object','W09_LINK_ACTUAL_ERROR_REQUIRED');assert.equal(c.actualRejection.$type,'error');}
     if(c.rejectionState==='THROWN'){assert(c.actualRejection!==null&&typeof c.actualRejection==='object','W09_LINK_ACTUAL_ERROR_REQUIRED');assert.equal(c.actualRejection.$type,'error');const actual=decodeEvidence(c.actualRejection);assert.equal(typeof actual.message,'string','W09_LINK_ACTUAL_MESSAGE');assert.equal(typeof actual.stack,'string','W09_LINK_ACTUAL_STACK');}
     if(c.rejectionState==='ABSENT'){assert.equal(c.state,'FAIL');assert.equal(c.actualRejection,null);assert.equal(c.targetAssessment,'NOT_RUN');assert.equal(c.expectedRejectionMissingError?.$type,'error');assert.equal(decodeEvidence(c.expectedRejectionMissingError).message,'LINK_EXPECTED_REJECTION_ABSENT');assert(!c.observed&&!c.targetMatched,'W09_LINK_ABSENT_REJECTION_CANNOT_MATCH');}
     if(c.targetAssessment==='FAIL'){assert.equal(c.targetValidationError?.$type,'error','W09_LINK_TARGET_FAILURE_MISSING');assert(!c.targetMatched);}
     if(c.targetAssessment==='PASS')assert(c.observed&&c.targetMatched,'W09_LINK_OBSERVED_MISSING');
     if(c.observed){
      assert.equal(c.targetAssessment,'PASS');assert(c.actualRejection!==null&&typeof c.actualRejection==='object','W09_LINK_ACTUAL_ERROR_REQUIRED');assert.equal(c.actualRejection.$type,'error');const actual=decodeEvidence(c.actualRejection),o=c.observed;
      for(const key of ['name','code','message','operator','generatedMessage'])assert.deepEqual(actual[key],o[key],'W09_LINK_ACTUAL_OBSERVED:'+key);
      for(const key of ['actual','expected']){assert(Object.hasOwn(actual,key),'W09_LINK_ACTUAL_OPERAND_MISSING');assert.deepEqual(JSON.parse(JSON.stringify(encode(actual[key]))),o[key],'W09_LINK_ACTUAL_OBSERVED:'+key);}
      assert.equal(typeof actual.stack,'string','W09_LINK_ACTUAL_STACK');const pos=/w09-link\.mjs:(\d+):(\d+)/.exec(actual.stack);assert(pos,'W09_LINK_ACTUAL_LOCATION');assert.equal(Number(pos[1]),o.line);assert.equal(Number(pos[2]),o.column);
      assert.equal(o.name,'AssertionError');assert.equal(o.code,'ERR_ASSERTION');assert.equal(o.generatedMessage,false);assert.equal(o.message.split('\n')[0],item.targetMessage);assert.equal(o.operator,item.operator);assert.equal(o.line,item.line);assert.equal(o.column,item.column);assert(c.operands);assert.deepEqual(o.actual,c.operands.actual);assert.deepEqual(o.expected,c.operands.expected);
     }
    }
    if(c.state==='PASS'){assert.equal(c.preparation,'READY');assert.deepEqual(c.individual.map(x=>x.state),['PASS','PASS']);if(item.kind!=='normal'){assert.equal(c.targetAssessment,'PASS');assert.equal(c.targetMatched,true);}}
   });
   if(m){
    check(mutationName,()=>{assert(c||reported,'W09_LINK_MUTATION_WITHOUT_CASE');assert.equal(m.id,item.id);assert(['STARTED','READY'].includes(m.preparation));assert.deepEqual(m.originalSHA256,inputHashes);assert.deepEqual(m.declaredPaths,item.paths);assert(Array.isArray(m.operations));assert(m.operations.length<=item.operations);assert.deepEqual(m.operations.map(x=>x.path),item.paths.slice(0,m.operations.length),'W09_LINK_PARTIAL_PATHS');});
    check(mutationName,()=>{const expected=expectedMutation(item,inputBytes,abiBytes,m.preparation==='STARTED'?m.operations.length:undefined);assert.deepEqual(m.operations,expected.operations,'W09_LINK_MUTATION_VALUES');if(m.preparation==='READY'){assert.equal(m.operations.length,item.operations);assert.deepEqual(m.mutatedSHA256,expected.mutatedSHA256,'W09_LINK_MUTATED_HASH');}else if(Object.hasOwn(m,'mutatedSHA256'))assert.deepEqual(m.mutatedSHA256,expectedMutation(item,inputBytes,abiBytes).mutatedSHA256,'W09_LINK_PARTIAL_HASH');});
    for(const source of [c,reported].filter(Boolean)){
     for(const key of ['preparation','declaredPaths','operations','originalSHA256'])check(mutationName,()=>assert.deepEqual(m[key],source[key],'W09_LINK_MUTATION_CASE:'+key));
     check(mutationName,()=>{assert.equal(Object.hasOwn(m,'mutatedSHA256'),Object.hasOwn(source,'mutatedSHA256'),'W09_LINK_MUTATED_HASH_PRESENCE');if(Object.hasOwn(m,'mutatedSHA256'))assert.deepEqual(m.mutatedSHA256,source.mutatedSHA256,'W09_LINK_MUTATION_CASE:mutatedSHA256');assert.equal(source.mutationRecord,'RECORDED');});
    }
   }
   if(c?.mutationRecord==='WRITE_FAILED')check(mutationName,()=>{assert(report?.recordErrors.some(x=>x.file===mutationName),'W09_LINK_MUTATION_WRITE_FAILURE_UNRECORDED');});
  }
  check('original-replay.json',()=>{assert(replay);assert(['PASS','FAIL'].includes(replay.state));assert.equal(replay.inputs.length,2);for(let i=0;i<2;i++){const x=replay.inputs[i];assert.equal(x.input,plan.inputs[i]);assert.equal(x.expectedSHA256,inputHashes[i]);assert(['PASS','FAIL'].includes(x.state));if(x.state==='PASS')assert.equal(x.sha256,inputHashes[i]);else assert(x.error);}if(replay.state==='PASS'){assert.equal(replay.abiSHA256,abiSHA256);assert.equal(replay.abiError,null);assert(replay.inputs.every(x=>x.state==='PASS'));assert.equal(replay.pair,'PASS');}else assert(replay.error||replay.abiError||replay.inputs.some(x=>x.state==='FAIL'));assert.equal(report.replay,replay.state);});
  check('runner-summary.json',()=>{assert.equal(summary.calls,1);if(summary.state==='PASS'){assert.equal(summary.exitCode,0);assert.equal(summary.signal,null);assert.equal(summary.spawnError,null);assert.deepEqual(summary.recordingErrors,[]);assert.equal(report.state,'PASS');assert.deepEqual(report.actual,plan.cases.map(x=>x.id));assert(report.cases.every(x=>x.state==='PASS'));assert.deepEqual(report.recordErrors,[]);assert.equal(replay.state,'PASS');}});
 }
 return {state:errors.length?'FAIL':'PASS',errors,required:[...required]};
}
function main(){
 const state={state:'FAIL',calls:0,execution:'NOT_RUN',recordingErrors:[],amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};let ready=false,primary,plan,pins,inputHashes,abiHash;
 const out='results/w09-link';
 const save=(name,value)=>{try{assert(ready,'W09_LINK_OUTPUT_UNVALIDATED');io.record(root,out,name,value);}catch(error){state.recordingErrors.push({file:name,error:io.errorRecord(error)});try{fs.writeSync(2,JSON.stringify({file:name,error:io.errorRecord(error)})+'\n');}catch{}}};
 const integrity=(file,fn)=>{try{fn();}catch(error){state.collection='FAIL';(state.collectionErrors??=[]).push({file,error:io.errorRecord(error)});if(primary===undefined)primary=error;}};
 try{
  assert.equal(process.platform,'linux');assert.equal(process.version,'v22.23.3');assert.equal(process.argv.length,2);assert(!fs.existsSync(path.join(root,out)),'W09_LINK_PRIOR_RESULT');io.createOutput(root,out);ready=true;
  pins=JSON.parse(fs.readFileSync(io.checkedFile(root,'w09-link-pins.json')));const bytes=fs.readFileSync(io.checkedFile(root,'w09-link-plan.json'));assert.equal(sha(bytes),pins.planSHA256);plan=JSON.parse(bytes);
  for(const [file,h]of Object.entries(pins.sourceHashes))assert.equal(sha(fs.readFileSync(io.checkedFile(root,file))),h,'W09_LINK_SOURCE_PIN:'+file);
  assert.deepEqual(plan.cases.map(x=>x.id),['L01','L02','L03','L04','L05']);assert.equal(new Set(plan.cases.map(x=>x.title)).size,5);
  // Same current execution root only. No archived-input fallback or result-folder search.
  const prefix='results/protected-withdrawal/',prior=JSON.parse(fs.readFileSync(io.checkedFile(root,prefix+'runner-summary.json'))),w=JSON.parse(fs.readFileSync(io.checkedFile(root,prefix+'W09/state.json'))),manifest=JSON.parse(fs.readFileSync(io.checkedFile(root,prefix+'artifact/manifest.json')));
  assert.equal(prior.state,'PASS');assert.equal(prior.calls,1);assert.equal(prior.exitCode,0);assert.equal(prior.signal,null);assert.deepEqual(prior.recordingErrors,[]);assert.equal(w.id,'W09');assert.equal(w.state,'PASS');assert.equal(w.validation,'PASS');assert.equal(w.terminationConfirmed,true);assert.equal(w.cleanupSucceeded,true);assert.equal(w.poisoned,false);assert.deepEqual(w.withdrawals.map(x=>[x.document,x.validation]),[['withdrawal-1.json','PASS'],['withdrawal-2.json','PASS']]);assert.equal(manifest.state,'PASS');assert.deepEqual(manifest.errors,[]);
  inputHashes=plan.inputs.map(file=>{assert(file.startsWith(prefix+'W09/'));const b=fs.readFileSync(io.checkedFile(root,file)),rows=manifest.copied.filter(x=>x.path===file.slice(prefix.length));assert.equal(rows.length,1);assert.equal(rows[0].bytes,b.length);assert.equal(rows[0].sha256,sha(b));return sha(b);});abiHash=sha(fs.readFileSync(io.checkedFile(root,'withdrawal-abi.json')));assert.equal(abiHash,plan.abiSHA256);
  save('invocation.json',{calls:1,args:['test/w09-link.mjs'],timeoutMs:plan.childTimeoutMs,automaticRetry:false});assert.equal(state.recordingErrors.length,0);
  state.calls=1;state.execution='EXECUTED';const child=cp.spawnSync(process.execPath,['test/w09-link.mjs'],{cwd:root,encoding:null,timeout:plan.childTimeoutMs,maxBuffer:32*1024*1024,windowsHide:true,env:{...process.env,NODE_OPTIONS:''}});state.exitCode=child.status;state.signal=child.signal;state.spawnError=io.errorRecord(child.error);
  if(child.status!==0||child.signal||child.error)primary=child.error??Object.assign(Error('W09_LINK_EXECUTION_FAILED'),{exitCode:child.status,signal:child.signal});
  for(const [file,b]of [['stdout.log',child.stdout??Buffer.alloc(0)],['stderr.log',child.stderr??Buffer.alloc(0)]])try{io.checkedDirectory(root,out);fs.writeFileSync(path.join(root,out,file),b,{flag:'wx'});}catch(error){state.recordingErrors.push({file,error:io.errorRecord(error)});}
  save('exit-code.json',{calls:1,exitCode:child.status,signal:child.signal,spawnError:io.errorRecord(child.error),automaticRetry:false});
  // Assessor expects the same summary shape that is persisted last, without claiming PASS yet.
  const summary=()=>({...state,recordingErrors:state.recordingErrors});
  const sourceErrors=[],sourceBytes=file=>{try{return fs.readFileSync(io.checkedFile(root,file));}catch(error){sourceErrors.push({file,error:io.errorRecord(error)});if(primary===undefined)primary=error;return null;}};
  const assessed=assessW09Link({plan,inputHashes,abiSHA256:abiHash,inputBytes:plan.inputs.map(sourceBytes),abiBytes:sourceBytes('withdrawal-abi.json'),exists:name=>name==='runner-summary.json'||fs.existsSync(path.join(root,out,name)),readBytes:name=>name==='runner-summary.json'?Buffer.from(JSON.stringify(summary())):fs.readFileSync(io.checkedFile(root,out+'/'+name))});state.collection=sourceErrors.length?'FAIL':assessed.state;state.collectionErrors=[...sourceErrors,...assessed.errors];state.requiredEvidence=assessed.required;
  for(let i=0;i<2;i++)integrity(plan.inputs[i],()=>assert.equal(sha(fs.readFileSync(io.checkedFile(root,plan.inputs[i]))),inputHashes[i],'W09_LINK_ORIGINAL_CHANGED'));
  integrity('withdrawal-abi.json',()=>assert.equal(sha(fs.readFileSync(io.checkedFile(root,'withdrawal-abi.json'))),abiHash));for(const [file,h]of Object.entries(pins.sourceHashes))integrity(file,()=>assert.equal(sha(fs.readFileSync(io.checkedFile(root,file))),h));
  const report=JSON.parse(fs.readFileSync(io.checkedFile(root,out+'/cases.json')));state.required=report.required;state.actual=report.actual;state.unique=report.unique;state.notRun=report.notRun;
  if(primary)throw primary;assert.equal(state.collection,'PASS','W09_LINK_COLLECTION_FAILED');assert.equal(report.state,'PASS');assert.equal(state.recordingErrors.length,0);state.state='PASS';
 }catch(error){if(primary===undefined)primary=error;state.error=io.errorRecord(primary);process.exitCode=1;}
 finally{if(ready)save('runner-summary.json',state);if(primary||state.recordingErrors.length){process.exitCode=1;try{fs.writeSync(2,JSON.stringify({primary:io.errorRecord(primary),recordingErrors:state.recordingErrors})+'\n');}catch{}}}
}
module.exports={assessW09Link};
if(require.main===module)main();
