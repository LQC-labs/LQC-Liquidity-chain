// One stored-data child only. Never imports build/runtime helpers or starts Anvil.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {checkedFile,checkedInput,checkedDirectory,createOutput,record,errorRecord}=require('./test/stored-tamper-io.cjs');
const root=__dirname,out='results/stored-tamper',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const state={schema:'LQC_STORED_TAMPER_RUN_1',state:'FAIL',calls:0,execution:'NOT_RUN',amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'},recordingErrors=[];
let primary,ready=false;
function save(name,value){try{record(root,out,name,value);}catch(error){recordingErrors.push({file:name,error:errorRecord(error)});}}
try{
 assert(!fs.existsSync(path.join(root,out)),'TAMPER_PRIOR_RUN_EXISTS');createOutput(root,out);ready=true;
 const pin=JSON.parse(fs.readFileSync(checkedFile(root,'stored-tamper-pins.json'))),planBytes=fs.readFileSync(checkedFile(root,'stored-tamper-plan.json')),plan=JSON.parse(planBytes);
 assert.equal(hash(planBytes),pin.planSHA256,'TAMPER_PLAN_PIN');
 for(const [file,expected]of Object.entries(pin.sourceHashes))assert.equal(hash(fs.readFileSync(checkedFile(root,file))),expected,'TAMPER_SOURCE_PIN:'+file);
 const required=plan.cases.map(x=>x.id);assert.equal(required.length,9);assert.equal(new Set(required).size,9);assert.equal(new Set(plan.cases.map(x=>x.title)).size,9);assert.deepEqual(required,['T01','T02','T03','T04','T05','T06','T07','T08','T09']);
 assert(process.argv.length<=3,'TAMPER_USAGE');const historicalInput=process.argv.length===3;let input=process.argv[2];
 if(!input){
  const dirs=fs.readdirSync(path.join(root,'results')).filter(x=>/^collection-\d+$/.test(x));assert.equal(dirs.length,1,'TAMPER_REQUIRES_ONE_EXISTING_ANVIL_RESULT');
  const prefix='results/'+dirs[0]+'/',summary=JSON.parse(fs.readFileSync(checkedFile(root,prefix+'validated-summary.json'))),terminal=JSON.parse(fs.readFileSync(checkedFile(root,prefix+'normal-consumption-state.json')));
  assert.equal(summary.stats.tests,17);assert.equal(summary.stats.passes,17);assert.equal(summary.stats.failures,0);assert.equal(summary.stats.pending,0);assert.equal(summary.actual.length,17);assert.equal(new Set(summary.actual).size,17);
  const oldPlan=JSON.parse(fs.readFileSync(checkedFile(root,'test-plan.json')));assert.deepEqual([...summary.actual].sort(),[...oldPlan.fullTitles].sort());
  assert.equal(terminal.state,'SUCCESS');assert.equal(terminal.pendingUnderlying,0);input=checkedFile(root,prefix+'normal-consumption.json');
 }
 input=checkedInput(input);const abi=checkedFile(root,'normal-evidence-abi.json'),inputHash=hash(fs.readFileSync(input)),abiHash=hash(fs.readFileSync(abi));assert.equal(abiHash,plan.abiSHA256);
 if(historicalInput)assert.equal(inputHash,plan.referenceInput.sha256,'HISTORICAL_C05_INPUT_PIN');
 const preflight={required,requiredTitles:plan.cases.map(x=>x.title),inputSHA256:inputHash,abiSHA256:abiHash,sourceHashes:pin.sourceHashes,automaticRetry:false};save('preflight.json',preflight);assert.equal(recordingErrors.length,0,'TAMPER_PREFLIGHT_RECORDING');
 state.calls=1;state.execution='EXECUTED';
 const child=cp.spawnSync(process.execPath,['test/stored-consumption-tamper.mjs',input,out],{cwd:root,encoding:null,timeout:plan.childTimeoutMs,maxBuffer:16*1024*1024,windowsHide:true,env:{...process.env,NODE_OPTIONS:''}});
 state.exitCode=child.status;state.signal=child.signal;state.spawnError=errorRecord(child.error);
 // Each sink is independent, even when another sink fails.
 for(const [name,bytes]of [['stdout.log',child.stdout??Buffer.alloc(0)],['stderr.log',child.stderr??Buffer.alloc(0)]])try{checkedDirectory(root,out);fs.writeFileSync(path.join(root,out,name),bytes,{flag:'wx'});}catch(error){recordingErrors.push({file:name,error:errorRecord(error)});}
 save('exit-code.json',{exitCode:child.status,signal:child.signal,spawnError:errorRecord(child.error),calls:1,automaticRetry:false});
 assert.equal(child.status,0,'TAMPER_CHILD_EXIT');assert(!child.error&&!child.signal,'TAMPER_CHILD_TERMINATION');assert.equal(recordingErrors.length,0,'TAMPER_RECORDING_FAILED');
 const report=JSON.parse(fs.readFileSync(checkedFile(root,out+'/cases.json')));assert.equal(report.state,'PASS');assert.deepEqual(report.required,required);assert.deepEqual(report.actual,required);assert.deepEqual(report.unique,required);assert.deepEqual(report.notRun,[]);assert.equal(report.cases.length,9);assert.equal(report.originalReplay,'PASS');
 for(const item of plan.cases){const result=report.cases.find(x=>x.id===item.id);assert(result);assert.equal(result.title,item.title);assert.equal(result.state,'PASS');assert.equal(result.preparation,'READY');assert.equal(result.target,item.targetMessage??null);assert.equal(result.assertionLine,item.assertionLine??null);const individual=JSON.parse(fs.readFileSync(checkedFile(root,out+'/'+item.id+'.json')));assert.deepEqual(individual,result);if(item.id!=='T01'){const mutation=JSON.parse(fs.readFileSync(checkedFile(root,out+'/'+item.id+'.mutation.json')));assert.equal(mutation.id,item.id);assert.equal(mutation.originalSHA256,inputHash);assert.deepEqual(mutation.operations,result.mutations);assert.equal(mutation.mutatedSHA256,result.mutatedSHA256);assert.equal(result.observed.code,'ERR_ASSERTION');assert.equal(result.observed.message.split('\n')[0],item.targetMessage);assert.equal(result.observed.assertionLocation,'verify-stored-consumption.mjs:'+item.assertionLine+':');}}
 assert.equal(hash(fs.readFileSync(input)),inputHash,'TAMPER_ORIGINAL_CHANGED');assert.equal(hash(fs.readFileSync(abi)),abiHash,'TAMPER_ABI_CHANGED');
 for(const [file,expected]of Object.entries(pin.sourceHashes))assert.equal(hash(fs.readFileSync(checkedFile(root,file))),expected,'TAMPER_SOURCE_CHANGED:'+file);
 assert.equal(hash(fs.readFileSync(checkedFile(root,'stored-tamper-plan.json'))),pin.planSHA256);
 state.state='PASS';state.required=required;state.actual=report.actual;state.unique=report.unique;state.originalReplay=report.originalReplay;
}catch(error){primary=error;state.error=errorRecord(error);process.exitCode=1;}
finally{
 state.recordingErrors=recordingErrors;
 if(ready)save('runner-summary.json',state);
 if(recordingErrors.length)process.exitCode=1;
 if(primary||recordingErrors.length)try{fs.writeSync(2,JSON.stringify({primary:errorRecord(primary),recordingErrors,state})+'\n');}catch{}
}
