// One stored-data child only. Never imports build/runtime helpers or starts Anvil.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {checkedFile,checkedInput,checkedDirectory,createOutput,record,errorRecord}=require('./test/stored-tamper-io.cjs');
const root=__dirname,out='results/positive-fee-tamper',hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const state={schema:'LQC_POSITIVE_FEE_TAMPER_RUN_1',state:'FAIL',calls:0,execution:'NOT_RUN',amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'},recordingErrors=[];
let primary,ready=false;
function save(name,value){try{record(root,out,name,value);}catch(error){recordingErrors.push({file:name,error:errorRecord(error)});}}
try{
 assert(!fs.existsSync(path.join(root,out)),'TAMPER_PRIOR_RUN_EXISTS');createOutput(root,out);ready=true;
 const pin=JSON.parse(fs.readFileSync(checkedFile(root,'positive-fee-tamper-pins.json'))),planBytes=fs.readFileSync(checkedFile(root,'positive-fee-tamper-plan.json')),plan=JSON.parse(planBytes);
 assert.equal(hash(planBytes),pin.planSHA256,'TAMPER_PLAN_PIN');
 for(const [file,expected]of Object.entries(pin.sourceHashes))assert.equal(hash(fs.readFileSync(checkedFile(root,file))),expected,'TAMPER_SOURCE_PIN:'+file);
 const required=plan.cases.map(x=>x.id);assert.equal(required.length,6);assert.equal(new Set(required).size,6);assert.equal(new Set(plan.cases.map(x=>x.title)).size,6);assert.deepEqual(required,Array.from({length:6},(_,i)=>'S'+String(i+1).padStart(2,'0')));
 assert.equal(process.version,'v22.23.3','POSITIVE_TAMPER_NODE');assert.equal(process.argv.length,2,'POSITIVE_TAMPER_USAGE');
 const prefix='results/positive-fee/',fundingPlan=JSON.parse(fs.readFileSync(checkedFile(root,'positive-fee-plan.json'))),fundingRunner=JSON.parse(fs.readFileSync(checkedFile(root,prefix+'runner-summary.json'))),terminal=JSON.parse(fs.readFileSync(checkedFile(root,prefix+'case-state.json')));
 assert.equal(fundingRunner.state,'PASS');assert.equal(fundingRunner.calls,1);assert.equal(fundingRunner.exitCode,0);assert.deepEqual(fundingRunner.recordingErrors,[]);for(const name of ['required','actual','unique'])assert.deepEqual(fundingRunner[name],['G01']);
 assert.equal(fundingPlan.cases.length,1);assert.equal(terminal.id,'G01');assert.equal(terminal.state,'PASS');assert.equal(terminal.terminationConfirmed,true);assert.equal(terminal.cleanupSettled,true);assert.deepEqual(terminal.observation,{started:true,stage:'OBSERVED',validation:'PASS',collectionState:'SUCCESS'});
 const input=checkedFile(root,prefix+'positive-fee.json'),abi=checkedFile(root,'normal-evidence-abi.json'),inputHash=hash(fs.readFileSync(input)),abiHash=hash(fs.readFileSync(abi));assert.equal(abiHash,plan.abiSHA256);
 // No CLI or historical fallback: consume only the successful G01 from this run.
 const preflight={required,requiredTitles:plan.cases.map(x=>x.title),inputSHA256:inputHash,abiSHA256:abiHash,sourceHashes:pin.sourceHashes,automaticRetry:false};save('preflight.json',preflight);assert.equal(recordingErrors.length,0,'TAMPER_PREFLIGHT_RECORDING');
 state.calls=1;state.execution='EXECUTED';
 const child=cp.spawnSync(process.execPath,['test/positive-fee-tamper.mjs',input,out],{cwd:root,encoding:null,timeout:plan.childTimeoutMs,maxBuffer:16*1024*1024,windowsHide:true,env:{...process.env,NODE_OPTIONS:''}});
 state.exitCode=child.status;state.signal=child.signal;state.spawnError=errorRecord(child.error);
 // Each sink is independent, even when another sink fails.
 for(const [name,bytes]of [['stdout.log',child.stdout??Buffer.alloc(0)],['stderr.log',child.stderr??Buffer.alloc(0)]])try{checkedDirectory(root,out);fs.writeFileSync(path.join(root,out,name),bytes,{flag:'wx'});}catch(error){recordingErrors.push({file:name,error:errorRecord(error)});}
 save('exit-code.json',{exitCode:child.status,signal:child.signal,spawnError:errorRecord(child.error),calls:1,automaticRetry:false});
 assert.equal(child.status,0,'TAMPER_CHILD_EXIT');assert(!child.error&&!child.signal,'TAMPER_CHILD_TERMINATION');assert.equal(recordingErrors.length,0,'TAMPER_RECORDING_FAILED');
 const report=JSON.parse(fs.readFileSync(checkedFile(root,out+'/cases.json')));assert.equal(report.state,'PASS');assert.deepEqual(report.required,required);assert.deepEqual(report.actual,required);assert.deepEqual(report.unique,required);assert.deepEqual(report.notRun,[]);assert.equal(report.cases.length,6);assert.equal(report.originalReplay,'PASS');
 for(const item of plan.cases){const result=report.cases.find(x=>x.id===item.id);assert(result);assert.equal(result.title,item.title);assert.equal(result.state,'PASS');assert.equal(result.preparation,'READY');assert.equal(result.target,item.targetMessage??null);assert.equal(result.assertionLine,item.assertionLine??null);const individual=JSON.parse(fs.readFileSync(checkedFile(root,out+'/'+item.id+'.json')));assert.deepEqual(individual,result);if(item.id!=='S01'){const mutation=JSON.parse(fs.readFileSync(checkedFile(root,out+'/'+item.id+'.mutation.json')));assert.equal(mutation.id,item.id);assert.equal(mutation.operations.length,item.operations,'TAMPER_MUTATION_COUNT');assert.equal(mutation.originalSHA256,inputHash);assert.deepEqual(mutation.operations,result.mutations);assert.equal(mutation.mutatedSHA256,result.mutatedSHA256);assert.equal(result.observed.code,'ERR_ASSERTION');if(item.targetMessage)assert.equal(result.observed.message.split('\n')[0],item.targetMessage);if(item.targetOperator)assert.equal(result.observed.operator,item.targetOperator);if(item.actualDecimal)assert.equal(result.observed.actual?.decimal,item.actualDecimal);if(item.expectedDecimal)assert.equal(result.observed.expected?.decimal,item.expectedDecimal);assert.equal(result.observed.assertionLocation,'verify-positive-fee.mjs:'+item.assertionLine+':');}}
 assert.equal(hash(fs.readFileSync(input)),inputHash,'TAMPER_ORIGINAL_CHANGED');assert.equal(hash(fs.readFileSync(abi)),abiHash,'TAMPER_ABI_CHANGED');
 for(const [file,expected]of Object.entries(pin.sourceHashes))assert.equal(hash(fs.readFileSync(checkedFile(root,file))),expected,'TAMPER_SOURCE_CHANGED:'+file);
 assert.equal(hash(fs.readFileSync(checkedFile(root,'positive-fee-tamper-plan.json'))),pin.planSHA256);
 state.state='PASS';state.required=required;state.actual=report.actual;state.unique=report.unique;state.originalReplay=report.originalReplay;
}catch(error){primary=error;state.error=errorRecord(error);process.exitCode=1;}
finally{
 state.recordingErrors=recordingErrors;
 if(ready)save('runner-summary.json',state);
 if(recordingErrors.length)process.exitCode=1;
 if(primary||recordingErrors.length)try{fs.writeSync(2,JSON.stringify({primary:errorRecord(primary),recordingErrors,state})+'\n');}catch{}
}
