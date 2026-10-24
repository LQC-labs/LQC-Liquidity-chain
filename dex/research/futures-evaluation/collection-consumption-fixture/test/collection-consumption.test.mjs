import evidence from './failure-evidence.cjs';
import {assertNormalCollectionReady} from './normal-evidence-session.mjs';
import {preserveNormalConsumption} from './normal-consumption-evidence.mjs';
import assert from 'node:assert/strict';
import {ethers} from 'ethers';
import fs from 'node:fs';
import {CollectionFixture,assertConsumption,LOSS,W,outcomes,errors} from './collection-harness.mjs';
import {artifact,expectedRuntime} from './runtime-tools.mjs';

describe('Collection consumption fixture',function(){
 this.timeout(180000);
 let f,checkpoint;
 before(async()=>{f=new CollectionFixture();await f.start();});
 beforeEach(async()=>{assertNormalCollectionReady(f);checkpoint=await f.rpc.request({method:'evm_snapshot',params:[]});f.specs=new Set();f.spec=await f.specify();});
 afterEach(async function(){
  const collection=f.normalCollection;
  if(collection)this.timeout(20000);
  if(collection){f.collectionPoisoned=true;await collection.beforeRestore();}
  if(checkpoint){try{assert.equal(await f.rpc.request({method:'evm_revert',params:[checkpoint]}),true,'RESTORE_TEST_ISOLATION');checkpoint=null;}catch(error){f.collectionPoisoned=true;collection?.fail('cleanup-snapshot-restore',error);throw error;}}
  if(collection){f.normalCollection=null;f.collectionPoisoned=false;}
 });
 after(async()=>{
  await evidence.finalize(
   ()=>{if(process.env.LQC_COLLECTION_RESULT_DIR)fs.writeFileSync(process.env.LQC_COLLECTION_RESULT_DIR+'/rejection-evidence.json',evidence.stringify({outcomes,errors,amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'}),{flag:'wx'});},
   async()=>{if(f)await f.stop();}
  );
 });

 it('[C01] checks every deployed runtime and immutable against the reviewed output',async()=>{
  assert.equal(f.runtimeRecords.length,13,'12 contract types with two Oracle instances');
  assert.equal(new Set(f.runtimeRecords.map(x=>x.name)).size,12);
  for(const record of f.runtimeRecords){
   const actual=await f.provider.getCode(record.address),expected=expectedRuntime(record.name,record.values);assert.equal(actual.toLowerCase(),expected.toLowerCase(),record.name);
   const z=artifact(record.name),runtime=z.evm.deployedBytecode.object,refs=z.evm.deployedBytecode.immutableReferences,positions=Object.values(refs).flat().sort((a,b)=>a.start-b.start);
   for(let i=0;i<positions.length;i++){const r=positions[i];assert.equal(r.length,32);assert(r.start>=0&&r.start+r.length<=runtime.length/2);assert(/^0+$/.test(runtime.slice(r.start*2,(r.start+r.length)*2)));if(i)assert(r.start>=positions[i-1].start+positions[i-1].length,'NO_OVERLAP');}
  }
 });
 it('[C02] checks constructor nonce predictions and all deployment connections',async()=>{
  assert.equal(f.sequenceChecks.length,3);assert.equal(BigInt(f.sequenceChecks[1]),BigInt(f.sequenceChecks[0])+1n);assert.equal(BigInt(f.sequenceChecks[2]),BigInt(f.sequenceChecks[0])+2n);
  await f.connections();assert.equal(await f.token.decimals(),6n);assert.equal((await f.provider.getNetwork()).chainId,31337n);
 });
 it('[C03] confirms the ordinary policy epoch member and attribution prerequisites',async()=>{
  const d=await f.core.domain(f.id),policy=await f.coord.mockPolicy(f.id),epoch=(await f.funding.fundingSeriesEpoch(f.id,1,1))[0],member=await f.funding.fundingSeriesMember(f.id,1,1,f.O),basis=await f.partial.linkedBasis(f.pid),gap=await f.funding.policyGap(f.id,1,f.O,f.pid);
  assert.equal(d.state,1n);assert.equal(d.cfg.feeBps,0n);assert.equal(policy.mock.exitMarket18,12n*W/10n);assert.equal(policy.mock.exitCollateral18,W);assert.equal(policy.mock.exitTime,f.exitTime);assert.equal(policy.mock.calculationPolicy,await f.coord.CALCULATION_POLICY());
  assert.equal(policy.sid,1n);assert.equal(policy.origin,f.origin);assert.equal(policy.duration,100n);assert.equal(policy.epochs,1n);assert.equal(policy.fundingPolicy,d.cfg.policyDigest);assert.equal(policy.mock.fundingPrice18,W);assert.equal(policy.mock.observationTag,ethers.id('COLLECTION_SINGLE_SHORT_LOCAL'));assert.notEqual(policy.basisHash,ethers.ZeroHash);assert.equal(await f.funding.seriesInputMode(f.id,1),2n);
  assert.equal((await f.funding.fundingSeries(f.id,1))[0][5],0n);assert.equal(epoch[10],3n);assert.equal(epoch[6],epoch[7]);assert.equal(epoch[6],1n);assert.equal(member[3],1n);assert.equal(member[4],0n);assert.equal(member[6],0n);assert(member[5]>0n&&member[7]>0n);
  assert.equal(gap[1],true);assert.equal(gap[2],false);assert.equal((await f.attr.accountEpoch(f.id,f.O,1)).done,true);
  assert.equal(basis.initialSize,3n*W);assert.equal(basis.closed,basis.initialSize);assert.equal(basis.partials,0n);assert.equal(basis.sequence,2n);assert.equal(basis.entry,W);assert.equal(basis.margin,100000000n);assert.equal(basis.held,basis.margin);
  const exit=await f.partial.linkedExit(f.pid,2,true);assert.equal(exit.status,2n);assert.equal(exit.timestamp,f.exitTime);assert.equal(exit.market,12n*W/10n);assert.equal(exit.collateral,W);assert.equal(exit.marketTime,f.exitTime);assert.equal(exit.collateralTime,f.exitTime);assert.equal(exit.cutoff,f.origin+100n);
  const abi=ethers.AbiCoder.defaultAbiCoder(),key=ethers.keccak256(abi.encode(['address','address','uint256','uint256','address','uint256','bytes32'],[f.core.target,f.funding.target,f.id,1,f.O,f.pid,d.cfg.policyDigest]));assert.equal(basis.key,key);assert.equal(exit.receipt,ethers.keccak256(abi.encode(['bytes32','uint256','uint256','uint256','uint256','uint256','uint256'],[key,2,f.exitTime,0,3n*W,0,0])));
 });
 it('[C04] derives a 600000 raw PnL only integer specification through Coordinator',async()=>{
  const plan=await f.coord.plan(f.pid),seal=await f.coord.sealedPlan(f.pid),spec=await f.coord.integerSpecification(f.spec),q=await f.ready();
  assert.equal(plan.firstEpoch,1n);assert.equal(plan.lastEpoch,1n);assert.equal(plan.pnlLossRaw.n,LOSS);assert.equal(plan.pnlLossRaw.d,1n);
  for(const key of ['pnlGainRaw','fundingDebtRaw','fundingClaimRaw','feesRaw']){assert.equal(plan[key].n,0n);assert(plan[key].d>0n);}
  assert.equal(seal.step,1n);assert.equal(seal.budget,LOSS);assert.equal(seal.cumulative.allocationReserve,0n);assert.equal(seal.cumulative.fractionsPending,false);
  assert.equal(spec.specificationSequence,1n);assert.equal(spec.expectedActualExecutionSequence,0n);assert.equal(spec.actualReceiptConfirmed,false);assert.equal(spec.pnlTarget,LOSS);assert.equal(spec.fundingTarget,0n);assert.equal(spec.feeTarget,0n);assert.equal(q.budget,LOSS);
 });
 it('[C05] consumes PnL while preserving token balances custody allowances and LP shares',async()=>{await preserveNormalConsumption(f);});
 it('[C06] rejects a nonowner at Executor Forbidden without consuming the specification',async()=>{
  await f.reject({contract:f.executor,method:'execute',args:[f.pid,f.spec,1],signer:f.other,error:'Forbidden',origin:f.executor.target,label:'C06 owner guard',precondition:async()=>{const q=await f.ready();assert.notEqual(await f.other.getAddress(),q.owner);}});
 });
 it('[C07.1] rejects initial sequence zero at Executor Invalid',async()=>{
  await f.reject({contract:f.executor,method:'execute',args:[f.pid,f.spec,0],error:'Invalid',origin:f.executor.target,label:'C07.1 initial sequence zero',precondition:()=>f.ready()});
 });
 it('[C07.2] rejects initial sequence two at Executor Invalid',async()=>{
  await f.reject({contract:f.executor,method:'execute',args:[f.pid,f.spec,2],error:'Invalid',origin:f.executor.target,label:'C07.2 skipped sequence',precondition:()=>f.ready()});
 });
 it('[C08.1] rejects a consumed specification at Executor Forbidden',async()=>{
  await f.ready();assertConsumption(f,await f.execute());
  await f.reject({contract:f.executor,method:'execute',args:[f.pid,f.spec,2],error:'Forbidden',origin:f.executor.target,label:'C08.1 consumed specification guard',precondition:async()=>{assert.equal(await f.funding.collectionExecutor(),f.executor.target);assert.equal((await f.quote()).owner,f.O);assert.equal(await f.executor.consumedSpecifications(f.spec),true);assert.equal((await f.executor.executions(f.positionKey)).sequence,1n);}});
 });
 it('[C08.2] rejects a stale specification at Coordinator Forbidden before Executor guards',async()=>{
  const stale=f.spec,newest=await f.specify(2,LOSS+1n);
  await f.reject({contract:f.executor,method:'execute',args:[f.pid,stale,1],error:'Forbidden',origin:f.coord.target,label:'C08.2 collectionQuote latest specification guard',precondition:async()=>{await f.ready(newest);assert.notEqual(newest,stale);assert.equal(await f.executor.consumedSpecifications(stale),false);}});
 });
 it('[C08.3] rejects a specification for an unregistered pid at Coordinator Forbidden',async()=>{
  await f.reject({contract:f.executor,method:'execute',args:[0,f.spec,1],error:'Forbidden',origin:f.coord.target,label:'C08.3 collectionQuote pid binding',precondition:async()=>{await f.ready();assert.notEqual(f.pid,0n);assert.equal(await f.coord.latestIntegerSpecification(0),ethers.ZeroHash);}});
 });
 it('[C09.1] rejects direct Partial collection at its caller Forbidden guard',async()=>{
  await f.reject({contract:f.partial,method:'applyCollection',args:[f.pid,f.id,LOSS,0,0,f.accountKey,f.epochKey,0],error:'Forbidden',origin:f.partial.target,label:'C09.1 Partial sender guard not authorization hash mismatch',precondition:async()=>{await f.ready();assert.notEqual(f.O,await f.funding.collectionExecutor());assert.equal(await f.core.domainRegistry(),ethers.ZeroAddress);}});
 });
 it('[C09.2] rejects direct Funding collection at its partial caller Forbidden guard',async()=>{
  await f.reject({contract:f.funding,method:'collectRepeat',args:[f.id,f.accountKey,f.epochKey,1,0],error:'Forbidden',origin:f.funding.target,label:'C09.2 Funding _partialCaller not funding authorization hash mismatch',precondition:async()=>{await f.ready();assert.equal((await f.funding.repeatPayoutState(f.id,ethers.ZeroHash,ethers.ZeroHash)).epoch.started,false);assert.notEqual(f.O,await f.core.localPartial());}});
 });
 it('[C10.1] rejects an over held budget at Coordinator Invalid atomically',async()=>{
  await f.reject({contract:f.coord,method:'specifyCumulativeBudget',args:[f.pid,f.seal.settlementId,2,100000001],error:'Invalid',origin:f.coord.target,label:'C10.1 budget greater than seal limit',precondition:async()=>{await f.ready();const seal=await f.coord.sealedPlan(f.pid);assert.equal(seal.step,1n);assert.equal(seal.limit,100000000n);await f.coord.connect(f.owner).specifyCumulativeBudget.staticCall(f.pid,f.seal.settlementId,2,LOSS+1n);}});
 });
 it('[C10.2] rejects a wrong modeled account target at Coordinator Mismatch atomically',async()=>{
  await f.send(f.coord,'specifyCumulativeBudget',[f.pid,f.seal.settlementId,2,LOSS+1n],f.owner);
  const predicted=await f.coord.connect(f.owner).recordIntegerSpecification.staticCall(f.pid,f.seal.settlementId,2,0);f.specs.add(predicted);
  await f.reject({contract:f.coord,method:'recordIntegerSpecification',args:[f.pid,f.seal.settlementId,2,1],error:'Mismatch',origin:f.coord.target,label:'C10.2 expectedAccountTarget guard',precondition:async()=>{assert.equal(await f.coord.modeledAccountFunding(f.plan.accountKey,1),0n);assert.equal((await f.coord.sealedPlan(f.pid)).step,2n);assert.equal(await f.coord.connect(f.owner).recordIntegerSpecification.staticCall(f.pid,f.seal.settlementId,2,0),predicted);assert.equal(await f.executor.consumedSpecifications(predicted),false);}});
 });
 it('[C11] clears authorizations and makes no Funding or token mutating call',async()=>{
  await f.ready();const result=await f.execute();assertConsumption(f,result);await f.traceZeroFunding(result.r);await f.zeroAuth();
 });
 it('[C12] distinguishes Collected amount zero from aggregate consumption 600000',async()=>{
  await f.ready();const result=await f.execute();assertConsumption(f,result);
  const event=result.r.logs.filter(x=>x.address.toLowerCase()===f.executor.target.toLowerCase()).map(x=>f.executor.interface.parseLog(x))[0];assert.equal(event.args.amount,0n);assert.equal(result.after.consumed-result.before.consumed,LOSS);assert.notEqual(event.args.amount,LOSS);
 });
});
