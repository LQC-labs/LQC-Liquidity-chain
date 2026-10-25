import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {ethers} from 'ethers';
import evidence from './failure-evidence.cjs';
import {PositiveFeeFixture,plain,independentExpectation} from './positive-fee-harness.mjs';
import {NormalEvidenceSession} from './normal-evidence-session.mjs';
import {observedSnapshot} from './normal-consumption-evidence.mjs';
import {verifyRepeatedStep,verifyRepeatedConsumption,FIXED_ABI_SHA256} from './verify-repeated-consumption.mjs';
import {performance} from 'node:perf_hooks';
import {FundingLifetime,F01_BUDGET} from './positive-funding-lifetime.mjs';

class FundingSession extends NormalEvidenceSession {
 constructor(f,deps,sequence){super(f,deps);this.step=sequence;}
 output(name){return super.output('step-'+this.step+'-'+name);} 
 save(...args){this.f.lifetime.checkRecord();return super.save(...args);}
 append(...args){this.f.lifetime.checkRecord();return super.append(...args);}
 start(){
  this.f.positiveObservation.started=true;this.f.positiveObservation.stage='STARTED';this.f.positiveObservation.collectionState='UNKNOWN';
  this.f.lifetime.record({kind:'positive-observation-attempt',caseId:'R01',state:'STARTED'});
  this.save('positive-started.json',{caseId:'R01',state:'STARTED',workBudgetMs:100000,writeBudgetMs:140000},false);
  this.journal=this.io.openSync(this.output('positive-queries.jsonl'),'wx');this.files.push('positive-queries.jsonl');
 }
}
const extraDefinitions=f=>[
 ['domain',f.core,'domain',[f.id]],
 ['longBasis',f.partial,'linkedBasis',[f.longPid]],['longExit',f.partial,'linkedExit',[f.longPid,2,true]],['longConsumed',f.partial,'linkedConsumed',[f.longPid]],
 ['longExposure',f.core,'coreExposureContext',[f.longPid]],['longMember',f.funding,'fundingSeriesMember',[f.id,1,1,f.L]],['longAttributed',f.attr,'accountEpoch',[f.id,f.L,1]],
 ['longShares',f.partial,'lpShares',[f.id,f.L]],['ownerShares',f.partial,'lpShares',[f.id,f.O]],['longOwnerAllowance',f.token,'allowance',[f.L,f.partial.target]],
 ['longLatest',f.coord,'latestIntegerSpecification',[f.longPid]],['longReturn',f.partial,'releasedReturnAvailable',[f.id,f.L]]
];
async function snapshot(f,record,side){
 // The shared observer contains getter/ABI capture only, no Funding-zero assertions.
 await observedSnapshot(f,record,side);const s=f.normalCollection,item=record[side],tag=item.startBlock.number;
 for(const [label,contract,method,args]of extraDefinitions(f)){
  const fragment=contract.interface.getFunction(method);
  const field=(x,index)=>({index,name:x.name||null,type:x.type,components:x.components?.map(field)??null,arrayChildren:x.arrayChildren?field(x.arrayChildren,0):null});
  const request={kind:'contract',label,address:contract.target,method:fragment.format('sighash'),args,blockTag:tag,blockHash:item.startBlock.hash,outputs:fragment.outputs.map(field)};
  item.queries[label]=request;item.snapshot[label]=plain(await s.observe(request,()=>contract.getFunction(method)(...args,{blockTag:tag})));
 }
 item.endBlock=await s.rpc('eth_getBlockByNumber',[tag,false]);assert.equal(item.endBlock.hash,item.startBlock.hash,'POSITIVE_SNAPSHOT_BLOCK_CHANGED');s.readTag=null;return item.snapshot;
}
const flags={amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
async function collect(f,s,record,sequence){
 try{
  record.sequence=BigInt(sequence);record.previousSpecification=f.previousSpecification;s.start();record.chainId=await s.rpc('eth_chainId',[]);record.domain=f.id;record.account=f.O;record.longPid=f.longPid;record.pid=f.pid;
  record.sequence=BigInt(sequence);record.specification=f.spec;record.previousSpecification=f.previousSpecification;record.intermediateTransactions=f.intermediateTransactions??[];record.abiSHA256=FIXED_ABI_SHA256;record.expectation=independentExpectation();record.transitions=f.transitions;record.timing={origin:f.origin,open:f.openTime,exit:f.exitTime};
  record.context={governance:f.G,other:f.L,plan:plain(f.plan),policyBasisHash:f.policyBasisHash,roles:{}};
  for(const role of ['core','funding','ledger','release','linked','partial','withdrawal','attr','coord','executor','token','market','collateral']){
   const address=f[role].target,original=f.runtimeRecords.find(x=>x.address===address);assert(original);record.context.roles[role]={name:original.name,address};
  }
  record.fieldMeanings={poolItems:['cash','lp','locked','free','pnl','funding','refund','fees','oi','active','base','shorts'].map((name,index)=>({index,name,type:'uint256'})),poolItemsSource:'PartialV11 partialPool return expression',receipt:'ordinary EVM transaction Receipt, not a consumption Receipt or terminal'};
  record.keys={};
  for(const [key,value,meaning]of [['positionKey',f.positionKey,'Executor execution key; not a position diagnostic key'],['accountKey',f.accountKey,'Funding collection key: Coordinator account key wrapped with epoch 1'],['epochKey',f.epochKey,'Coordinator/Domain/series/epoch/policy basis collection key'],['coordinatorAccountKey',f.plan.accountKey,'Coordinator account key'],['settlementId',f.seal.settlementId,'sealed settlement ID']])record.keys[key]={value,meaning};
  await snapshot(f,record,'before');record.controlBlock=record.before.startBlock;
  record.transactionState='UNKNOWN';s.txState='UNKNOWN';
  let sent;
  await s.observe({kind:'send-once',from:f.O,to:f.executor.target,input:f.executor.interface.encodeFunctionData('execute',[f.pid,f.spec,sequence]),retry:false},async()=>{
   sent=await f.executor.connect(f.owner).execute(f.pid,f.spec,sequence,{gasLimit:8000000n});
   record.transactionHash=sent.hash;record.transactionState='HASH_RETURNED';s.append({kind:'hash-before-receipt-wait',hash:sent.hash});return {hash:sent.hash};
  });
  const r=await s.wait(()=>f.setupReceipt(sent,{id:'R01-execute',operation:'execution',hash:sent.hash,submission:'HASH_RETURNED',receiptState:'NOT_QUERIED'}));record.transactionState='RECEIPT_RETURNED';s.txState='RECEIPT_RETURNED';
  record.transaction=await s.rpc('eth_getTransactionByHash',[r.hash]);record.receipt=await s.rpc('eth_getTransactionReceipt',[r.hash]);record.block=await s.rpc('eth_getBlockByHash',[r.blockHash,false]);
  await snapshot(f,record,'after');
  const events=record.receipt.logs.filter(x=>x.address.toLowerCase()===f.executor.target.toLowerCase()).map(x=>f.executor.interface.parseLog(x));assert.equal(events.length,1);assert.equal(events[0].name,'Collected');
  record.collected={amount:events[0].args.amount,meaning:'Funding cumulative increase; not total consumption'};record.status='COLLECTED';f.positiveObservation.stage='OBSERVED';
 }catch(error){s.fail('positive-operation',error);}
 s.finishQueries();Object.assign(record,{primary:s.primary,primaryKind:s.primaryKind,failures:s.failures.slice(),queryObservations:s.observations,sendCalls:s.sendCalls,pendingUnderlying:s.pending.size,transactionState:s.txState});
 try{
  const {file,bytes}=s.save('positive-fee.json',record);s.checkWrite();const reread=fs.readFileSync(file);assert.equal(reread.toString(),bytes,'POSITIVE_SAVED_BYTES');
  if(!s.hasPrimary){
   f.positiveObservation.validation='STARTED';
   try{
    const abi=fs.readFileSync(new URL('../normal-evidence-abi.json',import.meta.url));const result=verifyRepeatedStep(reread,abi);
    f.positiveObservation.validation='PASS';
    s.save('positive-validation.json',{caseId:'R01',state:'PASS',evidenceSHA256:crypto.createHash('sha256').update(reread).digest('hex'),...result});
   }catch(error){if(f.positiveObservation.validation!=='PASS')f.positiveObservation.validation='FAIL';throw error;}
  }
 }catch(error){s.fail('positive-save-reread',error);}
 s.end();
 f.positiveObservation.collectionState=s.hasPrimary?'FAILURE':'SUCCESS';
 try{s.save('positive-state.json',{caseId:'R01',state:f.positiveObservation.collectionState,observation:{...f.positiveObservation},transactionState:s.txState,pendingUnderlying:s.pending.size,...flags},false);}
 catch(error){s.fail('positive-state-save',error);f.positiveObservation.collectionState='FAILURE';}
 if(s.hasPrimary){try{s.save('positive-failure.json',{primary:s.primary,primaryKind:s.primaryKind,failures:s.failures,...flags});}catch(error){s.fail('positive-failure-save',error);}throw s.primary;}
}

describe('Repeated collection consumption',function(){
 this.timeout(F01_BUDGET.mocha);
 it('[R01] executes two cumulative budgets with Funding 10 plus 10 and fee 0 then 300',async function(){
  const directory=process.env.LQC_REPEATED_RESULT_DIR;assert(directory,'POSITIVE_RESULT_DIRECTORY_REQUIRED');
  let f,s,setupJournal;const steps=[],records=[];
  const life=new FundingLifetime(value=>{const bytes=Buffer.from(JSON.stringify(evidence.encode(value))+'\n');assert.equal(fs.writeSync(setupJournal,bytes),bytes.length,'SETUP_JOURNAL_SHORT_WRITE');});
  const save=(name,value)=>{life.checkRecord();fs.writeFileSync(directory+'/'+name,evidence.stringify(value),{flag:'wx'});};
  let record;
  const observation={started:false,stage:'NOT_STARTED',validation:'NOT_RUN',collectionState:'NOT_RUN'};
  try{
   save('case-started.json',{id:'R01',state:'STARTED',budgets:F01_BUDGET,...flags});setupJournal=fs.openSync(directory+'/setup.jsonl','wx');
   f=new PositiveFeeFixture(value=>life.record(value),life);
   f.positiveObservation=observation;
   const work=life.track(async()=>{
    await f.start();life.check();observation.started=true;observation.stage='STARTED';
    for(const sequence of [1,2]){
     assert(!f.collectionPoisoned,'REPEAT_PRIOR_TERMINATION_UNCONFIRMED');life.check();
     const previous=f.spec??ethers.ZeroHash;
     const budget=sequence===1?300010n:600320n,target=sequence===1?[300000n,10n,0n]:[600000n,20n,300n];
     const receipt1=await f.send(f.coord,'specifyCumulativeBudget',[f.pid,f.seal.settlementId,sequence,budget],f.owner);
     const receipt2=await f.send(f.coord,'recordIntegerSpecification',[f.pid,f.seal.settlementId,sequence,sequence===1?0:10],f.owner);
     f.previousSpecification=previous;f.spec=await f.coord.latestIntegerSpecification(f.pid);f.specs.add(f.spec);
     const q=await f.coord.collectionQuote(f.pid,f.spec);assert.deepEqual([q.pnl,q.funding,q.fee,q.budget,q.accountLimit,q.positionLimit],[...target,budget,20n,20n]);
     assert.equal((await f.executor.executions(f.positionKey)).sequence,BigInt(sequence-1));assert.equal(await f.executor.consumedSpecifications(f.spec),false);
     f.intermediateTransactions=[];
     if(sequence===2)for(const receipt of [receipt1,receipt2]){const transaction=await life.wait(()=>f.rpc.request({method:'eth_getTransactionByHash',params:[receipt.hash]})),raw=await life.wait(()=>f.rpc.request({method:'eth_getTransactionReceipt',params:[receipt.hash]})),block=await life.wait(()=>f.rpc.request({method:'eth_getBlockByHash',params:[receipt.blockHash,false]}));f.intermediateTransactions.push({transaction,receipt:raw,block});}
     record={schema:'LQC_REPEATED_STEP_1',status:'PARTIAL',...flags};records.push(record);
     const step={sequence,started:false,stage:'NOT_STARTED',validation:'NOT_RUN',collectionState:'NOT_RUN'};steps.push(step);
     f.positiveObservation=step;
     s=new FundingSession(f,{resultDirectory:()=>directory},sequence);life.session=s;f.normalCollection=s;
     const current=s;s.task=collect(f,s,record,sequence);s.task.then(()=>{current.settled=true;},()=>{current.settled=true;});await s.task;
     // Stop before creating a second session unless the first task and all raw work ended.
     await s.beforeRestore();assert.equal(f.rpc.request,life.guard);life.check();
    }
    const first=fs.readFileSync(directory+'/step-1-positive-fee.json'),second=fs.readFileSync(directory+'/step-2-positive-fee.json'),abi=fs.readFileSync(new URL('../normal-evidence-abi.json',import.meta.url));
    observation.stage='OBSERVED';observation.validation='STARTED';
    let verified;
    try{verified=verifyRepeatedConsumption(first,second,abi);observation.validation='PASS';}
    catch(error){observation.validation='FAIL';throw error;}
    save('repeated-validation.json',{id:'R01',state:'PASS',firstSHA256:crypto.createHash('sha256').update(first).digest('hex'),secondSHA256:crypto.createHash('sha256').update(second).digest('hex'),...verified});
    observation.started=true;observation.stage='OBSERVED';observation.validation='PASS';observation.collectionState='SUCCESS';
   });
   work.then(()=>{life.taskSettled=true;},error=>{life.taskSettled=true;life.fail('task',error);});
   await life.wait(()=>work);
  }catch(error){life.fail('operation',error);observation.collectionState='FAILURE';if(!f)life.taskSettled=true;}
  finally{
   const terminated=await life.drain();life.recordUntil=Math.min(life.recordUntil,performance.now()+F01_BUDGET.evidence);
   if(s){
    if(terminated&&f.rpc.request===s.guard)try{await s.beforeRestore();}catch(error){life.fail('session-restore',error);}
    s.end();
    for(const item of s.failures)if(!life.failures.some(x=>x.error===item.error))life.fail(item.kind,item.error);
   }
   // Save partial observations before cleanup; never overwrite the original journal.
   try{save('case-partial.json',{id:'R01',observation:{...observation},terminationConfirmed:terminated,steps:steps.map(x=>({...x})),partial:records,setupTransactions:f?.setupTransactions??[],transitions:f?.transitions??[],observations:life.observations,submissions:life.submissions,primary:life.primary,failures:life.failures,...flags});}catch(error){life.fail('partial-evidence',error);}
   life.seal(); // Late work can no longer write either session or setup evidence.
   if(setupJournal!==undefined)try{fs.closeSync(setupJournal);}catch(error){life.fail('setup-journal-close',error);}
   if(f)await life.cleanup(()=>f.stop());
   if(f&&!life.cleanupSucceeded)f.collectionPoisoned=true;
   if(terminated&&(!f||life.cleanupSucceeded)&&(!s||f.rpc.request===life.guard))try{life.restore();}catch(error){life.fail('guard-restore',error);}
   const terminalDeadline=performance.now()+F01_BUDGET.terminal;
   const terminalSave=(name,value,typed=true)=>{assert(performance.now()<terminalDeadline,'R01_TERMINAL_WRITE_DEADLINE');fs.writeFileSync(directory+'/'+name,typed?evidence.stringify(value):JSON.stringify(value,null,2)+'\n',{flag:'wx'});};
   try{terminalSave('case-state.json',{id:'R01',steps:steps.map(x=>({...x})),observation:{...observation},state:life.hasPrimary?'FAIL':'PASS',terminationConfirmed:terminated,cleanupSettled:life.cleanupSettled??true,...flags},false);}catch(error){life.fail('case-state-write',error);}
   if(life.hasPrimary)try{terminalSave('case-failure.json',{id:'R01',primary:life.primary,failures:life.failures,partial:records,steps:steps.map(x=>({...x})),terminationConfirmed:terminated,cleanupSettled:life.cleanupSettled??true,...flags});}catch(error){life.fail('failure-evidence',error);}
  }
  if(life.hasPrimary)throw life.primary;
 });
});
