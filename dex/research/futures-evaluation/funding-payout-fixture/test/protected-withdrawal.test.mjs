import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {ethers} from 'ethers';
import evidence from './failure-evidence.cjs';
import io from './stored-tamper-io.cjs';
import {FundingLifetime,F01_BUDGET} from './positive-funding-lifetime.mjs';
import {ProtectedWithdrawalFixture} from './protected-withdrawal-harness.mjs';
import {decodeStoredGraph,verifyStoredWithdrawal} from './verify-protected-withdrawal.mjs';

const root=fileURLToPath(new URL('..',import.meta.url)),flags={amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
let poisoned=false;
async function scenario(id,configure,operation){
 assert(!poisoned,'PRIOR_WITHDRAWAL_TERMINATION_OR_CLEANUP_UNCONFIRMED');
 assert.equal(process.env.LQC_PROTECTED_WITHDRAWAL_RESULT_DIR,path.join(root,'results/protected-withdrawal'),'FIXED_RESULT_ROOT');
 const relative='results/protected-withdrawal/'+id,directory=io.createOutput(root,relative);
 let journal,f,result;const state={id,state:'STARTED',validation:'NOT_RUN',setup:'NOT_RUN',withdrawals:[],...flags};
 const life=new FundingLifetime(value=>{const bytes=Buffer.from(JSON.stringify(evidence.encode(value))+'\n');assert.equal(fs.writeSync(journal,bytes),bytes.length,'WITHDRAWAL_JOURNAL_SHORT_WRITE');});
 const save=(name,value)=>{life.checkRecord();io.checkedDirectory(root,relative);fs.writeFileSync(path.join(directory,name),evidence.stringify(value),{flag:'wx'});};
 try{
  save('started.json',{id,state:'STARTED',budgets:F01_BUDGET,...flags});journal=fs.openSync(path.join(directory,'queries.jsonl'),'wx');
  f=new ProtectedWithdrawalFixture(value=>life.record(value),life,{configure});
  const work=life.track(async()=>{
   state.setup='STARTED';await f.start();await f.beginWithdrawals();state.setup='PASS';
   state.validation='STARTED';result=await operation(f,async document=>{
    const name="withdrawal-"+(f.withdrawalDocuments.indexOf(document)+1)+".json",entry={document:name,validation:"NOT_RUN"};state.withdrawals.push(entry);save(name,document);
    const stored=fs.readFileSync(io.checkedFile(root,relative+"/"+name)),abiBytes=fs.readFileSync(io.checkedFile(root,"withdrawal-abi.json")),pins=JSON.parse(fs.readFileSync(io.checkedFile(root,"withdrawal-pins.json")));
    entry.validation="STARTED";const checked=verifyStoredWithdrawal(decodeStoredGraph(stored),abiBytes,pins.abiSHA256);
    save(name.replace(".json","-validation.json"),{...checked,evidenceSHA256:(await import("node:crypto")).createHash("sha256").update(stored).digest("hex")});entry.validation="PASS";return document;
   });
   assert.equal(await f.executor.partialAuthorization(),ethers.ZeroHash);assert.equal(await f.executor.fundingAuthorization(),ethers.ZeroHash);
   state.validation='PASS';save('validation.json',{id,state:'PASS',result,rejections:f.rejections(),meaning:'This case assertion result only; no RPC truth or whole-history proof',...flags});
  });
  work.then(()=>{life.taskSettled=true;},error=>{life.taskSettled=true;life.fail('task',error);});
  await life.wait(()=>work);
 }catch(error){life.fail('operation',error);if(state.validation==='STARTED')state.validation='FAIL';if(!f)life.taskSettled=true;}
 finally{
  const terminated=await life.drain();life.recordUntil=Math.min(life.recordUntil,performance.now()+F01_BUDGET.evidence);
  try{save('partial.json',{...state,terminationConfirmed:terminated,result,setupTransactions:f?.setupTransactions??[],transitions:f?.transitions??[],runtimeRecords:f?.runtimeRecords??[],snapshotObservations:f?.payoutObservations??[],paymentLinks:f?.paymentLinks??[],withdrawalDocuments:f?.withdrawalDocuments??[],withdrawalObservations:f?.withdrawalObservations??[],rpcObservations:life.observations,submissions:life.submissions,rejections:f?.rejections()??[],primary:life.primary,failures:life.failures});}catch(error){life.fail('partial-evidence',error);}
  life.seal();if(journal!==undefined)try{fs.closeSync(journal);}catch(error){life.fail('journal-close',error);}
  if(f)await life.cleanup(()=>f.stop());
  if(!terminated||(f&&!life.cleanupSucceeded)){poisoned=true;if(f)f.collectionPoisoned=true;}
  if(terminated&&(!f||life.cleanupSucceeded))try{life.restore();}catch(error){poisoned=true;life.fail('guard-restore',error);}
  const deadline=performance.now()+F01_BUDGET.terminal;
  const terminal=(name,value,typed)=>{assert(performance.now()<deadline,'WITHDRAWAL_TERMINAL_DEADLINE');io.checkedDirectory(root,relative);fs.writeFileSync(path.join(directory,name),typed?evidence.stringify(value):JSON.stringify(value,null,2)+'\n',{flag:'wx'});};
  if(life.hasPrimary)try{terminal('failure.json',{...state,primary:life.primary,failures:life.failures,terminationConfirmed:terminated,cleanupSettled:life.cleanupSettled??true},true);}catch(error){life.fail('failure-evidence',error);}
  // Terminal state is last: earlier recording/cleanup failures cannot be hidden as PASS.
  state.state=life.hasPrimary?'FAIL':'PASS';
  try{terminal('state.json',{...state,terminationConfirmed:terminated,cleanupSettled:life.cleanupSettled??true,cleanupSucceeded:f?life.cleanupSucceeded:true,poisoned},false);}catch(error){life.fail('terminal-evidence',error);}
 }
 if(life.hasPrimary)throw life.primary;
}

describe('LONG protected Funding user withdrawal',function(){
 this.timeout(F01_BUDGET.mocha);this.retries(0);
 it('[W01] withdraws the received 20 raw to the LONG owner with stored verification',async()=>scenario('W01',true,async(f,verify)=>verify(await f.withdraw())));
 it('[W02] rejects another owner at WithdrawalVerifier Forbidden atomically',async()=>scenario('W02',true,f=>f.rejectWithdrawal({signer:f.owner,error:'Forbidden',origin:f.withdrawal.target,precondition:async s=>{assert.equal(s.withdrawalState[2],20n);assert.notEqual(f.O,f.L);assert.equal(s.rights,f.rights);}})));
 it('[W03] rejects a forged key at WithdrawalVerifier Forbidden atomically',async()=>scenario('W03',true,f=>f.rejectWithdrawal({key:ethers.ZeroHash,error:'Forbidden',origin:f.withdrawal.target,precondition:async s=>{assert.equal(s.withdrawalState[2],20n);assert.notEqual(f.rights,ethers.ZeroHash);}})));
 it('[W04] rejects an unconfigured policy at Partial SettlementPending atomically',async()=>scenario('W04',false,f=>f.rejectWithdrawal({error:'SettlementPending',precondition:async s=>{assert.equal(s.withdrawalPolicy,ethers.ZeroHash);assert.equal(s.received[0],20n);}})));
 it('[W05] rejects zero amount at Partial SettlementPending atomically',async()=>scenario('W05',true,f=>f.rejectWithdrawal({amount:0n,error:'SettlementPending',precondition:async s=>{assert.equal(s.withdrawalState[2],20n);assert.equal(s.withdrawal[1],0n);}})));
 it('[W06] rejects initial Sequence two at Partial Insufficient atomically',async()=>scenario('W06',true,f=>f.rejectWithdrawal({sequence:2,error:'Insufficient',precondition:async s=>{assert.equal(s.withdrawalState[2],20n);assert.equal(s.withdrawal[1],0n);}})));
 it('[W07] rejects 21 raw above protection at Partial Insufficient atomically',async()=>scenario('W07',true,f=>f.rejectWithdrawal({amount:21n,error:'Insufficient',precondition:async s=>{assert.equal(s.withdrawalState[2],20n);assert.equal(s.withdrawalState[3],20n);assert.equal(s.paid[1][0],20n);}})));
 it('[W08] rolls taxed token withdrawal back at Partial TransferFailed atomically',async()=>scenario('W08',true,async f=>{await f.send(f.token,'setTaxed',[true]);return f.rejectWithdrawal({amount:20n,error:'TransferFailed',precondition:async s=>{assert.equal(await f.token.taxed(),true);assert.equal(s.withdrawalState[2],20n);assert(s.partialToken>=20n);}});}));
 it('[W09] rejects duplicate Sequence one between legitimate 10 raw withdrawals',async()=>scenario('W09',true,async(f,verify)=>{const first=await verify(await f.withdraw(10n,1));await f.rejectWithdrawal({amount:10n,sequence:1,error:'Insufficient',precondition:async s=>{assert.deepEqual(s.withdrawal,[10n,1n]);assert.equal(s.withdrawalState[2],10n);assert.equal(s.withdrawalState[3],10n);assert(10n+10n<=s.paid[1][0],'DUPLICATE_WITHIN_PAID_CEILING');assert(s.pool[5]>=10n);}});const second=await verify(await f.withdraw(10n,2));assert.equal(second.after.values.withdrawal[0],20n);assert.equal(second.after.values.withdrawalState[2],0n);assert.equal(second.after.values.longToken-first.before.values.longToken,20n);return {first,second};}));
});
