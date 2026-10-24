const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createRequire}=require('node:module'),crypto=require('node:crypto');
const root=__dirname,local=createRequire(path.join(root,'package.json')),plan=JSON.parse(fs.readFileSync(path.join(root,'linux-validation-plan.json')));
const {encode}=require('./test/failure-evidence.cjs');
const out=path.join(root,'results/failure-evidence-mock');
const save=(f,v)=>writeOutput(f,JSON.stringify(v,null,2)+'\n');
let launched=0,outReady=false,outputPathFailure,activeRecord,activeChild,validationAttempted=false,primary;
const results=[],recordingErrors=[],caseStates=Object.fromEntries(plan.mockCases.map(x=>[x.id,{id:x.id,executionState:'NOT_RUN',outerValidation:'NOT_RUN'}]));
const blockedOutputFiles=new Map();
function outputDirectory(relative,create=false,exclusive=false){
 if(outputPathFailure)throw new Error('MOCK_OUTPUT_DISABLED',{cause:outputPathFailure});
 try{
  assert(!path.isAbsolute(relative)&&(relative===''||relative.split('/').every(x=>x&&x!=='.'&&x!=='..')),'MOCK_OUTPUT_PATH');
  assert(!fs.lstatSync(root).isSymbolicLink(),'MOCK_ROOT_LINK');const base=fs.realpathSync(root);let current=root;
  const parts=['results','failure-evidence-mock',...(relative?relative.split('/'):[])];
  for(let i=0;i<parts.length;i++){
   current=path.join(current,parts[i]);let info,created=false;
   try{info=fs.lstatSync(current);}catch(error){if(error.code!=='ENOENT'||!create)throw error;fs.mkdirSync(current);created=true;info=fs.lstatSync(current);}
   assert(!info.isSymbolicLink()&&info.isDirectory(),'MOCK_OUTPUT_LINK_OR_TYPE');assert(fs.realpathSync(current).startsWith(base+path.sep),'MOCK_OUTPUT_ESCAPE');
   if(exclusive&&i===parts.length-1)assert(created,'MOCK_OUTPUT_ALREADY_EXISTS');
  }
 }catch(error){outputPathFailure=error;throw error;}
}
function writeOutput(relative,bytes){
 if(outputPathFailure)throw new Error('MOCK_OUTPUT_DISABLED',{cause:outputPathFailure});
 if(blockedOutputFiles.has(relative))throw new Error('MOCK_FILE_DISABLED',{cause:blockedOutputFiles.get(relative)});
 try{
  assert(!path.isAbsolute(relative)&&relative.split('/').every(x=>x&&x!=='.'&&x!=='..'),'MOCK_FILE_PATH');
  const parent=path.posix.dirname(relative);outputDirectory(parent==='.'?'':parent);
 }catch(error){outputPathFailure??=error;throw error;}
 let info;try{info=fs.lstatSync(path.join(out,relative));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(info&&(info.isSymbolicLink()||!info.isFile())){const error=Error('MOCK_FILE_LINK_OR_TYPE');blockedOutputFiles.set(relative,error);throw error;}
 fs.writeFileSync(path.join(out,relative),bytes,{flag:'wx'});
}
const childEvidence=()=>activeChild?{record:activeRecord,stdout:{encoding:'base64',data:(activeChild.stdout??Buffer.alloc(0)).toString('base64')},stderr:{encoding:'base64',data:(activeChild.stderr??Buffer.alloc(0)).toString('base64')}}:null;
function graph(encoded){
 const nodes=new Map();
 function index(v){if(!v||typeof v!=='object')return;if(v.$id)nodes.set(v.$id,v);for(const x of Object.values(v))index(x);}
 index(encoded);
 const resolve=v=>v?.$ref?nodes.get(v.$ref):v;
 const prop=(v,k)=>resolve(resolve(v)?.properties?.[k]);
 return {resolve,prop};
}
try{
 // Validate each existing ancestor before creating the exclusive mock root.
 assert(!fs.existsSync(out),'MOCK_RESULTS_ALREADY_EXIST');
 outputDirectory('',true,true);outReady=true;
 const pins=JSON.parse(fs.readFileSync(path.join(root,'linux-validation-pins.json')));
 for(const [file,expected]of Object.entries(pins.sourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),expected,'MOCK_SOURCE_PIN:'+file);
 assert.deepEqual(plan.mockCases.map(x=>x.id),['bigint','nested','evidence','cleanup','both','reporter-write'],'EXACT_MOCK_CASES');
 save('initial.json',{cases:caseStates,executionState:'NOT_RUN'});
 for(const item of plan.mockCases){
  const dir=path.join(out,item.id);outputDirectory(item.id,true,true);
  activeRecord=null;activeChild=null;validationAttempted=false;
  save(item.id+'/started.json',{id:item.id,executionState:'RUNNING',expectedChildExitCode:item.expectedChildExitCode});
  caseStates[item.id]={id:item.id,executionState:'RUNNING',outerValidation:'NOT_VALIDATED'};
  // A deliberately absent parent gives ENOENT without permissions/OS tricks.
  const output=item.id==='reporter-write'?path.join(dir,'missing-parent/mocha.json'):path.join(dir,'mocha.json');
  launched++;
  const child=cp.spawnSync(process.execPath,[local.resolve('mocha/bin/mocha.js'),'--no-config','--no-package','--timeout','5000','--reporter',path.join(root,'test/evidence-reporter.cjs'),'--reporter-option','output='+output,path.join(root,'test/failure-evidence.mock.test.cjs')],{cwd:root,encoding:null,windowsHide:true,timeout:10000,maxBuffer:4*1024*1024,env:{...process.env,NODE_OPTIONS:'',LQC_EVIDENCE_MOCK_CASE:item.id,LQC_EVIDENCE_MOCK_DIR:dir}});
  const record={id:item.id,executionState:'EXECUTED',childExitCode:child.status,signal:child.signal,error:child.error?encode(child.error):null,expectedChildExitCode:item.expectedChildExitCode,classification:item.expectedClassification,outerValidation:'NOT_VALIDATED'};
  activeRecord=record;activeChild=child;caseStates[item.id]=record;
  const childRecordingErrors=[];
  for(const [name,bytes]of [['stdout.log',child.stdout??Buffer.alloc(0)],['stderr.log',child.stderr??Buffer.alloc(0)],['exit-code.json',Buffer.from(JSON.stringify(record,null,2)+'\n')]]){
   try{writeOutput(item.id+'/'+name,bytes);}catch(error){const entry={caseId:item.id,file:name,error:encode(error)};childRecordingErrors.push(entry);recordingErrors.push(entry);}
  }
  if(childRecordingErrors.length)throw Object.assign(new Error('MOCK_CHILD_RECORDING_FAILED'),{code:'MOCK_CHILD_RECORDING_FAILED',errors:childRecordingErrors});
  assert.equal(child.error,undefined,'MOCK_CHILD_PROCESS_ERROR');assert.equal(child.signal,null,'MOCK_CHILD_SIGNAL');assert.equal(child.status,item.expectedChildExitCode,'MOCK_CHILD_EXIT');
  if(item.id==='reporter-write'){
   const stderr=(child.stderr??Buffer.alloc(0)).toString('utf8'),marker='LQC_REPORTER_FAILURE\n';
   const at=stderr.indexOf(marker);assert(at>=0,'REPORTER_FALLBACK_MISSING');
   const encoded=JSON.parse(stderr.slice(at+marker.length)),g=graph(encoded);
   assert.equal(g.prop(encoded,'kind'),'reporter');
   assert.equal(g.prop(g.prop(encoded,'evidenceError'),'code'),'ENOENT');
   const failedReport=g.prop(encoded,'report');
   assert.equal(g.prop(g.prop(failedReport,'reporter'),'state'),'COMPLETE');
   assert.equal(g.prop(g.prop(failedReport,'stats'),'passes'),1);assert.equal(g.prop(g.prop(failedReport,'stats'),'failures'),0);
   assert(!fs.existsSync(output),'REPORTER_OUTPUT_MUST_NOT_BE_VALID_REPORT');
   record.rejectedAsReporterFailure=true;
   // Mocha 12 CLI overwrites exitCode at process exit; a zero CLI status is
   // insufficient for success. The real runner also requires a readable report.
  }else{
   const report=JSON.parse(fs.readFileSync(output));
   assert.equal(report.reporter.state,'COMPLETE');assert.equal(report.failures.length,1);assert.equal(report.stats.failures,1);
   assert.equal(report.tests.length,1);assert.equal(report.tests[0].fullTitle,'Failure evidence isolated mock controlled '+item.id);assert.equal(report.pending.length,0);
   const fail=report.failures[0],g=graph(fail.err),prop=g.prop;
   assert.equal(typeof prop(fail.err,'message'),'string');assert.equal(typeof prop(fail.err,'stack'),'string');
   if(['bigint','nested'].includes(item.id)){
    assert.deepEqual(fail.kinds,['test']);assert.equal(prop(fail.err,'code'),item.id==='bigint'?'MOCK_BIGINT':'MOCK_NESTED');
    const cause=prop(fail.err,'cause');assert.equal(prop(cause,'message'),'nested-many');
    assert.equal(prop(prop(cause,'cause'),'message'),'root-cause');
    const errors=prop(cause,'errors');assert.equal(prop(prop(errors,'0'),'code'),'NESTED_ONE');assert.equal(prop(prop(errors,'1'),'message'),'nested-two');
    if(item.id==='bigint'){
     assert.match(prop(fail.err,'message'),/BIGINT_EXACT/);
     assert.deepEqual(prop(fail.err,'actual'),{$type:'bigint',decimal:'900719925474099312345'});
     assert.deepEqual(prop(fail.err,'expected'),{$type:'bigint',decimal:'900719925474099312346'});
     assert.equal(prop(fail.err,'operator'),'strictEqual');
    }
   }else{
    const expected=item.id==='both'?['hook','evidence','cleanup']:['hook',item.id];assert.deepEqual(fail.kinds,expected);
    const identity=JSON.parse(fs.readFileSync(path.join(dir,'identity.json')));assert.deepEqual(identity,{firstSame:true,cleanupCalls:1});
    assert.equal(prop(fail.err,'code'),item.id==='cleanup'?'MOCK_CLEANUP':'MOCK_EVIDENCE');
    const failures=g.resolve(g.resolve(fail.err).finalization);assert(failures,'FINALIZATION_MISSING');
    assert.equal(prop(failures,'length'),item.id==='both'?2:1);
    const entry=prop(failures,'0');assert.equal(prop(entry,'kind'),item.id==='cleanup'?'cleanup':'evidence');
    assert.equal(prop(prop(entry,'error'),'code'),item.id==='cleanup'?'MOCK_CLEANUP':'MOCK_EVIDENCE');
    for(let i=0;i<prop(failures,'length');i++){
     const error=prop(prop(failures,String(i)),'error');assert.equal(typeof prop(error,'stack'),'string');
     assert.equal(prop(error,'message'),prop(error,'code')==='MOCK_CLEANUP'?'cleanup-failed':'evidence-write-failed');
     assert.equal(prop(prop(error,'cause'),'message'),prop(error,'code')==='MOCK_CLEANUP'?'cleanup-root':'nested-many');
    }
    if(item.id==='both')assert.equal(prop(prop(prop(failures,'1'),'error'),'code'),'MOCK_CLEANUP');
   }
  }
  record.outerValidation='PASS';validationAttempted=true;save(item.id+'/validated.json',record);results.push(record);activeRecord=null;activeChild=null;
 }
 assert.equal(launched,plan.mockCases.length);
}catch(error){
 primary=error;process.exitCode=1;
 if(activeRecord){activeRecord.outerValidation='FAIL';activeRecord.validationError=encode(error);if(!validationAttempted){validationAttempted=true;try{save(activeRecord.id+'/validated.json',activeRecord);}catch(recording){recordingErrors.push({file:activeRecord.id+'/validated.json',error:encode(recording)});}}}
 const failure={outerValidation:'FAIL',error:encode(error),child:childEvidence(),recordingErrors,launched,cases:caseStates,automaticRetry:false};
 try{assert(outReady&&!outputPathFailure,'MOCK_OUTPUT_UNAVAILABLE');save('failure.json',failure);}catch(recording){recordingErrors.push({file:'failure.json',error:encode(recording)});}
 try{fs.writeSync(2,JSON.stringify({failure,recordingErrors})+'\n');}catch{}
}finally{
 const summary={outerValidation:primary?'FAIL':'PASS',error:primary?encode(primary):null,cases:caseStates,results,recordingErrors,launched,anvilTests:0,amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
 try{assert(outReady&&!outputPathFailure,'MOCK_SUMMARY_OUTPUT_UNAVAILABLE');save('summary.json',summary);}catch(recording){process.exitCode=1;try{fs.writeSync(2,JSON.stringify({summary,child:childEvidence(),recording:encode(recording),outputPathFailure:outputPathFailure?encode(outputPathFailure):null})+'\n');}catch{}}
}
