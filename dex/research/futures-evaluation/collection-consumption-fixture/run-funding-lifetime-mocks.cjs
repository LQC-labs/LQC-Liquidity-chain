// One child importing the real FundingLifetime. No build or Anvil helper.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {checkedFile,checkedDirectory,createOutput,record,errorRecord}=require('./test/stored-tamper-io.cjs');
const root=__dirname,out='results/funding-lifetime-mocks',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const state={schema:'LQC_FUNDING_LIFETIME_RUN_1',state:'FAIL',execution:'NOT_RUN',calls:0,amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'},recordingErrors=[];
let primary,ready=false;
function save(name,value){try{record(root,out,name,value);}catch(error){recordingErrors.push({file:name,error:errorRecord(error)});}}
try{
 assert(!fs.existsSync(path.join(root,out)),'LIFETIME_PRIOR_RUN_EXISTS');createOutput(root,out);ready=true;
 assert.equal(process.version,'v22.23.3','LIFETIME_NODE_VERSION');assert.equal(process.argv.length,2,'LIFETIME_USAGE');
 const pins=JSON.parse(fs.readFileSync(checkedFile(root,'funding-lifetime-pins.json'))),bytes=fs.readFileSync(checkedFile(root,'funding-lifetime-plan.json')),plan=JSON.parse(bytes);
 assert.equal(hash(bytes),pins.planSHA256,'LIFETIME_PLAN_PIN');
 for(const [file,expected]of Object.entries(pins.sourceHashes))assert.equal(hash(fs.readFileSync(checkedFile(root,file))),expected,'LIFETIME_SOURCE_PIN:'+file);
 const expected=plan.cases.map(x=>x.id),titles=plan.cases.map(x=>x.title);assert.deepEqual(expected,['L01','L02','L03','L04','L05','L06','L07','L08','L09','L10','L11','L12']);assert.equal(new Set(expected).size,expected.length);assert.equal(new Set(titles).size,titles.length);
 save('preflight.json',{required:expected,titles,sourceHashes:pins.sourceHashes,target:plan.target,clockBudgets:plan.clockBudgets,automaticRetry:false});assert.equal(recordingErrors.length,0,'LIFETIME_PREFLIGHT_RECORDING');
 state.calls=1;state.execution='EXECUTED';
 const child=cp.spawnSync(process.execPath,['test/funding-lifetime-mocks.mjs',out],{cwd:root,encoding:null,timeout:plan.childTimeoutMs,maxBuffer:16*1024*1024,windowsHide:true,env:{...process.env,NODE_OPTIONS:''}});
 state.exitCode=child.status;state.signal=child.signal;state.spawnError=errorRecord(child.error);
 for(const [name,bytes]of [['stdout.log',child.stdout??Buffer.alloc(0)],['stderr.log',child.stderr??Buffer.alloc(0)]])try{checkedDirectory(root,out);fs.writeFileSync(path.join(root,out,name),bytes,{flag:'wx'});}catch(error){recordingErrors.push({file:name,error:errorRecord(error)});}
 save('exit-code.json',{exitCode:child.status,signal:child.signal,spawnError:errorRecord(child.error),calls:1,automaticRetry:false});
 assert.equal(child.status,0,'LIFETIME_CHILD_EXIT');assert(!child.error&&!child.signal,'LIFETIME_CHILD_TERMINATION');assert.equal(recordingErrors.length,0,'LIFETIME_RECORDING_FAILED');
 const report=JSON.parse(fs.readFileSync(checkedFile(root,out+'/cases.json')));assert.equal(report.state,'PASS');assert.deepEqual(report.required,expected);assert.deepEqual(report.actual,expected);assert.deepEqual(report.unique,expected);assert.deepEqual(report.notRun,[]);assert.deepEqual(report.unhandled,[]);assert.equal(report.cases.length,expected.length);
 for(const item of plan.cases){const actual=report.cases.find(x=>x.id===item.id);assert(actual);assert.equal(actual.title,item.title);assert.equal(actual.state,'PASS');assert.equal(actual.cleanup,'COMPLETE');assert.deepEqual(actual.checkpoints.map(x=>x.name),item.requiredCheckpoints);assert.equal(actual.afterCleanup.timers,0);assert.equal(actual.afterCleanup.abortListeners,0);assert.equal(actual.afterCleanup.pending,0);assert.equal(actual.afterCleanup.originalRestored,true);assert.deepEqual(actual,JSON.parse(fs.readFileSync(checkedFile(root,out+'/'+item.id+'.json'))));}
 for(const [file,expected]of Object.entries(pins.sourceHashes))assert.equal(hash(fs.readFileSync(checkedFile(root,file))),expected,'LIFETIME_SOURCE_CHANGED:'+file);
 assert.equal(hash(fs.readFileSync(checkedFile(root,'funding-lifetime-plan.json'))),pins.planSHA256,'LIFETIME_PLAN_CHANGED');
 state.state='PASS';state.required=expected;state.actual=report.actual;state.unique=report.unique;
}catch(error){primary=error;state.error=errorRecord(error);process.exitCode=1;}
finally{
 state.recordingErrors=recordingErrors;if(ready)save('runner-summary.json',state);
 if(recordingErrors.length)process.exitCode=1;
 if(primary||recordingErrors.length)try{fs.writeSync(2,JSON.stringify({primary:errorRecord(primary),recordingErrors,state})+'\n');}catch{}
}
