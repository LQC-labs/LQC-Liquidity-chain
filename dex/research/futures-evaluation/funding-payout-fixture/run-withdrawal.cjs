// Standalone Linux one-shot runner. No compile/install/CI launch/retry.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),cp=require('node:child_process'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const io=require('./test/stored-tamper-io.cjs'),{validateBuild}=require('./build-common.cjs'),{stageWithdrawalArtifacts}=require('./collect-withdrawal-artifacts.cjs');
const root=__dirname,out='results/protected-withdrawal',sha=b=>crypto.createHash('sha256').update(b).digest('hex'),state={state:'FAIL',execution:'NOT_RUN',calls:0,required:[],actual:[],unique:[],notRun:[],automaticRetry:false,amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'},recordingErrors=[];
let ready=false,primary,plan,pins,report;
function save(name,value){try{io.record(root,out,name,value);}catch(error){recordingErrors.push({file:name,error:io.errorRecord(error)});}}
try{
 assert.equal(process.argv.length,2);assert.equal(process.platform,'linux');assert.equal(process.version,'v22.23.3');assert(!fs.existsSync(path.join(root,out)),'WITHDRAWAL_PRIOR_OUTPUT');io.createOutput(root,out);ready=true;
 pins=JSON.parse(fs.readFileSync(io.checkedFile(root,'withdrawal-pins.json')));const bytes=fs.readFileSync(io.checkedFile(root,'withdrawal-plan.json'));assert.equal(sha(bytes),pins.planSHA256,'WITHDRAWAL_PLAN_PIN');plan=JSON.parse(bytes);
 const sourceCheck=()=>{for(const [file,hash]of Object.entries(pins.sourceHashes))assert.equal(sha(fs.readFileSync(io.checkedFile(root,file))),hash,'WITHDRAWAL_SOURCE_PIN:'+file);};sourceCheck();
 state.required=plan.cases.map(x=>x.id);state.notRun=state.required.slice();assert.deepEqual(state.required,Array.from({length:9},(_,i)=>'W'+String(i+1).padStart(2,'0')),'WITHDRAWAL_FIXED_IDS');assert.deepEqual(state.required,plan.expectedIds);assert.equal(new Set(state.required).size,9);assert.equal(new Set(plan.cases.map(x=>x.fullTitle)).size,9);
 save('preflight.json',{sourceHashes:pins.sourceHashes,required:state.required,fullTitles:plan.cases.map(x=>x.fullTitle),buildState:'MUST_BE_SEPARATELY_REVIEWED',automaticRetry:false});assert.equal(recordingErrors.length,0);
 // NOT_GENERATED/null deliberately blocks before Mocha, ethers or Anvil imports.
 validateBuild(root);const local=createRequire(path.join(root,'package.json'));
 state.calls=1;state.execution='EXECUTED';
 const child=cp.spawnSync(process.execPath,[local.resolve('mocha/bin/mocha.js'),'--no-config','--no-package','--bail','--retries','0','--timeout','180000','--reporter',path.join(root,'test/evidence-reporter.cjs'),'--reporter-option','output='+path.join(root,out,'mocha.json'),path.join(root,'test/protected-withdrawal.test.mjs')],{cwd:root,encoding:null,timeout:plan.childTimeoutMs,maxBuffer:32*1024*1024,windowsHide:true,env:{...process.env,NODE_OPTIONS:'',LQC_PROTECTED_WITHDRAWAL_RESULT_DIR:path.join(root,out)}});
 state.exitCode=child.status;state.signal=child.signal;state.spawnError=io.errorRecord(child.error);
 for(const [name,bytes]of [['stdout.log',child.stdout??Buffer.alloc(0)],['stderr.log',child.stderr??Buffer.alloc(0)]])try{io.checkedDirectory(root,out);fs.writeFileSync(path.join(root,out,name),bytes,{flag:'wx'});}catch(error){recordingErrors.push({file:name,error:io.errorRecord(error)});}
 save('exit-code.json',{calls:1,exitCode:child.status,signal:child.signal,spawnError:io.errorRecord(child.error),automaticRetry:false});
 report=JSON.parse(fs.readFileSync(io.checkedFile(root,out+'/mocha.json')));const titles=plan.cases.map(x=>x.fullTitle),actual=report.tests.map(x=>x.fullTitle);
 state.actual=actual.map(title=>plan.cases.find(x=>x.fullTitle===title)?.id??title);state.unique=[...new Set(state.actual)];state.notRun=state.required.filter(id=>!state.actual.includes(id));
 assert.deepEqual(actual,titles,'WITHDRAWAL_EXACT_LIST');assert.equal(new Set(actual).size,actual.length,'WITHDRAWAL_DUPLICATE');assert.equal(report.reporter?.state,'COMPLETE');
 assert.equal(child.status,0,'WITHDRAWAL_CHILD_EXIT');assert(!child.error&&!child.signal,'WITHDRAWAL_CHILD_TERMINATION');assert.equal(report.stats.tests,9);assert.equal(report.stats.passes,9);assert.equal(report.stats.failures,0);assert.equal(report.stats.pending,0);
 assert.deepEqual(report.passes.map(x=>x.fullTitle),titles);assert.deepEqual(report.failures,[]);assert.deepEqual(report.pending,[]);sourceCheck();assert.equal(sha(fs.readFileSync(io.checkedFile(root,'withdrawal-plan.json'))),pins.planSHA256);assert.equal(recordingErrors.length,0,'WITHDRAWAL_RECORDING_FAILURE');state.state='PASS';
}catch(error){primary=error;state.error=io.errorRecord(error);process.exitCode=1;}
finally{
 state.recordingErrors=recordingErrors;if(ready)save('runner-summary.json',state);
 if(recordingErrors.length)process.exitCode=1;
 if(ready&&plan&&pins)try{const artifacts=stageWithdrawalArtifacts(root,plan,pins,state,report);if(artifacts.state!=='PASS')process.exitCode=1;save('artifact-summary.json',{state:state.state==='PASS'&&artifacts.state==='PASS'&&!recordingErrors.length?'PASS':'FAIL',runner:state.state,collection:artifacts.state,states:artifacts.states,errors:artifacts.errors});}catch(error){recordingErrors.push({file:'artifact-collection',error:io.errorRecord(error)});process.exitCode=1;save('artifact-summary.json',{state:'FAIL',runner:state.state,collection:'FAIL',primary:state.error??null,collectionError:io.errorRecord(error)});}
 if(recordingErrors.length)process.exitCode=1;
 if(primary||recordingErrors.length)try{fs.writeSync(2,JSON.stringify({primary:io.errorRecord(primary),recordingErrors,state})+'\n');}catch{}
}
