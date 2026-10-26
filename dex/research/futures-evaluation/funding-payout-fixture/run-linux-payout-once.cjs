// Linux orchestration only. This file never approves pins or retries a phase.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),cp=require('node:child_process');
const io=require('./test/stored-tamper-io.cjs');
const root=__dirname,out='results/linux-payout-once',stage='results/linux-payout-artifact';
const order=['install','compile','hash','gate','payout'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const encode=io.errorRecord,flags={amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
const exists=relative=>{try{fs.lstatSync(path.join(root,relative));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const bytes=relative=>fs.readFileSync(io.checkedFile(root,relative));
const read=relative=>JSON.parse(bytes(relative));
function stderr(value){try{fs.writeSync(2,JSON.stringify(value)+'\n');}catch{}}
function platform(){assert.equal(process.platform,'linux','LINUX_REQUIRED');assert.equal(process.version,'v22.23.3','NODE_VERSION');assert(!fs.lstatSync(root).isSymbolicLink(),'FIXTURE_ROOT_LINK');assert.equal(fs.realpathSync(root),root,'FIXTURE_REALPATH');}
function integrity(){
 const pins=read('linux-payout-pins.json'),planBytes=bytes('linux-payout-plan.json'),plan=JSON.parse(planBytes);
 assert.equal(sha(planBytes),pins.planSHA256,'LINUX_PAYOUT_PLAN_PIN');
 assert.deepEqual(plan.phases.map(x=>x.id),order,'PHASE_ORDER');
 const payoutPlan=read('payout-plan.json'),requirements=read('build-requirements.json');
 assert.deepEqual(plan.expectedIds,Array.from({length:10},(_,i)=>'P'+String(i+1).padStart(2,'0')),'FIXED_PAYOUT_IDS');
 assert.deepEqual(plan.expectedIds,payoutPlan.expectedIds);assert.deepEqual(plan.expectedTitles,payoutPlan.cases.map(x=>x.fullTitle));
 assert.deepEqual(Object.keys(plan.approvedBuildHashes).sort(),['build/compiler-input.json','build/compiler-output.json','build/manifest.json']);
 assert.deepEqual(plan.dependencyVersions,requirements.dependencyVersions);assert.equal(plan.soljsonSHA256,requirements.compiler.soljsonSHA256);
 for(const [file,hash]of Object.entries(pins.sourceHashes))assert.equal(sha(bytes(file)),hash,'LINUX_PAYOUT_SOURCE_PIN:'+file);
 const repository=path.resolve(root,'../../../..');
 assert.equal(sha(fs.readFileSync(io.checkedFile(repository,'.github/workflows/futures-offline-evaluation.yml'))),pins.workflowSHA256,'WORKFLOW_PIN');
 return {plan,pins};
}
function dependencies(plan){
 io.checkedDirectory(root,'node_modules');assert(!fs.lstatSync(path.join(root,'node_modules')).isSymbolicLink(),'DEPENDENCY_ROOT_LINK');
 for(const [name,version]of Object.entries(plan.dependencyVersions))assert.equal(read('node_modules/'+name+'/package.json').version,version,'DEPENDENCY_VERSION:'+name);
 assert.equal(sha(bytes('node_modules/solc/soljson.js')),plan.soljsonSHA256,'SOLJSON_PIN');
 const platformName=process.arch==='x64'?'anvil-linux-amd64':process.arch==='arm64'?'anvil-linux-arm64':null;
 assert(platformName,'UNSUPPORTED_ARCH');const binary='node_modules/@foundry-rs/'+platformName+'/bin/anvil';
 assert.equal(read('node_modules/@foundry-rs/'+platformName+'/package.json').version,'1.7.1','ANVIL_PLATFORM_VERSION');
 fs.accessSync(io.checkedFile(root,binary),fs.constants.X_OK);
 return {node:process.version,architecture:process.arch,anvilBinary:binary,soljsonSHA256:plan.soljsonSHA256};
}
function typedGraph(document){
 const ids=new Set(),refs=[];
 function visit(v){
  if(v===null||typeof v!=='object')return;
  if(Object.hasOwn(v,'$ref')){assert.deepEqual(Object.keys(v),['$ref']);assert(Number.isSafeInteger(v.$ref));refs.push(v.$ref);return;}
  assert(typeof v.$type==='string','TYPED_GRAPH_RECORD');
  if(['object','array','error'].includes(v.$type)){
   assert(Number.isSafeInteger(v.$id)&&v.$id>0&&!ids.has(v.$id),'TYPED_GRAPH_ID');ids.add(v.$id);assert(v.properties&&typeof v.properties==='object'&&!Array.isArray(v.properties),'TYPED_GRAPH_PROPERTIES');
   for(const value of Object.values(v.properties))visit(value);
   for(const key of ['stackReadFailure','finalization'])if(Object.hasOwn(v,key))visit(v[key]);
  }else if(v.$type==='bigint')assert(typeof v.decimal==='string'&&v.decimal!=='-0'&&/^-?(0|[1-9]\d*)$/.test(v.decimal),'TYPED_BIGINT_DECIMAL');
  else if(v.$type==='undefined')assert.deepEqual(Object.keys(v),['$type']);
  else if(v.$type==='non-string-stack')visit(v.value);
  else assert(['number','symbol','function','accessor','unavailable'].includes(v.$type),'TYPED_GRAPH_TAG');
 }
 visit(document);for(const id of refs)assert(ids.has(id),'TYPED_GRAPH_DANGLING_REF');
 assert.equal(document.$type,'object','TYPED_GRAPH_ROOT');return document.properties;
}
function payload(source,b){
 const caseFile=source.match(/\/(P(?:0[1-9]|10))\/(started|partial|validation|failure|state)\.json$/);
 if(source.endsWith('.jsonl')){const text=b.toString();assert(!text||text.endsWith('\n'),'JOURNAL_PARTIAL_LINE');for(const line of text.split('\n').filter(Boolean))typedGraph(JSON.parse(line));return;}
 if(!source.endsWith('.json'))return;const value=JSON.parse(b);
 if(!caseFile)return;const [,id,kind]=caseFile;
 if(kind==='state'){assert.equal(value.id,id);assert(['PASS','FAIL'].includes(value.state));assert(['NOT_RUN','STARTED','PASS','FAIL'].includes(value.validation));return;}
 const properties=typedGraph(value);assert.equal(properties.id,id,'PAYOUT_PAYLOAD_ID');
 if(kind==='started')assert.equal(properties.state,'STARTED');
 if(kind==='validation'){assert.equal(properties.state,'PASS');assert(Object.hasOwn(properties,'result'));}
 if(kind==='partial')for(const key of ['setup','validation','terminationConfirmed','snapshotObservations','rpcObservations','submissions','primary','failures'])assert(Object.hasOwn(properties,key),'PAYOUT_PARTIAL_FIELD:'+key);
 if(kind==='failure')for(const key of ['primary','failures','terminationConfirmed'])assert(Object.hasOwn(properties,key),'PAYOUT_FAILURE_FIELD:'+key);
}
function runPhase(id){
 let primary,context,dirReady=false,recordingErrors=[];
 const result={id,state:'FAIL',attempts:1,childCalls:0,childExitCode:null,signal:null,automaticRetry:false,...flags};
 const fail=(kind,error)=>{if(primary===undefined)primary=error;(result.errors??=[]).push({kind,error:encode(error)});stderr({primary:encode(primary),errors:result.errors});};
 const record=(name,value)=>{try{io.record(root,out+'/'+id,name,value);return true;}catch(error){recordingErrors.push({file:name,error:encode(error)});fail('recording',error);return false;}};
 try{
  platform();context=integrity();assert(order.includes(id),'UNKNOWN_PHASE');
  if(id==='install'){
   for(const relative of ['node_modules','build',out,'results/long-payout',stage])assert(!exists(relative),'PRIOR_PATH:'+relative);
  }else{
   io.checkedDirectory(root,out);
   for(const predecessor of order.slice(0,order.indexOf(id))){const prior=read(out+'/'+predecessor+'/result.json');assert.equal(prior.id,predecessor);assert.equal(prior.state,'PASS','PREDECESSOR_NOT_PASS:'+predecessor);assert.equal(prior.attempts,1);assert.deepEqual(prior.recordingErrors,[]);}
  }
  assert(!exists(out+'/'+id),'PHASE_ALREADY_ATTEMPTED');io.createOutput(root,out+'/'+id);dirReady=true;
  assert(record('started.json',{id,state:'STARTED',attempts:1,automaticRetry:false,...flags}),'START_RECORD_FAILED');
  const spec=context.plan.phases.find(x=>x.id===id);let command=process.execPath,args;
  if(id==='install'){command='npm';args=['ci','--ignore-scripts','--no-audit','--no-fund','--include=dev','--include=optional','--fetch-retries=0'];}
  else if(id==='compile'){dependencies(context.plan);assert(!exists('build'),'BUILD_DIRECTORY_EXISTS');args=['compile.cjs'];}
  else if(id==='gate')args=['-e',"require('./build-common.cjs').validateBuild(process.cwd())"];
  else if(id==='payout'){assert(!exists('results/long-payout'),'PRIOR_PAYOUT_RESULTS');args=['run-payout.cjs'];}
  if(id==='hash'){
   const actual={};for(const [file,expected]of Object.entries(context.plan.approvedBuildHashes)){actual[file]=sha(bytes(file));}
   result.buildHashes=actual;assert.deepEqual(actual,context.plan.approvedBuildHashes,'APPROVED_FULL_BUILD_BYTES');
   for(const name of ['stdout.log','stderr.log']){io.checkedDirectory(root,out+'/'+id);fs.writeFileSync(path.join(root,out,id,name),'',{flag:'wx'});}
  }else{
   // Open each raw log independently; a recording failure prevents execution.
   const descriptors=[];for(const name of ['stdout.log','stderr.log'])try{io.checkedDirectory(root,out+'/'+id);descriptors.push(fs.openSync(path.join(root,out,id,name),'wx'));}catch(error){descriptors.push(undefined);fail('raw-log-open:'+name,error);}
   if(descriptors.some(x=>x===undefined)){for(const fd of descriptors)if(fd!==undefined)try{fs.closeSync(fd);}catch(error){fail('log-close',error);}throw primary;}
   try{
    assert(record('invocation.json',{id,command,args,calls:1,timeoutMs:spec.childTimeoutMs,automaticRetry:false}),'INVOCATION_RECORD_FAILED');result.childCalls=1;
    const child=cp.spawnSync(command,args,{cwd:root,stdio:['ignore',...descriptors],windowsHide:true,timeout:spec.childTimeoutMs,env:{...process.env,NODE_OPTIONS:''}});
    result.childExitCode=child.status;result.signal=child.signal;result.spawnError=encode(child.error);
    if(child.error)throw child.error;
    assert.equal(child.signal,null,'PHASE_SIGNAL:'+id);assert.equal(child.status,0,'PHASE_CHILD_EXIT:'+id);
   }catch(error){fail('child-execution',error);throw error;}
   finally{for(const fd of descriptors)try{fs.closeSync(fd);}catch(error){fail('log-close',error);}}
  }
  if(id==='install')result.dependencies=dependencies(context.plan);
  if(id==='payout'){
   const runner=read('results/long-payout/runner-summary.json'),artifacts=read('results/long-payout/artifact-summary.json');
   assert.equal(runner.state,'PASS','PAYOUT_RUNNER_FAIL');assert.equal(runner.calls,1);assert.equal(artifacts.state,'PASS','PAYOUT_INTERNAL_COLLECTION_FAIL');result.internalCollection=artifacts;
  }
  integrity();if(primary!==undefined)throw primary;result.state='PASS';
 }catch(error){fail('execution',error);}
 finally{
  result.primary=encode(primary);result.recordingErrors=recordingErrors;
  if(primary!==undefined||recordingErrors.length)result.state='FAIL';
  if(dirReady){
   record('exit-code.json',{id,phaseExitCode:result.state==='PASS'?0:1,childCalls:result.childCalls,childExitCode:result.childExitCode,signal:result.signal,spawnError:result.spawnError??null});
   if(primary!==undefined||recordingErrors.length){result.state='FAIL';result.primary=encode(primary);}
   record('result.json',result);
  }
  if(primary!==undefined||recordingErrors.length){process.exitCode=1;stderr({id,primary:encode(primary),recordingErrors,result});}
 }
}
function collect(){
 let ready=false;const errors=[],copied=[],omissions=[],required=new Set(),states=Object.fromEntries(order.map(id=>[id,'UNKNOWN']));
 const result={collection:'FAIL',execution:'UNKNOWN',overall:'FAIL',phases:states,errors,omissions,copied,automaticRetry:false,...flags};
 const error=(file,e,kind='collection')=>{errors.push({file,kind,error:encode(e)});stderr({file,kind,error:encode(e)});};
 const selected=new Map();
 function select(source,destination,mandatory=true){
  assert(!destination.split('/').some(x=>['node_modules','.git','prepared'].includes(x)),'ARTIFACT_FORBIDDEN_COMPONENT');
  assert(!selected.has(destination),'ARTIFACT_DUPLICATE_DESTINATION');selected.set(destination,{source,destination,mandatory});if(mandatory)required.add(destination);
 }
 function jsonFile(relative){try{return read(relative);}catch(e){error(relative,e,'missing-or-invalid-json');return null;}}
 try{
  platform();assert(!exists(stage),'PRIOR_ARTIFACT_STAGE');io.createOutput(root,stage);ready=true;const {plan,pins}=integrity();
  let priorFailure=false;const records={};
  for(const id of order){
   const base=out+'/'+id;
   if(!exists(base)){
    if(priorFailure){states[id]='NOT_RUN';omissions.push({path:base,state:'NOT_RUN',reason:'No phase directory; valid prior phase result FAIL prevents workflow continuation'});}
    else error(base,Error('PHASE_ABSENCE_NOT_PROVEN_NOT_RUN'));
    continue;
   }
   for(const name of ['started.json','exit-code.json','result.json'])select(base+'/'+name,'orchestration/'+id+'/'+name);
   const started=jsonFile(base+'/started.json'),record=jsonFile(base+'/result.json'),exit=jsonFile(base+'/exit-code.json');
   if(record)records[id]=record;
   try{
    assert(started&&record&&exit,'PHASE_RECORDS_MISSING');assert.equal(started.id,id);assert.equal(started.attempts,1);assert.equal(record.id,id);assert.equal(record.attempts,1);assert.equal(exit.id,id);assert(['PASS','FAIL'].includes(record.state));assert([0,1].includes(record.childCalls));assert.equal(exit.childCalls,record.childCalls);assert.equal(exit.childExitCode,record.childExitCode);assert.equal(exit.signal,record.signal);assert.equal(exit.phaseExitCode,record.state==='PASS'?0:1,'PHASE_EXIT_CONFLICT');assert(!priorFailure,'PHASE_EXECUTED_AFTER_FAILURE');
    if(record.state==='PASS'){assert.deepEqual(record.recordingErrors,[]);if(id==='hash'){assert.equal(record.childCalls,0);assert.deepEqual(record.buildHashes,plan.approvedBuildHashes);}else{assert.equal(record.childCalls,1);assert.equal(record.childExitCode,0);assert.equal(record.signal,null);}}
    states[id]=record.state;if(record.state==='FAIL')priorFailure=true;
   }catch(e){error(base,e,'state-conflict');}
   for(const name of ['stdout.log','stderr.log']){const file=base+'/'+name;if(record?.childCalls===1||record?.state==='PASS')select(file,'orchestration/'+id+'/'+name);else if(exists(file))select(file,'orchestration/'+id+'/'+name,false);else omissions.push({path:file,state:states[id],reason:'Phase failed before a child or internal hash result; missing raw log is not success evidence'});}
   if(record?.childCalls===1||exists(base+'/invocation.json')){select(base+'/invocation.json','orchestration/'+id+'/invocation.json');const invocation=jsonFile(base+'/invocation.json');if(invocation)try{assert.equal(invocation.id,id);assert.equal(invocation.calls,1);}catch(e){error(base+'/invocation.json',e);}}
  }
  for(const [file,approved]of Object.entries(plan.approvedBuildHashes)){
   const mandatory=states.compile==='PASS'||states.hash==='PASS'||states.gate==='PASS'||states.payout==='PASS';
   if(mandatory||exists(file)){select(file,file,mandatory);if(mandatory)jsonFile(file);if(states.hash==='PASS')try{assert.equal(sha(bytes(file)),approved,'ARTIFACT_APPROVED_BUILD_HASH');}catch(e){error(file,e);}}
   else omissions.push({path:file,state:states.compile,reason:'Build did not complete; retain existing partial files without generating replacements'});
  }
  if(records.payout?.childCalls===1){
   const original='results/long-payout',internal=original+'/artifact';
   const payoutPlan=read('payout-plan.json'),payoutPins=read('payout-pins.json'),allowed=new Set([...payoutPlan.artifacts.runner,...payoutPlan.artifacts.child]);
   for(const item of payoutPlan.cases)for(const name of [...payoutPlan.artifacts.attempted,'validation.json','failure.json'])allowed.add(item.id+'/'+name);
   for(const file of [...Object.keys(payoutPins.sourceHashes),'payout-plan.json','payout-pins.json'])allowed.add('sources/'+file);
   for(const file of payoutPlan.artifacts.build)allowed.add(file);
   select(original+'/runner-summary.json','payout/runner-summary.json');select(original+'/artifact-summary.json','payout/artifact-summary.json');select(internal+'/manifest.json','payout/internal-manifest.json');
   const runner=jsonFile(original+'/runner-summary.json'),summary=jsonFile(original+'/artifact-summary.json'),inventory=jsonFile(internal+'/manifest.json');
   try{
    assert(runner&&summary&&inventory,'INTERNAL_COLLECTION_RECORDS_MISSING');assert.equal(summary.collection,'PASS','INTERNAL_COLLECTION_FAILED');assert.equal(inventory.state,'PASS');assert.deepEqual(inventory.errors,[]);assert.equal(summary.runner,runner.state);assert.equal(summary.state,runner.state==='PASS'?'PASS':'FAIL','INTERNAL_SUMMARY_CONFLICT');
    if(records.payout.state==='PASS'){assert.equal(runner.calls,1);assert.deepEqual(runner.required,payoutPlan.expectedIds);assert.deepEqual(runner.actual,payoutPlan.expectedIds);assert.deepEqual(runner.unique,payoutPlan.expectedIds);assert.deepEqual(runner.notRun,[]);assert.equal(runner.exitCode,0);assert.deepEqual(runner.recordingErrors,[]);}
   }catch(e){error(internal,e,'internal-collection-or-execution');}
   // Never rerun the existing internal collector. Preserve its FAIL/UNKNOWN.
   if(inventory){
    const seen=new Set();for(const row of inventory.copied??[])try{assert(allowed.has(row.path),'UNLISTED_INTERNAL_ARTIFACT');assert(!seen.has(row.path),'DUPLICATE_INTERNAL_ARTIFACT');seen.add(row.path);const actual=bytes(internal+'/'+row.path);assert.equal(actual.length,row.bytes);assert.equal(sha(actual),row.sha256);select(internal+'/'+row.path,'payout/internal/'+row.path);}catch(e){error(internal+'/'+row.path,e);}
    for(const requiredFile of inventory.required??[])try{assert(allowed.has(requiredFile),'INVALID_INTERNAL_REQUIRED_PATH');assert(seen.has(requiredFile),'MISSING_INTERNAL_REQUIRED_FILE');}catch(e){error(internal+'/'+requiredFile,e);}
    const mandatory=[...payoutPlan.artifacts.runner,...payoutPlan.artifacts.build,...Object.keys(payoutPins.sourceHashes).map(x=>'sources/'+x),'sources/payout-plan.json','sources/payout-pins.json'];
    if(runner?.calls===1)mandatory.push(...payoutPlan.artifacts.child);
    for(const item of payoutPlan.cases){
     const state=inventory.states?.[item.id];
     if(state==='PASS'||state==='FAIL'){
      mandatory.push(...payoutPlan.artifacts.attempted.map(x=>item.id+'/'+x));
      if(state==='PASS')mandatory.push(item.id+'/validation.json');
      else{mandatory.push(item.id+'/failure.json');const terminal=jsonFile(original+'/'+item.id+'/state.json');if(terminal?.validation==='PASS')mandatory.push(item.id+'/validation.json');}
     }else if(state!=='NOT_RUN')error(internal+'/'+item.id,Error('INTERNAL_CASE_STATE_UNKNOWN'));
     if(runner?.state==='PASS'&&state!=='PASS')error(internal+'/'+item.id,Error('INTERNAL_PASS_CASE_CONFLICT'));
    }
    for(const file of mandatory)if(!seen.has(file))error(internal+'/'+file,Error('INTERNAL_MANDATORY_SNAPSHOT_OR_EVIDENCE_MISSING'));
   }
   // Preserve raw partial evidence even if internal staging stopped before its manifest.
   for(const name of [...payoutPlan.artifacts.runner,...payoutPlan.artifacts.child,'artifact-summary.json'])if(exists(original+'/'+name))select(original+'/'+name,'payout/raw/'+name,false);
   for(const item of payoutPlan.cases)for(const name of [...payoutPlan.artifacts.attempted,'validation.json','failure.json'])if(exists(original+'/'+item.id+'/'+name))select(original+'/'+item.id+'/'+name,'payout/raw/'+item.id+'/'+name,false);
  }else if(states.payout==='NOT_RUN')omissions.push({path:'results/long-payout',state:'NOT_RUN',reason:'Valid predecessor failure prevented payout phase'});
  else if(states.payout!=='PASS')error('results/long-payout',Error('PAYOUT_EXECUTION_NOT_PROVEN'));
  for(const file of [...Object.keys(pins.sourceHashes),'linux-payout-plan.json','linux-payout-pins.json'])select(file,'sources/'+(file==='.gitignore'?'fixture-gitignore.txt':file));
  for(const file of ['.github/workflows/futures-offline-evaluation.yml']){
   const repository=path.resolve(root,'../../../..'),b=fs.readFileSync(io.checkedFile(repository,file));assert.equal(sha(b),pins.workflowSHA256);required.add('workflow.yml');io.checkedDirectory(root,stage);fs.writeFileSync(path.join(root,stage,'workflow.yml'),b,{flag:'wx'});copied.push({path:'workflow.yml',source:file,bytes:b.length,sha256:sha(b)});
  }
  // Include only compile result files whose approved fixed name shape is present.
  const compileResults=exists('results')?fs.readdirSync(io.checkedDirectory(root,'results')).filter(name=>/^compile-result-[0-9]+\.json$/.test(name)):[];
  if(states.compile==='PASS'&&compileResults.length!==1)error('results',Error('EXACTLY_ONE_SUCCESSFUL_COMPILE_RESULT_REQUIRED'));
  for(const name of compileResults){select('results/'+name,'compile/'+name,states.compile==='PASS');if(states.compile==='PASS'){const r=jsonFile('results/'+name);if(r)try{assert.deepEqual(r.errors,[]);}catch(e){error('results/'+name,e);}}}
  for(const {source,destination,mandatory}of selected.values())try{
   if(!exists(source)&&!mandatory){omissions.push({path:source,reason:'Optional partial evidence not generated'});continue;}
   const b=bytes(source),parent=path.posix.dirname(stage+'/'+destination);
   // Preserve corrupt bytes as evidence while making collection fail.
   try{payload(source,b);}catch(e){error(source,e,'payload-json-or-envelope-corruption');}
   io.createOutput(root,parent);io.checkedDirectory(root,parent);fs.writeFileSync(path.join(root,stage,destination),b,{flag:'wx'});assert.equal(sha(bytes(stage+'/'+destination)),sha(b));copied.push({source,path:destination,bytes:b.length,sha256:sha(b)});
  }catch(e){error(source,e,'required-or-present-file-copy');}
  integrity();result.execution=order.every(id=>states[id]==='PASS')?'PASS':order.some(id=>states[id]==='FAIL')?'FAIL':'UNKNOWN';result.collection=errors.length?'FAIL':'PASS';result.overall=result.execution==='PASS'&&result.collection==='PASS'?'PASS':'FAIL';
 }catch(e){
  error(stage,e);
  // A corrupt pin/plan must not prevent preserving already-existing raw evidence.
  // No fallback is treated as a valid plan, a successful stage or a pin approval.
  if(ready){
   const partial=[];
   for(const id of order)for(const name of ['started.json','invocation.json','stdout.log','stderr.log','exit-code.json','result.json'])partial.push(out+'/'+id+'/'+name);
   for(const name of ['compiler-input.json','compiler-output.json','manifest.json'])partial.push('build/'+name);
   for(const name of ['preflight.json','runner-summary.json','artifact-summary.json','stdout.log','stderr.log','exit-code.json','mocha.json'])partial.push('results/long-payout/'+name);
   for(let i=1;i<=10;i++)for(const name of ['started.json','queries.jsonl','partial.json','state.json','validation.json','failure.json'])partial.push('results/long-payout/P'+String(i).padStart(2,'0')+'/'+name);
   for(const name of ['payout-plan.json','payout-pins.json','linux-payout-plan.json','linux-payout-pins.json'])partial.push(name);
   for(const source of partial)try{
    if(!exists(source)){omissions.push({path:source,state:'UNKNOWN',reason:'Not present during failed-collection salvage; no NOT_RUN claim'});continue;}
    const b=bytes(source),destination='partial/'+source;io.createOutput(root,path.posix.dirname(stage+'/'+destination));io.checkedDirectory(root,path.posix.dirname(stage+'/'+destination));fs.writeFileSync(path.join(root,stage,destination),b,{flag:'wx'});assert.equal(sha(bytes(stage+'/'+destination)),sha(b));copied.push({path:destination,source,bytes:b.length,sha256:sha(b),meaning:'UNVERIFIED_PARTIAL_EVIDENCE'});
   }catch(partialError){error(source,partialError,'partial-copy');}
  }
 }
 finally{
  result.required=[...required];if(ready)try{io.record(root,stage,'manifest.json',result);}catch(e){error(stage+'/manifest.json',e,'manifest-recording');result.collection='FAIL';result.overall='FAIL';}
  if(result.overall!=='PASS'||errors.length){process.exitCode=1;stderr(result);}
 }
}
try{assert.equal(process.argv.length,3,'EXACT_COMMAND');const mode=process.argv[2];assert([...order,'collect'].includes(mode),'UNKNOWN_COMMAND');if(mode==='collect')collect();else runPhase(mode);}catch(error){process.exitCode=1;stderr({primary:encode(error),...flags});}
