// Exactly one separate local research scenario. No compile/install/retry here.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const {checkedFile,checkedDirectory,createOutput,record,errorRecord}=require('./test/stored-tamper-io.cjs');
const {validateBuild}=require('./build-common.cjs');
const root=__dirname,out='results/positive-funding',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const state={state:'FAIL',execution:'NOT_RUN',calls:0,required:['F01'],actual:[],unique:[],automaticRetry:false,amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'},recordingErrors=[];
let primary,ready=false;
const save=(name,value)=>{try{record(root,out,name,value);}catch(error){recordingErrors.push({file:name,error:errorRecord(error)});}};
try{
 assert.equal(process.argv.length,2);assert.equal(process.platform,'linux');assert.equal(process.version,'v22.23.3');
 assert(!fs.existsSync(path.join(root,out)),'POSITIVE_PRIOR_RUN_EXISTS');createOutput(root,out);ready=true;
 const pins=JSON.parse(fs.readFileSync(checkedFile(root,'positive-funding-pins.json'))),bytes=fs.readFileSync(checkedFile(root,'positive-funding-plan.json')),plan=JSON.parse(bytes);
 assert.equal(hash(bytes),pins.planSHA256,'POSITIVE_PLAN_PIN');
 for(const [file,expected]of Object.entries(pins.sourceHashes))assert.equal(hash(fs.readFileSync(checkedFile(root,file))),expected,'POSITIVE_SOURCE_PIN:'+file);
 assert.deepEqual(plan.cases.map(x=>x.id),['F01']);assert.equal(new Set(plan.cases.map(x=>x.fullTitle)).size,1);validateBuild(root);
 save('preflight.json',{sourceHashes:pins.sourceHashes,required:state.required,fullTitles:plan.cases.map(x=>x.fullTitle),automaticRetry:false});assert.equal(recordingErrors.length,0);
 const requireLocal=createRequire(path.join(root,'package.json'));
 state.calls=1;state.execution='EXECUTED';
 const child=cp.spawnSync(process.execPath,[requireLocal.resolve('mocha/bin/mocha.js'),'--no-config','--no-package','--timeout','180000','--bail','--reporter',path.join(root,'test/evidence-reporter.cjs'),'--reporter-option','output='+path.join(root,out,'mocha.json'),path.join(root,'test/positive-funding.test.mjs')],{cwd:root,encoding:null,windowsHide:true,timeout:plan.childTimeoutMs,maxBuffer:16*1024*1024,env:{...process.env,NODE_OPTIONS:'',LQC_POSITIVE_RESULT_DIR:path.join(root,out)}});
 state.exitCode=child.status;state.signal=child.signal;state.spawnError=errorRecord(child.error);
 for(const [name,bytes]of [['stdout.log',child.stdout??Buffer.alloc(0)],['stderr.log',child.stderr??Buffer.alloc(0)]])try{checkedDirectory(root,out);fs.writeFileSync(path.join(root,out,name),bytes,{flag:'wx'});}catch(error){recordingErrors.push({file:name,error:errorRecord(error)});}
 save('exit-code.json',{exitCode:child.status,signal:child.signal,spawnError:errorRecord(child.error),calls:1,automaticRetry:false});
 const report=JSON.parse(fs.readFileSync(checkedFile(root,out+'/mocha.json'))),expected=plan.cases.map(x=>x.fullTitle),actual=report.tests.map(x=>x.fullTitle);
 state.actual=actual.map(title=>title===expected[0]?'F01':title);state.unique=[...new Set(state.actual)];
 assert.deepEqual(actual,expected,'POSITIVE_EXACT_LIST');assert.equal(new Set(actual).size,actual.length,'POSITIVE_DUPLICATE');
 assert.equal(child.status,0,'POSITIVE_CHILD_EXIT');assert(!child.error&&!child.signal);assert.equal(report.reporter?.state,'COMPLETE');
 assert.equal(report.stats.tests,1);assert.equal(report.stats.passes,1);assert.equal(report.stats.failures,0);assert.equal(report.stats.pending,0);
 assert.deepEqual(report.passes.map(x=>x.fullTitle),expected);assert.deepEqual(report.failures,[]);assert.deepEqual(report.pending,[]);
 for(const file of plan.artifacts.success)checkedFile(root,out+'/'+file);
 const terminal=JSON.parse(fs.readFileSync(checkedFile(root,out+'/case-state.json')));assert.equal(terminal.id,'F01');assert.equal(terminal.state,'PASS');
 const validation=JSON.parse(fs.readFileSync(checkedFile(root,out+'/positive-validation.json'))); // typed graph: independently checked in the test before success.
 assert(validation&&typeof validation==='object');
 for(const [file,expected]of Object.entries(pins.sourceHashes))assert.equal(hash(fs.readFileSync(checkedFile(root,file))),expected,'POSITIVE_SOURCE_CHANGED:'+file);
 assert.equal(hash(fs.readFileSync(checkedFile(root,'positive-funding-plan.json'))),pins.planSHA256);assert.equal(recordingErrors.length,0,'POSITIVE_RECORDING_FAILURE');state.state='PASS';
}catch(error){primary=error;state.error=errorRecord(error);process.exitCode=1;}
finally{
 state.recordingErrors=recordingErrors;if(ready)save('runner-summary.json',state);if(recordingErrors.length)process.exitCode=1;
 if(primary||recordingErrors.length)try{fs.writeSync(2,JSON.stringify({primary:errorRecord(primary),recordingErrors,state})+'\n');}catch{}
}
