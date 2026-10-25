const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {checkedFile,checkedDirectory,createOutput,record,errorRecord}=require('./test/stored-tamper-io.cjs');
const root=__dirname,out='results/f01-artifact-mocks',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const state={state:'FAIL',execution:'NOT_RUN',calls:0,automaticRetry:false,amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'},recordingErrors=[];let primary,ready=false;
const save=(name,value)=>{try{record(root,out,name,value);}catch(error){recordingErrors.push({file:name,error:errorRecord(error)});}};
function validate(report,plan){
 const ids=plan.cases.map(x=>x.id);assert.deepEqual(report.required,ids);assert.deepEqual(report.actual,ids);assert.equal(new Set(report.actual).size,ids.length);assert.deepEqual(report.unique,ids);assert.deepEqual(report.notRun,[]);assert.equal(report.state,'PASS');assert.equal(report.recordingErrors.length,0);assert.equal(report.cases.length,ids.length);
 for(let i=0;i<ids.length;i++){const item=report.cases[i];assert.equal(item.id,ids[i]);assert.equal(item.title,plan.cases[i].title);assert.equal(item.preparation,'READY');assert.equal(item.positiveControl,'PASS');assert.equal(item.originalReplay,'PASS');assert.equal(item.state,'PASS');}
}
try{
 assert.equal(process.argv.length,2);assert.equal(process.version,'v22.23.3');assert(!fs.existsSync(path.join(root,out)),'ARTIFACT_MOCK_PRIOR_RUN');createOutput(root,out);ready=true;
 const pins=JSON.parse(fs.readFileSync(checkedFile(root,'f01-artifact-mock-pins.json'))),bytes=fs.readFileSync(checkedFile(root,'f01-artifact-mock-plan.json')),plan=JSON.parse(bytes);assert.equal(hash(bytes),pins.planSHA256);
 for(const [file,expected]of Object.entries(pins.sourceHashes))assert.equal(hash(fs.readFileSync(checkedFile(root,file))),expected,'ARTIFACT_MOCK_SOURCE_PIN:'+file);
 assert.equal(new Set(plan.cases.map(x=>x.id)).size,plan.cases.length);assert.equal(new Set(plan.cases.map(x=>x.title)).size,plan.cases.length);
 save('preflight.json',{required:plan.cases.map(x=>x.id),titles:plan.cases.map(x=>x.title),sourceHashes:pins.sourceHashes,scope:'MEMORY_ARTIFACT_JUDGMENT_ONLY'});assert.equal(recordingErrors.length,0);
 state.calls=1;state.execution='EXECUTED';
 const child=cp.spawnSync(process.execPath,['test/f01-artifact-mocks.cjs',out],{cwd:root,encoding:null,windowsHide:true,timeout:plan.childTimeoutMs,maxBuffer:16*1024*1024,env:{...process.env,NODE_OPTIONS:''}});
 state.exitCode=child.status;state.signal=child.signal;state.spawnError=errorRecord(child.error);
 for(const [name,b]of [['stdout.log',child.stdout??Buffer.alloc(0)],['stderr.log',child.stderr??Buffer.alloc(0)]])try{checkedDirectory(root,out);fs.writeFileSync(path.join(root,out,name),b,{flag:'wx'});}catch(error){recordingErrors.push({file:name,error:errorRecord(error)});}
 save('exit-code.json',{exitCode:child.status,signal:child.signal,spawnError:errorRecord(child.error),calls:1,automaticRetry:false});
 const report=JSON.parse(fs.readFileSync(checkedFile(root,out+'/cases.json')));state.required=report.required;state.actual=report.actual;state.unique=report.unique;
 assert.equal(child.status,0,'ARTIFACT_MOCK_CHILD_EXIT');assert(!child.error&&!child.signal);validate(report,plan);
 for(const item of report.cases)assert.deepEqual(JSON.parse(fs.readFileSync(checkedFile(root,out+'/'+item.id+'.json'))),item,'CASE_FILE_REPORT_CONFLICT');
 for(const [file,expected]of Object.entries(pins.sourceHashes))assert.equal(hash(fs.readFileSync(checkedFile(root,file))),expected,'ARTIFACT_MOCK_SOURCE_CHANGED:'+file);
 assert.equal(hash(fs.readFileSync(checkedFile(root,'f01-artifact-mock-plan.json'))),pins.planSHA256);assert.equal(recordingErrors.length,0);state.state='PASS';
}catch(error){primary=error;state.error=errorRecord(error);process.exitCode=1;}
finally{state.recordingErrors=recordingErrors;if(ready)save('runner-summary.json',state);if(recordingErrors.length)process.exitCode=1;if(primary||recordingErrors.length)try{fs.writeSync(2,JSON.stringify({primary:errorRecord(primary),recordingErrors,state})+'\n');}catch{}}
