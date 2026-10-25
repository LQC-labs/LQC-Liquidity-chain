import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {ethers} from 'ethers';
import evidence from './failure-evidence.cjs';
import io from './stored-tamper-io.cjs';
import {FundingLifetime,F01_BUDGET} from './positive-funding-lifetime.mjs';
import {LongPayoutFixture} from './long-payout-harness.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),flags={amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
let poisoned=false;
async function scenario(id,ready,operation){
 assert(!poisoned,'PRIOR_PAYOUT_TERMINATION_OR_CLEANUP_UNCONFIRMED');
 assert.equal(process.env.LQC_LONG_PAYOUT_RESULT_DIR,path.join(root,'results/long-payout'),'FIXED_RESULT_ROOT');
 const relative='results/long-payout/'+id,directory=io.createOutput(root,relative);
 let journal,f,result;const state={id,state:'STARTED',validation:'NOT_RUN',setup:'NOT_RUN',...flags};
 const life=new FundingLifetime(value=>{const bytes=Buffer.from(JSON.stringify(evidence.encode(value))+'\n');assert.equal(fs.writeSync(journal,bytes),bytes.length,'PAYOUT_JOURNAL_SHORT_WRITE');});
 const save=(name,value)=>{life.checkRecord();io.checkedDirectory(root,relative);fs.writeFileSync(path.join(directory,name),evidence.stringify(value),{flag:'wx'});};
 try{
  save('started.json',{id,state:'STARTED',budgets:F01_BUDGET,...flags});journal=fs.openSync(path.join(directory,'queries.jsonl'),'wx');
  f=new LongPayoutFixture(value=>life.record(value),life);
  const work=life.track(async()=>{
   state.setup='STARTED';await f.start();await f.prepareCollection();await f.preparePayout({ready});state.setup='PASS';
   state.validation='STARTED';result=await operation(f);
   assert.equal(await f.executor.partialAuthorization(),ethers.ZeroHash);assert.equal(await f.executor.fundingAuthorization(),ethers.ZeroHash);
   state.validation='PASS';save('validation.json',{id,state:'PASS',result,rejections:f.rejections(),meaning:'This case assertion result only; no RPC truth or whole-history proof',...flags});
  });
  work.then(()=>{life.taskSettled=true;},error=>{life.taskSettled=true;life.fail('task',error);});
  await life.wait(()=>work);
 }catch(error){life.fail('operation',error);if(state.validation==='STARTED')state.validation='FAIL';if(!f)life.taskSettled=true;}
 finally{
  const terminated=await life.drain();life.recordUntil=Math.min(life.recordUntil,performance.now()+F01_BUDGET.evidence);
  try{save('partial.json',{...state,terminationConfirmed:terminated,result,setupTransactions:f?.setupTransactions??[],transitions:f?.transitions??[],runtimeRecords:f?.runtimeRecords??[],snapshotObservations:f?.payoutObservations??[],paymentLinks:f?.paymentLinks??[],rpcObservations:life.observations,submissions:life.submissions,rejections:f?.rejections()??[],primary:life.primary,failures:life.failures});}catch(error){life.fail('partial-evidence',error);}
  life.seal();if(journal!==undefined)try{fs.closeSync(journal);}catch(error){life.fail('journal-close',error);}
  if(f)await life.cleanup(()=>f.stop());
  if(!terminated||(f&&!life.cleanupSucceeded)){poisoned=true;if(f)f.collectionPoisoned=true;}
  if(terminated&&(!f||life.cleanupSucceeded))try{life.restore();}catch(error){poisoned=true;life.fail('guard-restore',error);}
  const deadline=performance.now()+F01_BUDGET.terminal;
  const terminal=(name,value,typed)=>{assert(performance.now()<deadline,'PAYOUT_TERMINAL_DEADLINE');io.checkedDirectory(root,relative);fs.writeFileSync(path.join(directory,name),typed?evidence.stringify(value):JSON.stringify(value,null,2)+'\n',{flag:'wx'});};
  if(life.hasPrimary)try{terminal('failure.json',{...state,primary:life.primary,failures:life.failures,terminationConfirmed:terminated,cleanupSettled:life.cleanupSettled??true},true);}catch(error){life.fail('failure-evidence',error);}
  // Terminal state is last: earlier recording/cleanup failures cannot be hidden as PASS.
  state.state=life.hasPrimary?'FAIL':'PASS';
  try{terminal('state.json',{...state,terminationConfirmed:terminated,cleanupSettled:life.cleanupSettled??true,cleanupSucceeded:f?life.cleanupSucceeded:true,poisoned},false);}catch(error){life.fail('terminal-evidence',error);}
 }
 if(life.hasPrimary)throw life.primary;
}
const receive=f=>[f.id,f.preparation,1,1];
async function reject(f,{contract=f.partial,method='receiveRepeatFunding',args=receive(f),signer=f.other,error,origin,precondition}){
 // Bubble errors must be decoded using the peer ABI as well as the called ABI.
 // This retains the original call target/functions and the shared trace-origin check.
 const fragments=new Map(contract.interface.fragments.map(x=>[x.format('full'),x]));
 for(const peer of [f.payout,f.funding,f.partial])for(const fragment of peer.interface.fragments.filter(x=>x.type==='error'))fragments.set(fragment.format('full'),fragment);
 const called=new ethers.Contract(contract.target,[...fragments.values()],signer);
 await f.reject({contract:called,method,args,signer,error,origin,label:'PAYOUT_TARGET:'+error,precondition});
 return {error,origin,method,args,rejections:f.rejections()};
}
describe('LONG Funding protected receipt',function(){
 this.timeout(F01_BUDGET.mocha);this.retries(0);
 it('[P01] receives Funding 20 into protected Partial custody without user withdrawal',async()=>scenario('P01',true,async f=>{
  const result=await f.receive();assert.equal(result.after.fundingToken,0n);assert.equal(result.after.custody,0n);assert.equal(result.after.received[0],20n);return result;
 }));
 it('[P02] rejects a different owner at PayoutExecutor Pending atomically',async()=>scenario('P02',true,f=>reject(f,{signer:f.owner,error:'Pending',origin:f.payout.target,precondition:async()=>{assert.notEqual(f.O,f.L);assert.equal((await f.payout.preparations(f.preparation)).account,f.L);assert.equal((await f.payout.payoutReadiness(f.id)).ready,true);}})));
 it('[P03] rejects a forged preparation at PayoutExecutor Pending atomically',async()=>scenario('P03',true,f=>reject(f,{args:[f.id,ethers.id('UNKNOWN_PAYOUT_PREPARATION'),1,1],error:'Pending',origin:f.payout.target,precondition:async()=>{assert.equal((await f.payout.payoutReadiness(f.id)).ready,true);assert.equal((await f.payout.preparations(ethers.id('UNKNOWN_PAYOUT_PREPARATION'))).account,ethers.ZeroAddress);}})));
 it('[P04] rejects initial payment Sequence two at Funding Insufficient atomically',async()=>scenario('P04',true,f=>reject(f,{args:[f.id,f.preparation,2,1],error:'Insufficient',origin:f.funding.target,precondition:async()=>{assert.equal((await f.funding.repeatPayoutState(f.id,f.rights,ethers.ZeroHash)).account.sequence,0n);}})));
 it('[P05] rejects duplicate Sequence one between two legitimate 10 raw receipts atomically',async()=>scenario('P05',true,async f=>{
  const first=await f.receive(10n,1);
  const duplicate=await reject(f,{args:[f.id,f.preparation,1,10n],error:'Insufficient',origin:f.funding.target,precondition:async()=>{
   const state=await f.snapshot();
   assert.deepEqual(state.paid[0],[10n,0n,true]);assert.deepEqual(state.paid[1],[10n,1n,f.preparation,20n]);
   assert.equal(state.cash,20n);assert.equal(state.custody,10n);assert.equal(state.fundingToken,10n);
   assert.equal(state.received[2],true);assert.equal(state.received2[2],false);
   assert(10n+10n<=state.paid[1][3],'DUPLICATE_WITHIN_ACCOUNT_LIMIT');
   assert(state.paid[0][0]+state.paid[0][1]+10n<=state.cash,'DUPLICATE_WITHIN_EPOCH_LIMIT');
  }});
  const remainder=await f.receive(10n,2);
  assert.equal(remainder.after.paid[1][0],20n);assert.equal(remainder.after.paid[1][1],2n);
  assert.equal(remainder.after.fundingToken,0n);assert.equal(remainder.after.custody,0n);
  assert.equal(remainder.after.received[0],20n);assert.equal(remainder.after.received[1],20n);
  assert.equal(remainder.after.paid[2],first.after.paid[2],'FIRST_RECEIPT_UNCHANGED_AFTER_DUPLICATE_AND_REMAINDER');
  return {first,duplicate,remainder};
 }));
 it('[P06] rejects payment above the 20 raw ceiling at Funding Insufficient atomically',async()=>scenario('P06',true,f=>reject(f,{args:[f.id,f.preparation,1,21],error:'Insufficient',origin:f.funding.target,precondition:async()=>{assert.equal((await f.payout.payoutQuote(f.id,f.L,f.preparation)).limit,20n);assert.equal(await f.funding.repeatCash(f.epochKey),20n);}})));
 it('[P07] rejects unprepared creditor readiness at PayoutExecutor Pending atomically',async()=>scenario('P07',false,f=>reject(f,{args:[f.id,ethers.ZeroHash,1,1],error:'Pending',origin:f.payout.target,precondition:async()=>{const r=await f.payout.payoutReadiness(f.id);assert.equal(r.ready,false);assert.equal(r.generation,0n);assert.equal((await f.payoutSource.epochs(f.id)).denominator,20n);}})));
 it('[P08] rejects direct Funding payment at the partial caller Forbidden guard',async()=>scenario('P08',true,f=>reject(f,{contract:f.funding,method:'payRepeat',args:[f.id,f.L,f.preparation,1,1],error:'Forbidden',origin:f.funding.target,precondition:async()=>{assert.notEqual(f.L,f.partial.target);assert.equal(await f.core.localPartial(),f.partial.target);}})));
 it('[P09] rolls taxed token payment back at Funding TransferFailed atomically',async()=>scenario('P09',true,async f=>{await f.send(f.token,'setTaxed',[true]);return reject(f,{args:[f.id,f.preparation,1,20],error:'TransferFailed',origin:f.funding.target,precondition:async()=>{assert.equal((await f.payout.payoutReadiness(f.id)).ready,true);assert.equal(await f.token.balanceOf(f.funding.target),20n);}});}));
 it('[P10] rejects reused source specification at PayoutExecutor Duplicate atomically',async()=>scenario('P10',true,f=>reject(f,{contract:f.payout,method:'prepare',args:[f.id,f.payoutSpecId,2,f.preparation],error:'Duplicate',origin:f.payout.target,precondition:async()=>{assert.equal(await f.payout.preparedSpecifications(f.payoutSpecId),true);assert.equal((await f.funding.repeatPayoutState(f.id,f.rights,ethers.ZeroHash)).epoch.started,false);}})));
});
