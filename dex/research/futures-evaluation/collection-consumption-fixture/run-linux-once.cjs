// One-shot Linux orchestration and explicit artifact collection. No retry path.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {assessF01Artifacts}=require('./test/f01-artifact-state.cjs');
const root=__dirname,results=path.join(root,'results'),run=path.join(results,'linux-once'),staging=path.join(results,'linux-artifact');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f)));
const save=(f,v)=>writeOutput(f,JSON.stringify(v,null,2)+'\n');
const describe=e=>({message:e.message,stack:e.stack,code:e.code??null,cause:e.cause?describe(e.cause):null});
let outputPathFailure;
const blockedOutputFiles=new Map();
function outputDirectory(relative,create=false,exclusive=false){
 if(outputPathFailure)throw new Error('OUTPUT_PATH_DISABLED',{cause:outputPathFailure});
 try{
  assert(!path.isAbsolute(relative)&&relative.split('/').every(x=>x&&x!=='.'&&x!=='..'),'OUTPUT_DIRECTORY_PATH');
  assert(!fs.lstatSync(root).isSymbolicLink(),'OUTPUT_ROOT_LINK');const base=fs.realpathSync(root);let current=root;
  const parts=relative.split('/');
  for(let i=0;i<parts.length;i++){
   current=path.join(current,parts[i]);let info,created=false;
   try{info=fs.lstatSync(current);}catch(error){if(error.code!=='ENOENT'||!create)throw error;fs.mkdirSync(current);created=true;info=fs.lstatSync(current);}
   assert(!info.isSymbolicLink()&&info.isDirectory(),'OUTPUT_DIRECTORY_LINK_OR_TYPE');
   assert(fs.realpathSync(current).startsWith(base+path.sep),'OUTPUT_DIRECTORY_ESCAPE');
   if(exclusive&&i===parts.length-1)assert(created,'OUTPUT_DIRECTORY_ALREADY_EXISTS');
  }
  return current;
 }catch(error){outputPathFailure=error;throw error;}
}
function writeOutput(file,bytes){
 if(outputPathFailure)throw new Error('OUTPUT_PATH_DISABLED',{cause:outputPathFailure});
 if(blockedOutputFiles.has(file))throw new Error('OUTPUT_FILE_DISABLED',{cause:blockedOutputFiles.get(file)});
 const relative=path.relative(root,file).split(path.sep).join('/');
 try{
  assert(!path.isAbsolute(relative)&&relative.split('/').every(x=>x&&x!=='.'&&x!=='..'),'OUTPUT_FILE_PATH');
  outputDirectory(path.posix.dirname(relative));
 }catch(error){outputPathFailure??=error;throw error;}
 let info;try{info=fs.lstatSync(file);}catch(error){if(error.code!=='ENOENT')throw error;}
 if(info&&(info.isSymbolicLink()||!info.isFile())){const error=Error('OUTPUT_FILE_LINK_OR_TYPE');blockedOutputFiles.set(file,error);throw error;}
 fs.writeFileSync(file,bytes,{flag:'wx'});
}
function checkedFile(relative){
 assert(!path.isAbsolute(relative)&&!relative.split(/[\\/]/).includes('..'),'ARTIFACT_PATH');
 const base=fs.realpathSync(root),parts=relative.split('/');let current=root;
 for(const part of parts){current=path.join(current,part);const info=fs.lstatSync(current);assert(!info.isSymbolicLink(),'LINK_REJECTED:'+relative);const real=fs.realpathSync(current);assert(real.startsWith(base+path.sep),'ROOT_ESCAPE:'+relative);}
 assert(fs.lstatSync(current).isFile(),'NOT_REGULAR_FILE:'+relative);return current;
}
function checkedDirectory(relative){
 const marker=relative.split('/');let current=root;const base=fs.realpathSync(root);
 for(const part of marker){assert(part&&part!=='.'&&part!=='..','DIRECTORY_PATH');current=path.join(current,part);assert(!fs.lstatSync(current).isSymbolicLink(),'DIRECTORY_LINK');assert(fs.realpathSync(current).startsWith(base+path.sep),'DIRECTORY_ESCAPE');assert(fs.lstatSync(current).isDirectory(),'NOT_DIRECTORY');}
 return current;
}
function integrity(){
 const pins=read('linux-validation-pins.json');
 for(const [file,expected]of Object.entries(pins.sourceHashes))assert.equal(hash(fs.readFileSync(checkedFile(file))),expected,'LINUX_SOURCE_PIN:'+file);
 const workflow=path.resolve(root,'../../../..','.github/workflows/futures-offline-evaluation.yml');
 assert.equal(hash(fs.readFileSync(workflow)),pins.workflowSHA256,'WORKFLOW_PIN');
}
function preflight(){
 assert.equal(process.platform,'linux','LINUX_REQUIRED');assert.equal(process.version,'v22.23.3','NODE_VERSION');integrity();
 assert(!fs.existsSync(path.join(root,'build')),'BUILD_DIRECTORY_EXISTS');
 if(fs.existsSync(results))checkedDirectory('results');
 for(const f of ['results/linux-once','results/failure-evidence-mock','results/normal-session-mocks','results/f01-artifact-mocks','results/funding-lifetime-mocks','results/positive-funding','results/positive-tamper','results/linux-artifact'])assert(!fs.existsSync(path.join(root,f)),'PRIOR_RUN_EXISTS:'+f);
 // No Windows dependency tree or root junction may be transplanted.
 assert(!fs.lstatSync(root).isSymbolicLink(),'FIXTURE_ROOT_LINK');assert(!fs.lstatSync(path.join(root,'node_modules')).isSymbolicLink(),'DEPENDENCY_ROOT_LINK');
 const platformPackage=process.arch==='x64'?'anvil-linux-amd64':process.arch==='arm64'?'anvil-linux-arm64':null;
 assert(platformPackage,'UNSUPPORTED_ARCH');
 const packageRoot=path.join(root,'node_modules/@foundry-rs',platformPackage);
 assert.equal(JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'))).version,'1.7.1','LINUX_ANVIL_PACKAGE_VERSION');
 assert(fs.lstatSync(path.join(packageRoot,'bin/anvil')).isFile(),'LINUX_ANVIL_BINARY_MISSING');
 const plan=read('linux-validation-plan.json');assert.deepEqual(plan.phases.map(x=>x.id),['compile','gate','mock','normal-session','f01-artifact-mock','funding-lifetime','anvil','stored-tamper','positive-funding','positive-tamper'],'EXACT_PHASE_ORDER');
 return plan;
}
function execute(){
 const started=performance.now();
 let state={phases:Object.fromEntries(['compile','gate','mock','normal-session','f01-artifact-mock','funding-lifetime','anvil','stored-tamper','positive-funding','positive-tamper'].map(id=>[id,{state:'NOT_RUN',calls:0}]))},primary,active,runReady=false;
 try{
  const plan=preflight();outputDirectory('results',true);outputDirectory('results/linux-once',true,true);runReady=true;
  state={schema:'LQC_LINUX_ONCE_1',phases:Object.fromEntries(plan.phases.map(x=>[x.id,{state:'NOT_RUN',calls:0}])),automaticRetry:false,amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
  save(path.join(run,'initial.json'),{...state,node:process.version,platform:process.platform,arch:process.arch});
  for(const phase of plan.phases){
   const record=state.phases[phase.id];
   if(phase.id==='positive-funding'&&performance.now()-started>=1140000){record.blockedReason='INSUFFICIENT_WORKFLOW_TIME_BUDGET';throw Error('POSITIVE_INSUFFICIENT_WORKFLOW_TIME_BUDGET');}
   active=record;record.calls++;
   let args;
   if(phase.id==='compile')args=['compile.cjs'];
   else if(phase.id==='gate')args=['-e',"require('./build-common.cjs').validateBuild(process.cwd())"];
   else if(phase.id==='mock')args=['run-failure-evidence-checks.cjs'];
   else if(phase.id==='normal-session')args=['run-normal-session-mocks.cjs'];
   else if(phase.id==='f01-artifact-mock')args=['run-f01-artifact-mocks.cjs'];
   else if(phase.id==='funding-lifetime')args=['run-funding-lifetime-mocks.cjs'];
    else if(phase.id==='anvil')args=['run-tests.cjs'];
   else if(phase.id==='stored-tamper')args=['run-stored-consumption-tamper.cjs'];
   else if(phase.id==='positive-funding')args=['run-positive-funding.cjs'];
   else if(phase.id==='positive-tamper')args=['run-positive-funding-tamper.cjs'];
   else throw Error('UNKNOWN_PHASE');
   const child=cp.spawnSync(process.execPath,args,{cwd:root,encoding:null,windowsHide:true,timeout:phase.timeoutMs,maxBuffer:32*1024*1024,env:{...process.env,NODE_OPTIONS:''}});
   record.exitCode=child.status;record.signal=child.signal;record.spawnError=child.error?describe(child.error):null;
   record.state=child.status===0&&!child.signal&&!child.error?'PASS':'FAIL';
   const recordingErrors=[];
   for(const [file,bytes]of [[phase.id+'.stdout.log',child.stdout??Buffer.alloc(0)],[phase.id+'.stderr.log',child.stderr??Buffer.alloc(0)],[phase.id+'.exit-code.json',Buffer.from(JSON.stringify(record,null,2)+'\n')]]){
    try{writeOutput(path.join(run,file),bytes);}catch(error){recordingErrors.push({file,error:describe(error)});}
   }
   if(recordingErrors.length){record.state='FAIL';record.recordingErrors=recordingErrors;throw Error('PHASE_RECORDING_FAILED:'+phase.id);}
   assert.equal(record.state,'PASS','PHASE_FAILED:'+phase.id);
   if(phase.id==='compile'){
    for(const [file,expected]of Object.entries(plan.approvedBuildHashes))assert.equal(hash(fs.readFileSync(checkedFile(file))),expected,'APPROVED_BUILD_BYTES:'+file);
    save(path.join(run,'build-comparison.json'),{state:'PASS',hashes:plan.approvedBuildHashes,comparison:'FULL_BYTES_SHA256_NO_NORMALIZATION'});
   }
   integrity();active=null;
  }
 }catch(error){primary=error;if(active){active.state='FAIL';active.validationError=describe(error);}process.exitCode=1;}
 finally{
  // Never mark later phases successful when a preceding operation failed.
  const summary={state:primary?'FAIL':'PASS',phases:state?.phases??{},error:primary?describe(primary):null,automaticRetry:false,amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
  try{assert(runReady&&!outputPathFailure,'RUN_OUTPUT_UNAVAILABLE');save(path.join(run,'summary.json'),summary);}
  catch(recording){process.exitCode=1;try{fs.writeSync(2,JSON.stringify({summary,recording:describe(recording)})+'\n');}catch{}}
  if(primary)console.error(primary.stack);
 }
}
function collect(){
 const copied=[],missing=[],errors=[],required=new Set();let stagingReady=false;
  const executionStates={install:'UNVERIFIED',phases:Object.fromEntries(['compile','gate','mock','normal-session','f01-artifact-mock','funding-lifetime','anvil','stored-tamper','positive-funding','positive-tamper'].map(x=>[x,x==='positive-funding'?'UNKNOWN':'NOT_RUN'])),mockCases:{},normalConsumption:'UNKNOWN',storedTamper:'UNKNOWN',normalSession:'UNKNOWN',positiveFunding:'UNKNOWN',positiveObservation:'UNKNOWN',positiveValidation:'UNKNOWN',f01ArtifactMocks:'UNKNOWN',fundingLifetime:'UNKNOWN',positiveTamper:'UNKNOWN'};
 try{
  // A link at results/ must not be followed, even when compilation never ran.
  outputDirectory('results',true);assert(!fs.existsSync(staging),'STAGING_ALREADY_EXISTS');outputDirectory('results/linux-artifact',true,true);stagingReady=true;
  const pins=read('linux-validation-pins.json'),plan=read('linux-validation-plan.json');
  const sources=[...Object.keys(pins.sourceHashes),'linux-validation-pins.json'];
  const selected=new Set([...Object.keys(plan.approvedBuildHashes),...sources]);
  const sessionPlan=read('normal-session-plan.json');
  for(const name of [...sessionPlan.artifacts.always,...sessionPlan.cases.map(item=>item.id+'.json')])selected.add('results/normal-session-mocks/'+name);
  const artifactMockPlan=read('f01-artifact-mock-plan.json'),artifactMockPrefix='results/f01-artifact-mocks/';
  for(const name of [...artifactMockPlan.artifacts.always,...artifactMockPlan.cases.map(x=>x.id+'.json')])selected.add(artifactMockPrefix+name);
  const lifetimePlan=read('funding-lifetime-plan.json'),lifetimePrefix='results/funding-lifetime-mocks/';
  for(const name of [...lifetimePlan.artifacts.always,...lifetimePlan.cases.map(x=>x.id+'.json')])selected.add(lifetimePrefix+name);
  const positiveTamperPlan=read('positive-tamper-plan.json'),positiveTamperPrefix='results/positive-tamper/';
  for(const name of [...positiveTamperPlan.artifacts.always,...positiveTamperPlan.cases.flatMap(x=>[x.id+'.json',...(x.id==='P01'?[]:[x.id+'.mutation.json'])])])selected.add(positiveTamperPrefix+name);
  const positivePlan=read('positive-funding-plan.json'),positivePrefix='results/positive-funding/';
  for(const name of [...new Set(Object.values(positivePlan.artifacts).flat())])selected.add(positivePrefix+name);
  const tamperPlan=read('stored-tamper-plan.json');
  for(const name of [...tamperPlan.artifacts.always,...tamperPlan.cases.flatMap(item=>[item.id+'.json',...(item.id==='T01'?[]:[item.id+'.mutation.json'])])])selected.add('results/stored-tamper/'+name);
  for(const name of ['stdout.log','stderr.log','exit-code.json'])selected.add('results/linux-install/'+name);
  for(const name of ['initial.json','summary.json','build-comparison.json',...plan.phases.flatMap(x=>[x.id+'.stdout.log',x.id+'.stderr.log',x.id+'.exit-code.json'])])selected.add('results/linux-once/'+name);
  for(const name of ['initial.json','summary.json','failure.json'])selected.add('results/failure-evidence-mock/'+name);
  for(const item of plan.mockCases)for(const name of ['started.json','stdout.log','stderr.log','exit-code.json','validated.json','identity.json',...(item.id==='reporter-write'?[]:['mocha.json'])])selected.add('results/failure-evidence-mock/'+item.id+'/'+name);
  const entries=fs.readdirSync(checkedDirectory('results'));
  const collections=entries.filter(x=>/^collection-\d+$/.test(x));assert(collections.length<=1,'MULTIPLE_ANVIL_RUNS');
  const compilations=entries.filter(x=>/^compile-result-\d+\.json$/.test(x));assert(compilations.length<=1,'MULTIPLE_COMPILES');
  for(const f of compilations)selected.add('results/'+f);
  const testPinsText=fs.readFileSync(checkedFile('test-pins.cjs'),'utf8');
  const testPins=JSON.parse(testPinsText.slice(testPinsText.indexOf('{'),testPinsText.lastIndexOf('}')+1));
  for(const dir of collections){
   checkedDirectory('results/'+dir);
   for(const file of ['runner-selfchecks.json','preflight.json','exit-code.json','stdout.log','stderr.log','mocha.json','raw-summary.json','failure-categories.json','validated-summary.json','failure.json','rejection-evidence.json',...plan.evidenceRequirements.normalConsumptionFiles])selected.add('results/'+dir+'/'+file);
   for(const file of [...Object.keys(testPins.sourceHashes),'test-plan.json','test-pins.cjs'])selected.add('results/'+dir+'/source-snapshot/'+file);
  }
  for(const relative of [...selected].sort()){
   try{
    const source=checkedFile(relative),bytes=fs.readFileSync(source),destination=path.join(staging,relative);
    // No glob, directory recursion, node_modules copy, redaction or content rewriting.
    assert(!relative.split('/').includes('node_modules'),'DEPENDENCY_UPLOAD_FORBIDDEN');
    outputDirectory(path.relative(root,path.dirname(destination)).split(path.sep).join('/'),true);writeOutput(destination,bytes);
    copied.push({path:relative,bytes:bytes.length,sha256:hash(bytes)});
    if(Object.hasOwn(pins.sourceHashes,relative)&&hash(bytes)!==pins.sourceHashes[relative])errors.push({path:relative,error:{message:'SOURCE_PIN_MISMATCH_PRESERVED_AS_EVIDENCE'}});
   }catch(error){if(error.code==='ENOENT')missing.push({path:relative,reason:'NOT_GENERATED_OR_NOT_APPLICABLE'});else errors.push({path:relative,error:describe(error)});}
  }
  // Required evidence is fixed in the pinned plan, conditioned on actual states.
  const policy=plan.evidenceRequirements,need=files=>files.forEach(file=>required.add(file));
  need([...sources,...policy.always]);
  const exists=file=>copied.some(x=>x.path===file);
  const recorded=file=>{
   try{const value=JSON.parse(fs.readFileSync(checkedFile(file)));assert(value&&typeof value==='object'&&!Array.isArray(value),'EVIDENCE_RECORD_OBJECT_REQUIRED');return value;}
   catch(error){errors.push({path:file,error:describe(error)});throw new Error('EVIDENCE_RECORD_UNREADABLE:'+file,{cause:error});}
  };
  if(exists('results/linux-install/exit-code.json'))executionStates.install=recorded('results/linux-install/exit-code.json').exitCode===0?'PASS':'FAIL';
  const summaryFile='results/linux-once/summary.json';
  need([summaryFile]); // Missing summary cannot establish positive Funding NOT_RUN.
  if(exists(summaryFile)){
   const summary=recorded(summaryFile);
   for(const id of ['compile','gate','mock','normal-session','f01-artifact-mock','funding-lifetime','anvil','stored-tamper','positive-funding','positive-tamper']){
    const phase=summary.phases[id];assert(phase,'PHASE_STATE_MISSING:'+id);if(id!=='positive-funding')executionStates.phases[id]=phase.state;
    assert(phase.calls===0||phase.calls===1,'PHASE_CALL_COUNT:'+id);if(phase.calls)assert(['PASS','FAIL'].includes(phase.state),'CALLED_PHASE_STATE:'+id);
    if(phase.calls)need(policy.phaseExecuted.map(suffix=>'results/linux-once/'+id+'.'+suffix));
    else assert.equal(phase.state,'NOT_RUN','UNEXECUTED_PHASE_STATE');
    if(id==='positive-funding')executionStates.phases[id]=phase.state;
   }
   if(summary.phases.compile.state==='PASS')need(policy.compilePass);
   if(summary.phases.mock.calls){
    need(policy.mockExecuted);
    const mockFile='results/failure-evidence-mock/summary.json',mock=exists(mockFile)?recorded(mockFile):null;
    for(const item of plan.mockCases){
     const caseRoot='results/failure-evidence-mock/'+item.id+'/',status=mock?.cases?.[item.id];
     const started=exists(caseRoot+'started.json');
     executionStates.mockCases[item.id]=status?.executionState??(started?'RUNNING':'NOT_RUN');
     if(started||status?.executionState==='EXECUTED'||status?.executionState==='RUNNING'){
      need(policy.mockCaseExecuted.map(file=>caseRoot+file));
      if(policy.mockReportCases.includes(item.id))need([caseRoot+'mocha.json']);
      if(policy.mockIdentityCases.includes(item.id))need([caseRoot+'identity.json']);
     }
     if(summary.phases.mock.state==='PASS'){
      assert.equal(status?.executionState,'EXECUTED','MOCK_CASE_NOT_EXECUTED:'+item.id);assert.equal(status?.outerValidation,'PASS','MOCK_CASE_NOT_VALIDATED:'+item.id);
     }
     if(status?.executionState==='NOT_RUN')assert(!started,'MOCK_STATE_CONFLICT:'+item.id);
    }
   }else for(const item of plan.mockCases)executionStates.mockCases[item.id]='NOT_RUN';
   if(summary.phases.anvil.calls){
    executionStates.normalConsumption='UNKNOWN';
    assert.equal(collections.length,1,'EXECUTED_ANVIL_REQUIRES_ONE_RESULT_DIRECTORY');
    const prefix='results/'+collections[0]+'/';need(policy.anvilExecuted.map(file=>prefix+file));
    need([...Object.keys(testPins.sourceHashes),'test-plan.json','test-pins.cjs'].map(file=>prefix+'source-snapshot/'+file));
    if(policy.normalConsumptionFiles.some(file=>exists(prefix+file)))need(policy.normalConsumptionAttempted.map(file=>prefix+file));
    const report=exists(prefix+'mocha.json')?recorded(prefix+'mocha.json'):null;
    if(report){
     try{
      assert.equal(report.reporter?.state,'COMPLETE');
      for(const field of ['tests','passes','pending','failures']){assert(Array.isArray(report[field]));for(const item of report[field])assert(typeof item.title==='string'&&typeof item.fullTitle==='string');}
      assert.equal(report.stats.tests,report.tests.length);assert.equal(report.stats.passes,report.passes.length);assert.equal(report.stats.pending,report.pending.length);assert.equal(report.stats.failures,report.failures.length);
      const actual=report.tests.map(x=>x.fullTitle);assert.equal(new Set(actual).size,actual.length);
      for(const item of [...report.passes,...report.pending])assert(actual.includes(item.fullTitle),'MOCHA_RESULT_WITHOUT_TEST');
      for(const title of actual)assert.equal([...report.passes,...report.pending,...report.failures].filter(x=>x.fullTitle===title).length,1,'MOCHA_TEST_RESULT_CONFLICT');
      const expected=recorded('test-plan.json').fullTitles;for(const title of actual)assert(expected.includes(title),'UNEXPECTED_MOCHA_TITLE');
      if(summary.phases.anvil.state==='PASS'){assert.equal(actual.length,expected.length,'PASS_PHASE_INCOMPLETE_MOCHA');assert.equal(report.passes.length,expected.length);assert.equal(report.failures.length,0);assert.equal(report.pending.length,0);}
     }catch(error){errors.push({path:prefix+'mocha.json',error:describe(error)});throw new Error('C05_MOCHA_RECORD_INVALID',{cause:error});}
    }
    const isC05=x=>x.title?.startsWith('[C05] ');
    const passed=report?.passes?.filter(isC05)??[],failed=report?.failures?.filter(isC05)??[],pending=report?.pending?.filter(isC05)??[];
    const ran=report?.tests?.some(isC05)&&pending.length===0;
    const started=exists(prefix+'normal-consumption-started.json'),terminal=exists(prefix+'normal-consumption-state.json')?recorded(prefix+'normal-consumption-state.json'):null;
    const anyEvidence=policy.normalConsumptionFiles.some(file=>exists(prefix+file));
    if(anyEvidence||ran||passed.length||failed.length){
     executionStates.normalConsumption='UNKNOWN';
     need(policy.normalConsumptionAttempted.map(file=>prefix+file));need([prefix+'mocha.json']);
     assert(started,'C05_EXECUTED_WITHOUT_START_RECORD');
     const start=recorded(prefix+'normal-consumption-started.json');assert.equal(start.caseId,'C05','C05_START_ID');assert.equal(start.state,'STARTED','C05_START_STATE');
     assert(terminal&&terminal.caseId==='C05','C05_TERMINAL_RECORD_REQUIRED');
     assert(['SUCCESS','FAILURE'].includes(terminal.state),'C05_TERMINAL_STATE');
     assert.equal(pending.length,0,'C05_PENDING_STATE_CONFLICT');
     if(terminal.state==='SUCCESS'){
      need(policy.normalConsumptionSuccess.map(file=>prefix+file));
      assert.equal(passed.length,1,'C05_SUCCESS_MOCHA_CONFLICT');assert.equal(failed.length,0,'C05_SUCCESS_FAILURE_CONFLICT');
      assert.equal(terminal.pendingUnderlying,0,'C05_SUCCESS_WITH_PENDING_OPERATIONS');
     }else{
      need(policy.normalConsumptionFailure.map(file=>prefix+file));
      assert.equal(failed.length,1,'C05_FAILURE_MOCHA_CONFLICT');assert.equal(passed.length,0,'C05_FAILURE_PASS_CONFLICT');
     }
     executionStates.normalConsumption=terminal.state;
    }else if(!report){
     executionStates.normalConsumption='UNKNOWN_MISSING_MOCHA';need([prefix+'mocha.json']);
     errors.push({path:prefix+'mocha.json',error:{message:'C05_EXECUTION_STATE_UNCONFIRMED'}});
    }else executionStates.normalConsumption='NOT_RUN';
    if(summary.phases.anvil.state==='PASS')need(policy.anvilPass.map(file=>prefix+file));
   }else{
    assert.equal(summary.phases.anvil.state,'NOT_RUN','UNEXECUTED_ANVIL_STATE');
    assert.equal(collections.length,0,'ANVIL_OUTPUT_WITH_NOT_RUN');
    const initialFile='results/linux-once/initial.json';need([initialFile]);const initial=recorded(initialFile);
    assert.equal(initial.phases?.anvil?.calls,0,'INITIAL_ANVIL_CALLS');assert.equal(initial.phases?.anvil?.state,'NOT_RUN','INITIAL_ANVIL_STATE');
    executionStates.normalConsumption='NOT_RUN';
   }
   const sessionPhase=summary.phases['normal-session'],sessionPrefix='results/normal-session-mocks/';
   if(sessionPhase.calls){
    executionStates.normalSession='UNKNOWN';assert.equal(summary.phases.mock.state,'PASS','SESSION_REQUIRES_PRIOR_MOCK_SUCCESS');
    need(sessionPlan.artifacts.always.map(file=>sessionPrefix+file));
    const report=recorded(sessionPrefix+'cases.json'),runner=recorded(sessionPrefix+'runner-summary.json'),ids=sessionPlan.cases.map(x=>x.id);
    assert.deepEqual(report.required,ids);assert(Array.isArray(report.actual));assert(Array.isArray(report.cases));assert.equal(new Set(report.actual).size,report.actual.length);
    assert.deepEqual(report.unique,[...new Set(report.actual)]);assert.deepEqual(report.actual,ids.slice(0,report.actual.length));assert.deepEqual(report.cases.map(x=>x.id),report.actual);
    for(const item of report.cases)need([sessionPrefix+item.id+'.json']);
    if(sessionPhase.state==='PASS'){
     assert.equal(runner.state,'PASS');assert.equal(runner.calls,1);assert.equal(runner.exitCode,0);assert.equal(runner.recordingErrors.length,0);assert.equal(report.state,'PASS');assert.deepEqual(report.actual,ids);assert.deepEqual(report.notRun,[]);assert.deepEqual(report.unhandled,[]);
     assert(report.cases.every(x=>x.state==='PASS'&&x.cleanup==='COMPLETE'));need(ids.map(id=>sessionPrefix+id+'.json'));
    }
    executionStates.normalSession=sessionPhase.state;
   }else{assert.equal(sessionPhase.state,'NOT_RUN');assert(!fs.existsSync(path.join(root,sessionPrefix)),'SESSION_OUTPUT_WITH_NOT_RUN');executionStates.normalSession='NOT_RUN';}
   const tamperPhase=summary.phases['stored-tamper'],tamperPrefix='results/stored-tamper/';
   if(tamperPhase.calls){
    executionStates.storedTamper='UNKNOWN';assert.equal(summary.phases.anvil.state,'PASS','TAMPER_REQUIRES_ANVIL_SUCCESS');
    need(tamperPlan.artifacts.always.map(file=>tamperPrefix+file));
    const result=recorded(tamperPrefix+'cases.json'),runner=recorded(tamperPrefix+'runner-summary.json'),ids=tamperPlan.cases.map(x=>x.id);
    assert.deepEqual(result.required,ids,'TAMPER_REQUIRED_LIST');assert(Array.isArray(result.actual));assert(Array.isArray(result.cases));
    assert.equal(new Set(result.actual).size,result.actual.length,'TAMPER_DUPLICATE_ACTUAL');assert.deepEqual(result.unique,[...new Set(result.actual)]);
    assert.deepEqual(result.actual,ids.slice(0,result.actual.length),'TAMPER_EXECUTION_ORDER');assert.equal(result.cases.length,result.actual.length);assert.deepEqual(result.cases.map(x=>x.id),result.actual);
    for(const item of result.cases){need([tamperPrefix+item.id+'.json']);if(item.id!=='T01'&&item.preparation==='READY')need([tamperPrefix+item.id+'.mutation.json']);}
    if(tamperPhase.state==='PASS'){
     assert.equal(runner.state,'PASS');assert.equal(runner.calls,1);assert.equal(runner.exitCode,0);assert.equal(runner.recordingErrors.length,0);
     assert.equal(result.state,'PASS');assert.deepEqual(result.actual,ids);assert.equal(result.originalReplay,'PASS');assert(result.cases.every(x=>x.state==='PASS'&&x.preparation==='READY'));
     need(tamperPlan.cases.flatMap(item=>[tamperPrefix+item.id+'.json',...(item.id==='T01'?[]:[tamperPrefix+item.id+'.mutation.json'])]));
    }
    executionStates.storedTamper=tamperPhase.state;
   }else{
    assert.equal(tamperPhase.state,'NOT_RUN');assert(!fs.existsSync(path.join(root,tamperPrefix)),'TAMPER_OUTPUT_WITH_NOT_RUN');executionStates.storedTamper='NOT_RUN';
   }
   const artifactMockPhase=summary.phases['f01-artifact-mock'];
   if(artifactMockPhase.calls){
    executionStates.f01ArtifactMocks='UNKNOWN';assert.equal(summary.phases['normal-session'].state,'PASS');need(artifactMockPlan.artifacts.always.map(file=>artifactMockPrefix+file));
    const report=recorded(artifactMockPrefix+'cases.json'),runner=recorded(artifactMockPrefix+'runner-summary.json'),ids=artifactMockPlan.cases.map(x=>x.id);
    assert.deepEqual(report.required,ids);assert(Array.isArray(report.actual));assert.equal(new Set(report.actual).size,report.actual.length);assert.deepEqual(report.unique,[...new Set(report.actual)]);assert.deepEqual(report.actual,ids.slice(0,report.actual.length));assert.deepEqual(report.cases.map(x=>x.id),report.actual);
    for(const item of report.cases)need([artifactMockPrefix+item.id+'.json']);
    if(artifactMockPhase.state==='PASS'){assert.equal(runner.state,'PASS');assert.equal(runner.calls,1);assert.equal(runner.exitCode,0);assert.equal(runner.recordingErrors.length,0);assert.equal(report.state,'PASS');assert.equal(report.recordingErrors.length,0);assert.deepEqual(report.actual,ids);assert.deepEqual(report.notRun,[]);assert(report.cases.every(x=>x.state==='PASS'&&x.preparation==='READY'&&x.positiveControl==='PASS'&&x.originalReplay==='PASS'));need(ids.map(id=>artifactMockPrefix+id+'.json'));}
    executionStates.f01ArtifactMocks=artifactMockPhase.state;
   }else{assert.equal(artifactMockPhase.state,'NOT_RUN');assert(!fs.existsSync(path.join(root,artifactMockPrefix)));executionStates.f01ArtifactMocks='NOT_RUN';}
   const lifetimePhase=summary.phases['funding-lifetime'];
   if(lifetimePhase.calls){
    executionStates.fundingLifetime='UNKNOWN';assert.equal(summary.phases['f01-artifact-mock'].state,'PASS');need(lifetimePlan.artifacts.always.map(file=>lifetimePrefix+file));
    const report=recorded(lifetimePrefix+'cases.json'),runner=recorded(lifetimePrefix+'runner-summary.json'),ids=lifetimePlan.cases.map(x=>x.id);
    assert.deepEqual(report.required,ids);assert(Array.isArray(report.actual));assert.equal(new Set(report.actual).size,report.actual.length);assert.deepEqual(report.unique,[...new Set(report.actual)]);assert.deepEqual(report.actual,ids.slice(0,report.actual.length));assert.deepEqual(report.cases.map(x=>x.id),report.actual);
    for(const item of report.cases){need([lifetimePrefix+item.id+'.json']);assert.deepEqual(item,recorded(lifetimePrefix+item.id+'.json'));}
    if(lifetimePhase.state==='PASS'){
     assert.equal(runner.state,'PASS');assert.equal(runner.calls,1);assert.equal(runner.exitCode,0);assert.deepEqual(runner.recordingErrors,[]);assert.deepEqual(runner.required,ids);assert.deepEqual(runner.actual,ids);assert.deepEqual(runner.unique,ids);
     assert.equal(report.state,'PASS');assert.deepEqual(report.recordingErrors,[]);assert.deepEqual(report.actual,ids);assert.deepEqual(report.notRun,[]);assert.deepEqual(report.unhandled,[]);
     for(const spec of lifetimePlan.cases){const item=report.cases.find(x=>x.id===spec.id);assert.equal(item.state,'PASS');assert.equal(item.cleanup,'COMPLETE');assert.equal(item.title,spec.title);assert.deepEqual(item.checkpoints.map(x=>x.name),spec.requiredCheckpoints);assert.equal(item.afterCleanup.timers,0);assert.equal(item.afterCleanup.pending,0);assert.equal(item.afterCleanup.abortListeners,0);assert.equal(item.afterCleanup.originalRestored,true);}
     need(ids.map(id=>lifetimePrefix+id+'.json'));
    }
    executionStates.fundingLifetime=lifetimePhase.state;
   }else{assert.equal(lifetimePhase.state,'NOT_RUN');assert(!fs.existsSync(path.join(root,lifetimePrefix)),'LIFETIME_OUTPUT_WITH_NOT_RUN');executionStates.fundingLifetime='NOT_RUN';}
   const judgment=assessF01Artifacts({summary,plan:positivePlan,io:{exists:file=>fs.existsSync(path.join(root,file)),readBytes:file=>fs.readFileSync(checkedFile(file))}});
   need(judgment.required);Object.assign(executionStates,judgment.states);
   if(!judgment.ok){for(const item of judgment.errors)errors.push({path:item.file??item.error?.file,error:describe(item.error)});throw judgment.primary;}
   const positiveTamperPhase=summary.phases['positive-tamper'];
   if(positiveTamperPhase.calls){
    executionStates.positiveTamper='UNKNOWN';assert.equal(summary.phases['positive-funding'].state,'PASS','POSITIVE_TAMPER_REQUIRES_F01_PASS');need(positiveTamperPlan.artifacts.always.map(x=>positiveTamperPrefix+x));
    const report=recorded(positiveTamperPrefix+'cases.json'),runner=recorded(positiveTamperPrefix+'runner-summary.json'),ids=positiveTamperPlan.cases.map(x=>x.id);
    assert.deepEqual(report.required,ids);assert(Array.isArray(report.actual));assert.equal(new Set(report.actual).size,report.actual.length);assert.deepEqual(report.unique,[...new Set(report.actual)]);assert.deepEqual(report.actual,ids.slice(0,report.actual.length));assert.deepEqual(report.cases.map(x=>x.id),report.actual);
    for(const item of report.cases){need([positiveTamperPrefix+item.id+'.json']);assert.deepEqual(item,recorded(positiveTamperPrefix+item.id+'.json'));if(item.id!=='P01'&&item.preparation==='READY')need([positiveTamperPrefix+item.id+'.mutation.json']);}
    if(positiveTamperPhase.state==='PASS'){
     assert.equal(runner.state,'PASS');assert.equal(runner.calls,1);assert.equal(runner.exitCode,0);assert.deepEqual(runner.recordingErrors,[]);for(const key of ['required','actual','unique'])assert.deepEqual(runner[key],ids);
     assert.equal(report.state,'PASS');assert.deepEqual(report.actual,ids);assert.deepEqual(report.notRun,[]);assert.equal(report.originalReplay,'PASS');assert.deepEqual(report.finalInputIntegrity,{input:'UNCHANGED',abi:'UNCHANGED'});
     for(const spec of positiveTamperPlan.cases){const item=report.cases.find(x=>x.id===spec.id);assert.equal(item.title,spec.title);assert.equal(item.state,'PASS');assert.equal(item.preparation,'READY');if(spec.id!=='P01'){assert.equal(item.observed.code,'ERR_ASSERTION');assert.equal(item.observed.assertionLocation,'verify-positive-funding.mjs:'+spec.assertionLine+':');if(spec.targetMessage)assert.equal(item.observed.message.split('\n')[0],spec.targetMessage);if(spec.targetOperator)assert.equal(item.observed.operator,spec.targetOperator);}}
     need(positiveTamperPlan.cases.flatMap(x=>[positiveTamperPrefix+x.id+'.json',...(x.id==='P01'?[]:[positiveTamperPrefix+x.id+'.mutation.json'])]));
    }
    executionStates.positiveTamper=positiveTamperPhase.state;
   }else{assert.equal(positiveTamperPhase.state,'NOT_RUN');assert(!fs.existsSync(path.join(root,positiveTamperPrefix)),'POSITIVE_TAMPER_OUTPUT_WITH_NOT_RUN');executionStates.positiveTamper='NOT_RUN';}

  }
  for(const absent of missing){
   const caseId=plan.mockCases.find(x=>absent.path.startsWith('results/failure-evidence-mock/'+x.id+'/'))?.id;
   if(caseId&&executionStates.mockCases[caseId]==='NOT_RUN')absent.reason='NOT_RUN';
   if(policy.normalConsumptionFiles.includes(path.posix.basename(absent.path))&&executionStates.normalConsumption==='NOT_RUN')absent.reason='NOT_RUN';
  }
 }catch(error){errors.push({error:describe(error)});}
 finally{
  for(const file of required)if(!copied.some(x=>x.path===file))errors.push({path:file,error:{message:'REQUIRED_EVIDENCE_MISSING'}});
  if(errors.length)process.exitCode=1;
  const inventory={state:errors.length?'FAIL':'COLLECTED_NOT_TEST_VERDICT',copied,missing,required:[...required].sort(),executionStates,errors,amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
  try{assert(stagingReady&&!outputPathFailure,'STAGING_OUTPUT_UNAVAILABLE');save(path.join(staging,'artifact-inventory.json'),inventory);}catch(error){process.exitCode=1;try{fs.writeSync(2,JSON.stringify({inventory,outputPathFailure:outputPathFailure?describe(outputPathFailure):null,recording:describe(error)})+'\n');}catch{}}
 }
}
if(process.argv.length!==3||!['run','collect'].includes(process.argv[2]))throw Error('USAGE: node run-linux-once.cjs run|collect');
if(process.argv[2]==='run')execute();else collect();
