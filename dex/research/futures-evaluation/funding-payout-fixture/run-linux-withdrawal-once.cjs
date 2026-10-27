// Separate Linux entry point. Existing workflow/jobs and P01-P10 stay unchanged.
const fs=require('node:fs'),p=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict'),io=require('./test/stored-tamper-io.cjs');
const root=__dirname,out='results/linux-withdrawal-once',stage='results/linux-withdrawal-artifact',sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=f=>JSON.parse(fs.readFileSync(io.checkedFile(root,f))),recording=[],phases=[];let primary,ready=false,plan,pins,initialBuildPresent=true,initialCompileResults=new Set();
const fail=(kind,error)=>{if(primary===undefined)primary=error;recording.push({kind,error:io.errorRecord(error)});process.exitCode=1;};
function write(name,value){try{io.record(root,out,name,value);}catch(error){fail('record:'+name,error);}}
function sources(){for(const [file,h]of Object.entries(pins.sourceHashes))assert.equal(sha(fs.readFileSync(io.checkedFile(root,file))),h,'LINUX_WITHDRAWAL_SOURCE:'+file);assert.equal(sha(fs.readFileSync(io.checkedFile(root,'linux-withdrawal-plan.json'))),pins.planSHA256);}
try{
 assert.equal(process.argv.length,2);assert.equal(process.platform,'linux');assert.equal(process.version,'v22.23.3');assert(!fs.existsSync(p.join(root,out)),'PRIOR_LINUX_WITHDRAWAL');io.createOutput(root,out);ready=true;
 pins=read('linux-withdrawal-pins.json');plan=read('linux-withdrawal-plan.json');sources();assert.deepEqual(plan.phases.map(x=>x.id),['install','compile','hash','gate','withdrawal']);assert.equal(sha(fs.readFileSync(io.checkedFile(p.resolve(root,'../../../..'),'.github/workflows/futures-offline-evaluation.yml'))),pins.workflowSHA256,'UNCHANGED_WORKFLOW_PIN');
 // Establish run ownership before invoking any delegated phase; never publish prior build files.
 initialBuildPresent=fs.existsSync(p.join(root,'build'));
 if(fs.existsSync(p.join(root,'results')))initialCompileResults=new Set(fs.readdirSync(io.checkedDirectory(root,'results')).filter(n=>/^compile-result-[0-9]+\.json$/.test(n)));
 for(const phase of plan.phases){const item={id:phase.id,calls:0,state:'NOT_RUN'};phases.push(item);}
 for(const phase of plan.phases){if(primary!==undefined)break;const item=phases.find(x=>x.id===phase.id);item.calls=1;item.state='STARTED';write(phase.id+'-started.json',item);if(primary!==undefined)break;
  const args=phase.id==='withdrawal'?['run-withdrawal.cjs']:['run-linux-payout-once.cjs',phase.id];write(phase.id+'-invocation.json',{executable:process.execPath,args,timeoutMs:phase.timeoutMs,automaticRetry:false});if(primary!==undefined)break;
  const child=cp.spawnSync(process.execPath,args,{cwd:root,encoding:null,timeout:phase.timeoutMs,maxBuffer:32e6,env:{...process.env,NODE_OPTIONS:''},windowsHide:true});item.exitCode=child.status;item.signal=child.signal;item.spawnError=io.errorRecord(child.error);
  if(child.status!==0||child.signal||child.error)fail('execution:'+phase.id,child.error??Object.assign(Error('LINUX_WITHDRAWAL_PHASE_FAILED'),{phase:phase.id,exitCode:child.status,signal:child.signal}));
  for(const [name,bytes]of [['stdout',child.stdout??Buffer.alloc(0)],['stderr',child.stderr??Buffer.alloc(0)]])try{io.checkedDirectory(root,out);fs.writeFileSync(p.join(root,out,phase.id+'.'+name+'.log'),bytes,{flag:'wx'});}catch(error){fail('raw-log:'+phase.id+':'+name,error);}
  item.state=child.status===0&&!child.error&&!child.signal&&!primary?'PASS':'FAIL';write(phase.id+'-exit.json',item);
  if(item.state==='PASS'&&phase.id==='hash')for(const [name,h]of Object.entries(plan.approvedBuildHashes))assert.equal(sha(fs.readFileSync(io.checkedFile(root,name))),h,'FULL_APPROVED_BUILD_BYTES');
 }
 sources();
}catch(error){fail('orchestration',error);}
finally{
 if(ready){const summaryEvidence={state:primary===undefined?'PASS':'FAIL',phases,primary:io.errorRecord(primary),errors:recording,automaticRetry:false,amount:null,authority:false,link:'UNVERIFIED'};write('summary.json',summaryEvidence);
  // External staging is distinct from runner/internal collection. Neither can erase failure.
  const errors=[],files=[],delegatedStates={},wrapperStates={},omissions=[],required=new Set(['summary.json']);for(const item of phases)if(item.calls===1){required.add(item.id+'-started.json');required.add(item.id+'-invocation.json');for(const ext of ['stdout.log','stderr.log'])required.add(item.id+'.'+ext);required.add(item.id+'-exit.json');}
  try{assert(!fs.existsSync(p.join(root,stage)));io.createOutput(root,stage);
   const visibleNames={'sources/.gitignore':'sources/fixture-gitignore.txt','runner/sources/.gitignore':'runner/sources/fixture-gitignore.txt'};
   const uploadDestination=requested=>{
    assert.equal(typeof requested,'string');assert(!p.posix.isAbsolute(requested)&&!requested.includes('\\'),'ARTIFACT_DESTINATION_RELATIVE');
    const actual=Object.hasOwn(visibleNames,requested)?visibleNames[requested]:requested;
    assert(actual.split('/').every(part=>part.length>0&&!part.startsWith('.')&&!['node_modules','prepared'].includes(part)),'ARTIFACT_HIDDEN_OR_FORBIDDEN_DESTINATION');return actual;
   };
   const requiredUploadPaths=new Set([uploadDestination('sources/.gitignore')]),requestedDestinations=new Set();
   const copy=(src,requested)=>{let dest;try{
    dest=uploadDestination(requested);requiredUploadPaths.add(dest);assert(!requestedDestinations.has(dest),'ARTIFACT_DESTINATION_COLLISION_OR_DUPLICATE');requestedDestinations.add(dest);
    const b=fs.readFileSync(io.checkedFile(root,src));io.createOutput(root,p.posix.dirname(stage+'/'+dest));fs.writeFileSync(p.join(root,stage,dest),b,{flag:'wx'});
    const saved=fs.readFileSync(io.checkedFile(root,stage+'/'+dest));assert.equal(saved.length,b.length);assert.equal(sha(saved),sha(b));
    files.push({source:src,originalPath:requested,path:dest,bytes:b.length,sha256:sha(b)});return b;
   }catch(error){errors.push({file:src,originalPath:requested,path:dest??null,error:io.errorRecord(error)});}};
   // Preserve exact outer bytes before parsing; validation never substitutes regenerated JSON.
   const outerRaw=new Map();for(const name of required){const bytes=copy(out+'/'+name,'linux/'+name);if(bytes!==undefined)outerRaw.set(name,bytes);}
   // Only already-encoded evidence may enter this projection; never read Error/getters/toJSON.
   const evidenceJson=value=>{
    const active=new Set();const copy=x=>{
     if(x===null||typeof x==='string'||typeof x==='boolean')return x;
     if(typeof x==='number'){assert(Number.isFinite(x),'ENCODED_JSON_NUMBER');return x;}
     assert(typeof x==='object','ENCODED_JSON_ONLY');const array=Array.isArray(x),prototype=Object.getPrototypeOf(x);
     assert(array?prototype===Array.prototype:prototype===Object.prototype||prototype===null,'ENCODED_JSON_PROTOTYPE');assert(!active.has(x),'ENCODED_JSON_CYCLE');active.add(x);
     const target=array?[]:{};for(const key of Reflect.ownKeys(x)){assert.equal(typeof key,'string','ENCODED_JSON_SYMBOL');const descriptor=Object.getOwnPropertyDescriptor(x,key);assert(Object.hasOwn(descriptor,'value'),'ENCODED_JSON_ACCESSOR');if(array&&key==='length')continue;assert(descriptor.enumerable,'ENCODED_JSON_HIDDEN_FIELD');Object.defineProperty(target,key,{value:copy(descriptor.value),enumerable:true,writable:true,configurable:true});}
     if(array){assert.equal(target.length,Object.getOwnPropertyDescriptor(x,'length').value,'ENCODED_JSON_ARRAY_LENGTH');for(let i=0;i<target.length;i++)assert(Object.hasOwn(target,String(i)),'ENCODED_JSON_ARRAY_HOLE');assert.equal(Object.keys(target).length,target.length,'ENCODED_JSON_ARRAY_FIELD');}
     active.delete(x);return target;
    };return JSON.parse(JSON.stringify(copy(value)));
   };
   const outerValid=new Set();let outerSummaryValid=false;
   const issue=(file,error)=>errors.push({file,error:io.errorRecord(error)});
   const object=value=>assert(value!==null&&typeof value==='object'&&!Array.isArray(value),'OUTER_OBJECT');
   const terminalFields=value=>{object(value);assert.equal(typeof value.id,'string');assert.equal(value.calls,1);assert(['PASS','FAIL'].includes(value.state),'OUTER_TERMINAL_STATE');assert(Object.hasOwn(value,'exitCode')&&(value.exitCode===null||Number.isSafeInteger(value.exitCode)),'OUTER_EXIT_CODE');assert(Object.hasOwn(value,'signal')&&(value.signal===null||typeof value.signal==='string'),'OUTER_SIGNAL');assert(Object.hasOwn(value,'spawnError')&&(value.spawnError===null||typeof value.spawnError==='object'),'OUTER_SPAWN_ERROR');if(value.state==='PASS'){assert.equal(value.exitCode,0);assert.equal(value.signal,null);assert.equal(value.spawnError,null);}};
   const outerJson=(name,validate)=>{const file=out+'/'+name;try{assert(outerRaw.has(name),'OUTER_REQUIRED_JSON');const value=JSON.parse(outerRaw.get(name));validate(value);return value;}catch(error){issue(file,error);return undefined;}};
   const summary=outerJson('summary.json',value=>{
    object(value);assert(['PASS','FAIL'].includes(value.state));assert.equal(value.automaticRetry,false);assert.equal(value.amount,null);assert.equal(value.authority,false);assert.equal(value.link,'UNVERIFIED');assert(Object.hasOwn(value,'primary')&&(value.primary===null||typeof value.primary==='object'),'OUTER_PRIMARY');assert(Array.isArray(value.errors));for(const error of value.errors){object(error);assert.equal(typeof error.kind,'string');assert(Object.hasOwn(error,'error'));}
    assert(Array.isArray(value.phases));assert.deepEqual(value.phases.map(x=>x.id),plan.phases.map(x=>x.id),'OUTER_PHASE_ROSTER');assert.deepEqual(value.phases,evidenceJson(summaryEvidence.phases),'OUTER_SUMMARY_MEMORY_CONFLICT');assert.equal(value.state,primary===undefined?'PASS':'FAIL','OUTER_SUMMARY_STATE_CONFLICT');assert.deepEqual(value.primary,evidenceJson(summaryEvidence.primary));assert.deepEqual(value.errors,evidenceJson(summaryEvidence.errors),'OUTER_SUMMARY_ERRORS_CONFLICT');
    let blocked=false;for(const item of value.phases){object(item);assert([0,1].includes(item.calls));assert(['NOT_RUN','STARTED','PASS','FAIL'].includes(item.state));if(item.calls===0){assert.equal(item.state,'NOT_RUN');assert(blocked,'OUTER_NOT_RUN_WITHOUT_PRIOR_BLOCK');}else{assert(!blocked,'OUTER_PHASE_AFTER_FAILURE');if(item.state==='STARTED'){assert(value.state==='FAIL'&&value.errors.length>0,'OUTER_UNFINISHED_WITHOUT_ERROR');}else terminalFields(item);}if(item.state!=='PASS')blocked=true;}
    if(value.state==='PASS'){assert.equal(value.primary,null);assert.deepEqual(value.errors,[]);assert(value.phases.every(x=>x.state==='PASS'));}else assert(value.primary!==null||value.errors.length>0,'OUTER_FAILURE_WITHOUT_ERROR');
   });outerSummaryValid=summary!==undefined;
   for(const item of phases){wrapperStates[item.id]='UNKNOWN';if(item.calls!==1)continue;
    const started=outerJson(item.id+'-started.json',value=>{object(value);assert.equal(value.id,item.id);assert.equal(value.calls,1);assert.equal(value.state,'STARTED');});
    const invocation=outerJson(item.id+'-invocation.json',value=>{object(value);assert.equal(typeof value.executable,'string');assert.equal(value.executable,process.execPath);assert.deepEqual(value.args,item.id==='withdrawal'?['run-withdrawal.cjs']:['run-linux-payout-once.cjs',item.id]);assert.equal(value.timeoutMs,plan.phases.find(x=>x.id===item.id).timeoutMs);assert.equal(value.automaticRetry,false);});
    const exit=outerJson(item.id+'-exit.json',value=>{terminalFields(value);assert.equal(value.id,item.id);assert.deepEqual(value,evidenceJson(item),'OUTER_EXIT_SUMMARY_CONFLICT');});
    if(outerSummaryValid&&started&&invocation&&exit){outerValid.add(item.id);wrapperStates[item.id]=exit.state;}
   }
   if(outerSummaryValid)for(const item of phases)if(item.calls===0&&item.state==='NOT_RUN')wrapperStates[item.id]='NOT_RUN';
   // Preserve delegated phase evidence even when withdrawal was never reached.
   const policy=plan.delegatedArtifacts;
   assert.deepEqual(policy.phaseIds,['install','compile','hash','gate'],'DELEGATED_FIXED_PHASES');
   assert.deepEqual(policy.recordFiles,['started.json','invocation.json','stdout.log','stderr.log','exit-code.json','result.json'],'DELEGATED_FIXED_FILES');
   assert.deepEqual(policy.buildFiles,['build/compiler-input.json','build/compiler-output.json','build/manifest.json'],'DELEGATED_FIXED_BUILD');
   assert.equal(policy.compileResultPattern,'^compile-result-[0-9]+\\.json$','DELEGATED_RESULT_PATTERN');
   const present=relative=>{try{fs.lstatSync(p.join(root,relative));return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
   const collectError=(file,error)=>errors.push({file,error:io.errorRecord(error)});
   const preservedJson=relative=>{const bytes=fs.readFileSync(io.checkedFile(root,relative));return JSON.parse(bytes);};
   const records={};let priorBlocked=false;
   for(const id of policy.phaseIds){
    delegatedStates[id]='UNKNOWN';const outer=phases.find(x=>x.id===id),base='results/linux-payout-once/'+id;
    const available=new Set();for(const name of policy.recordFiles)try{if(present(base+'/'+name)){available.add(name);copy(base+'/'+name,'delegated/'+id+'/'+name);}}catch(error){collectError(base+'/'+name,error);}
    if(!outer||outer.calls===0){
     if(available.size)collectError(base,Error('DELEGATED_FILES_WITHOUT_PHASE_CALL'));
     else if(outerSummaryValid&&wrapperStates[id]==='NOT_RUN'&&priorBlocked){delegatedStates[id]='NOT_RUN';omissions.push({path:base,state:'NOT_RUN',reason:'Earlier outer phase failed or could not establish success'});}
     else collectError(base,Error('DELEGATED_NOT_RUN_UNPROVEN'));
     continue;
    }
    try{
     assert.equal(outer.calls,1);assert(!priorBlocked,'DELEGATED_EXECUTED_AFTER_FAILURE');
     for(const name of ['started.json','exit-code.json','result.json'])assert(available.has(name),'DELEGATED_REQUIRED:'+name);
     const started=preservedJson(base+'/started.json'),record=preservedJson(base+'/result.json'),exit=preservedJson(base+'/exit-code.json');
     records[id]=record;assert.equal(started.id,id);assert.equal(started.state,'STARTED');assert.equal(started.attempts,1);
     assert.equal(record.id,id);assert.equal(record.attempts,1);assert(['PASS','FAIL'].includes(record.state),'DELEGATED_TERMINAL_STATE');
     assert([0,1].includes(record.childCalls));assert.equal(exit.id,id);assert.equal(exit.childCalls,record.childCalls);assert.equal(exit.childExitCode,record.childExitCode);assert.equal(exit.signal,record.signal);assert.equal(exit.phaseExitCode,record.state==='PASS'?0:1,'DELEGATED_EXIT_CONFLICT');
     // Prove the internal result first; external recording failures cannot erase it.
     for(const name of ['stdout.log','stderr.log'])if(record.childCalls===1||record.state==='PASS')assert(available.has(name),'DELEGATED_REQUIRED:'+name);
     if(record.childCalls===1){assert(available.has('invocation.json'),'DELEGATED_REQUIRED:invocation.json');const invocation=preservedJson(base+'/invocation.json');assert.equal(invocation.id,id);assert.equal(invocation.calls,1);}
     else if(available.has('invocation.json')){const invocation=preservedJson(base+'/invocation.json');assert.equal(invocation.id,id);assert.equal(invocation.calls,1);}
     if(record.state==='PASS'){assert.deepEqual(record.recordingErrors,[]);if(id==='hash'){assert.equal(record.childCalls,0);assert.deepEqual(record.buildHashes,plan.approvedBuildHashes);}else{assert.equal(record.childCalls,1);assert.equal(record.childExitCode,0);assert.equal(record.signal,null);}}
     // Parse any present JSON even when not mandatory; damaged partial bytes remain copied.
     for(const name of available)if(name.endsWith('.json'))preservedJson(base+'/'+name);
     delegatedStates[id]=record.state;
     try{
      assert(outerValid.has(id),'DELEGATED_OUTER_RECORDS_UNVERIFIED');assert.equal(outer.exitCode,exit.phaseExitCode,'DELEGATED_OUTER_EXIT_CONFLICT');assert.equal(outer.signal,null);
      if(outer.state==='PASS')assert.equal(record.state,'PASS','DELEGATED_OUTER_STATE_CONFLICT');
     }catch(error){collectError(out+'/'+id+'-exit.json',error);}
    }catch(error){collectError(base,error);}
    if(outer.state!=='PASS'||delegatedStates[id]!=='PASS')priorBlocked=true;
    for(const name of policy.recordFiles)if(!available.has(name))omissions.push({path:base+'/'+name,state:delegatedStates[id],reason:'Absent; required-file assertions above govern collection failure'});
   }
   const compilePhase=phases.find(x=>x.id==='compile'),buildRequired=['compile','hash','gate'].some(id=>delegatedStates[id]==='PASS');
   for(const file of policy.buildFiles){
    const owned=compilePhase?.calls===1&&!initialBuildPresent;
    if(!owned){omissions.push({path:file,state:delegatedStates.compile,reason:'Not generated by this run: compile not entered or build existed before execution'});if(buildRequired)collectError(file,Error('BUILD_RUN_OWNERSHIP_UNPROVEN'));continue;}
    try{if(present(file)){copy(file,file);preservedJson(file);if(delegatedStates.hash==='PASS'||delegatedStates.gate==='PASS')assert.equal(sha(fs.readFileSync(io.checkedFile(root,file))),plan.approvedBuildHashes[file],'COLLECT_APPROVED_BUILD_HASH');}
     else{omissions.push({path:file,state:delegatedStates.compile,reason:'Compiler stopped before producing this file'});if(buildRequired)throw Error('SUCCESSFUL_BUILD_FILE_MISSING');}}
    catch(error){collectError(file,error);}
   }
   let resultNames=[];
   try{if(present('results'))resultNames=fs.readdirSync(io.checkedDirectory(root,'results')).filter(n=>/^compile-result-[0-9]+\.json$/.test(n)&&!initialCompileResults.has(n));}
   catch(error){collectError('results',error);}
   if(buildRequired&&resultNames.length!==1)collectError('results/compile-result-*.json',Error('EXACTLY_ONE_SUCCESSFUL_COMPILE_RESULT_REQUIRED'));
   if(resultNames.length&&(!compilePhase||compilePhase.calls!==1))collectError('results/compile-result-*.json',Error('COMPILE_RESULT_WITHOUT_COMPILE_CALL'));
   for(const name of resultNames){const file='results/'+name;try{copy(file,'compile-results/'+name);const result=preservedJson(file);if(delegatedStates.compile==='PASS'){assert.deepEqual(result.errors,[]);assert.equal(result.inputSHA256,plan.approvedBuildHashes['build/compiler-input.json']);assert.equal(result.outputSHA256,plan.approvedBuildHashes['build/compiler-output.json']);assert.equal(result.compiler,plan.compilerVersion,'COMPILE_RESULT_COMPILER');}}catch(error){collectError(file,error);}}
   const phase=phases.find(x=>x.id==='withdrawal');if(phase?.calls===1){
    requiredUploadPaths.add(uploadDestination('runner/sources/.gitignore'));
    const suite=read('withdrawal-plan.json'),sp=read('withdrawal-pins.json'),allowed=new Set([...suite.artifacts.runner,...suite.artifacts.child,...suite.artifacts.build,...Object.keys(sp.sourceHashes).map(x=>'sources/'+x),'sources/withdrawal-plan.json','sources/withdrawal-pins.json']);
    const rawAllowed=new Set([...suite.artifacts.runner,...suite.artifacts.child]);for(const item of suite.cases)for(const file of ['started.json','queries.jsonl','partial.json','state.json','validation.json','failure.json','withdrawal-1.json','withdrawal-1-validation.json','withdrawal-2.json','withdrawal-2-validation.json']){allowed.add(item.id+'/'+file);rawAllowed.add(item.id+'/'+file);}
    let internal;try{internal=read('results/protected-withdrawal/artifact/manifest.json');assert.equal(internal.state,'PASS','INTERNAL_COLLECTION_NOT_PASS');}catch(error){errors.push({file:'internal-manifest',error:io.errorRecord(error)});}
    const seen=new Set();for(const file of internal?.copied??[])try{assert(allowed.has(file.path)&&!seen.has(file.path),'EXTERNAL_ALLOWLIST_OR_DUPLICATE');seen.add(file.path);const source='results/protected-withdrawal/artifact/'+file.path,b=fs.readFileSync(io.checkedFile(root,source));assert.equal(sha(b),file.sha256);assert.equal(b.length,file.bytes);copy(source,'runner/'+file.path);}catch(error){errors.push({file:file.path,error:io.errorRecord(error)});}
    if(fs.existsSync(p.join(root,'results/protected-withdrawal/artifact/manifest.json')))copy('results/protected-withdrawal/artifact/manifest.json','runner/manifest.json');
    // Salvage only fixed raw paths, even when the internal manifest is absent/FAIL.
    // Their availability cannot turn internal failure into collection or execution PASS.
    for(const name of rawAllowed){const source='results/protected-withdrawal/'+name;if(fs.existsSync(p.join(root,source)))copy(source,'raw-runner/'+name);}
   }
   const sourceSelections=new Map();
   const addSourceSelection=(src,requested,mandatory)=>{try{
    assert.equal(typeof mandatory,'boolean');const destination=uploadDestination(requested);if(mandatory)requiredUploadPaths.add(destination);
    const verifiedSource=io.checkedFile(root,src),prior=sourceSelections.get(destination),origin={source:src,originalPath:requested,required:mandatory};
    if(prior){assert.equal(prior.source,src,'SOURCE_SNAPSHOT_DIFFERENT_SOURCE_COLLISION');assert.equal(prior.verifiedSource,verifiedSource,'SOURCE_SNAPSHOT_VERIFIED_SOURCE_COLLISION');prior.required=prior.required||mandatory;prior.selections.push(origin);}
    else sourceSelections.set(destination,{source:src,originalPath:requested,path:destination,verifiedSource,required:mandatory,selections:[origin]});
   }catch(error){errors.push({file:src,originalPath:requested,error:io.errorRecord(error)});}};
   for(const name of Object.keys(pins?.sourceHashes??{}))addSourceSelection(name,'sources/'+name,true);
   for(const name of ['linux-withdrawal-plan.json','linux-withdrawal-pins.json'])addSourceSelection(name,'sources/'+name,true);
   for(const item of sourceSelections.values())try{
    assert.equal(io.checkedFile(root,item.source),item.verifiedSource,'SOURCE_SNAPSHOT_SOURCE_CHANGED');
    if(copy(item.source,item.originalPath)!==undefined){const file=files.find(x=>x.path===item.path);assert(file,'SOURCE_SNAPSHOT_MAPPING_MISSING');file.required=item.required;file.selections=item.selections;}
   }catch(error){errors.push({file:item.source,path:item.path,error:io.errorRecord(error)});}
   // Validate the actual upload names and re-read bytes; logical hidden names are never required destinations.
   const uploaded=new Map();for(const file of files)try{
    assert.equal(uploadDestination(file.path),file.path,'ARTIFACT_UPLOAD_NAME');assert(!uploaded.has(file.path),'ARTIFACT_UPLOAD_MANIFEST_DUPLICATE');
    const bytes=fs.readFileSync(io.checkedFile(root,stage+'/'+file.path));assert.equal(bytes.length,file.bytes);assert.equal(sha(bytes),file.sha256);uploaded.set(file.path,file);
   }catch(error){errors.push({file:file.source,path:file.path,error:io.errorRecord(error)});}
   for(const dest of requiredUploadPaths)if(!uploaded.has(dest))errors.push({file:stage+'/'+dest,path:dest,error:io.errorRecord(Error('ARTIFACT_REQUIRED_UPLOAD_PATH_MISSING'))});
   fs.writeFileSync(p.join(root,stage,'collection.json'),JSON.stringify({requiredUploadPaths:[...requiredUploadPaths],collection:errors.length?'FAIL':'PASS',execution:primary===undefined?'PASS':'FAIL',primary:io.errorRecord(primary),recordingErrors:recording,delegatedStates,wrapperStates,omissions,files,errors,phases,amount:null,authority:false,link:'UNVERIFIED'},null,2)+'\n',{flag:'wx'});
  }catch(error){errors.push({kind:'external-collection',error:io.errorRecord(error)});}
  if(errors.length)fail('external-collection',Object.assign(Error('WITHDRAWAL_COLLECTION_FAILED'),{errors}));
 }
 if(primary!==undefined||recording.length){process.exitCode=1;try{fs.writeSync(2,JSON.stringify({primary:io.errorRecord(primary),errors:recording,phases})+'\n');}catch{}}
}
