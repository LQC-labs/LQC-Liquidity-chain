import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {ethers} from 'ethers';
import evidence from './failure-evidence.cjs';
import {assertConsumption} from './collection-harness.mjs';
import {expectedRuntime} from './runtime-tools.mjs';
import {NormalEvidenceSession} from './normal-evidence-session.mjs';
import {verifyStoredConsumption,decodeStored,abiField,FIXED_ABI_SHA256} from './verify-stored-consumption.mjs';

const plain=x=>Array.isArray(x)?Array.from(x,plain):x;
const poolFields=['cash','lp','locked','free','pnl','funding','refund','fees','oi','active','base','shorts'];
async function anchor(s){
 const selected=await s.rpc('eth_getBlockByNumber',['latest',false]);assert(selected?.number&&selected.hash,'OBSERVATION_BLOCK_REQUIRED');
 const fixed=await s.rpc('eth_getBlockByNumber',[selected.number,false]);assert.equal(fixed?.hash,selected.hash,'OBSERVATION_BLOCK_CHANGED');return fixed;
}
export async function observedSnapshot(f,record,key){
 const s=f.normalCollection,item=record[key]={snapshot:{},queries:{},contracts:[]};
 item.startBlock=await anchor(s);const tag=item.startBlock.number;s.readTag=tag;
 const roles=[['governance',f.G],['position-owner',f.O],['other-wallet',await f.other.getAddress()],['Core',f.core.target],['Partial',f.partial.target],['Funding',f.funding.target]];
 item.balanceItems=roles.map(([role,address],index)=>({index,role,address,token:f.token.target}));
 item.allowanceItems=roles.map(([role,owner],index)=>({index,role,owner,spender:f.funding.target,token:f.token.target}));
 item.specialAllowances={partialAllowance:{owner:f.partial.target,spender:f.funding.target,token:f.token.target},ownerAllowance:{owner:f.O,spender:f.partial.target,token:f.token.target}};
 for(const original of f.runtimeRecords){
  const code=await s.observe({kind:'runtime',address:original.address,blockTag:tag,blockHash:item.startBlock.hash},()=>s.rpc('eth_getCode',[original.address,tag]));
  assert.notEqual(code,'0x');item.contracts.push({name:original.name,address:original.address,runtimeHash:ethers.keccak256(code),runtimeCode:code,immutableValues:original.values,blockTag:tag,blockHash:item.startBlock.hash});
 }
 if(key==='before')record.contracts=item.contracts;
 const P=f.partial,F=f.funding,C=f.coord,E=f.executor;
 const definitions=[
  ['pool',P,'partialPool',[f.id]],['held',P,'linkedHeld',[f.id]],['basis',P,'linkedBasis',[f.pid]],['exit',P,'linkedExit',[f.pid,2,true]],['consumed',P,'linkedConsumed',[f.pid]],
  ['pending',P,'linkedPending',[f.id]],['reserved',P,'linkedFinalReserved',[f.id]],['shares',P,'lpShares',[f.id,f.G]],['totalShares',P,'lpTotalShares',[f.id]],['accounted',P,'tokenAccounted',[f.token.target]],['releases',P,'releases',[f.pid]],['returnAvailable',P,'releasedReturnAvailable',[f.id,f.O]],
  ['receiptState',P,'repeatReceiptState',[f.id,ethers.ZeroHash,ethers.ZeroHash]],['fundingPayout',F,'repeatPayoutState',[f.id,ethers.ZeroHash,ethers.ZeroHash]],['cash',F,'repeatCash',[f.epochKey]],['collected',F,'repeatAccountCollected',[f.accountKey]],['custody',F,'repeatCustody',[f.token.target]],
  ['partialAllowance',f.token,'allowance',[P.target,F.target]],['ownerAllowance',f.token,'allowance',[f.O,P.target]],['executor',E,'executions',[f.positionKey]],['sealed',C,'sealedPlan',[f.pid]],['latest',C,'latestIntegerSpecification',[f.pid]],['modeled',C,'modeledAccountFunding',[f.plan.accountKey,1]],['partialAuth',E,'partialAuthorization',[]],['fundingAuth',E,'fundingAuthorization',[]],['exposure',f.core,'coreExposureContext',[f.pid]],['epoch',F,'fundingSeriesEpoch',[f.id,1,1]],['member',F,'fundingSeriesMember',[f.id,1,1,f.O]],['attributed',f.attr,'accountEpoch',[f.id,f.O,1]]
 ];
 const read=async(label,contract,method,args)=>{
  const fragment=contract.interface.getFunction(method),request={kind:'contract',label,address:contract.target,method:fragment.format('sighash'),args,blockTag:tag,blockHash:item.startBlock.hash,outputs:fragment.outputs.map(abiField)};
  item.queries[label]=request;
  return plain(await s.observe(request,()=>contract.getFunction(method)(...args,{blockTag:tag})));
 };
 for(const [name,contract,method,args]of definitions)item.snapshot[name]=await read(name,contract,method,args);
 item.snapshot.balances=[];for(const x of item.balanceItems)item.snapshot.balances.push(await read('balances/'+x.index,f.token,'balanceOf',[x.address]));
 item.snapshot.allowances=[];for(const x of item.allowanceItems)item.snapshot.allowances.push(await read('allowances/'+x.index,f.token,'allowance',[x.owner,x.spender]));
 item.snapshot.specifications=[];
 for(const specification of [...f.specs].sort()){
  const entry=[specification];item.snapshot.specifications.push(entry);
  entry.push(await read('specifications/'+specification+'/used',E,'consumedSpecifications',[specification]));
  entry.push(await read('specifications/'+specification+'/integer',C,'integerSpecification',[specification]));
 }
 item.endBlock=await s.rpc('eth_getBlockByNumber',[tag,false]);assert.equal(item.startBlock.hash,item.endBlock?.hash,'SNAPSHOT_BLOCK_CHANGED');return item.snapshot;
}
// Separate live-fixture identity comparison; the offline verifier above never receives f.
function assertFixtureIdentity(saved,f){
 assert.equal(saved.domain,f.id);assert.equal(saved.pid,f.pid);assert.equal(saved.account,f.O);assert.equal(saved.specification,f.spec);
 assert.equal(saved.context.governance,f.G);assert.equal(saved.context.other,f.other.address);assert.equal(saved.context.policyBasisHash,f.collectionPolicyBasisHash);
 assert.deepEqual(saved.context.plan,plain(f.plan));
 for(const [role,item]of Object.entries(saved.context.roles))assert.equal(item.address,f[role].target);
 for(const key of ['positionKey','accountKey','epochKey'])assert.equal(saved.keys[key].value,f[key]);
 assert.equal(saved.keys.coordinatorAccountKey.value,f.plan.accountKey);assert.equal(saved.keys.settlementId.value,f.seal.settlementId);
 for(const item of saved.contracts){const original=f.runtimeRecords.find(x=>x.address===item.address&&x.name===item.name);assert(original);assert.deepEqual(Object.keys(item.immutableValues).sort(),Object.keys(original.values).sort());for(const name of Object.keys(original.values))assert.equal(item.immutableValues[name],original.values[name]);assert.equal(item.runtimeHash,ethers.keccak256(expectedRuntime(original.name,original.values)));}
 assertConsumption(f,{before:saved.before.snapshot,after:saved.after.snapshot,r:{logs:saved.receipt.logs}});
}
async function collectAndPreserve(f,s){
 const record={schema:'LQC_NORMAL_CONSUMPTION_1',amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED',status:'PARTIAL',contracts:[]};
 try{
  s.start();
  record.chainId=await s.rpc('eth_chainId',[]);record.domain=f.id;record.account=f.O;record.pid=f.pid;
  record.specification=f.spec;record.sequence=1n;record.abiSHA256=FIXED_ABI_SHA256;
  record.context={governance:f.G,other:f.other.address,plan:plain(f.plan),policyBasisHash:f.collectionPolicyBasisHash,roles:{}};
  for(const role of ['core','funding','ledger','release','linked','partial','withdrawal','attr','coord','executor','token','market','collateral']){const address=f[role].target,original=f.runtimeRecords.find(x=>x.address===address);assert(original);record.context.roles[role]={name:original.name,address};}
  record.fieldMeanings={domain:'Core Domain ID',account:'position owner wallet',pid:'Core exposure position ID',executor:['sequence','budget','pnl','funding','fee','specification'],poolLP:'partialPool fixed array index 1',poolItems:poolFields.map((name,index)=>({index,name,type:'uint256'})),poolItemsSource:'LocalFuturesPartialSettlement.partialPool return expression; these array element names are source-derived, not ABI tuple names',receipt:'ordinary EVM transaction receipt, not a dedicated consumption Receipt or terminal'};
  record.keys={positionKey:{value:f.positionKey,meaning:'Executor executions mapping key: context addresses and settlementId; not asserted equal to a position diagnostic key'},accountKey:{value:f.accountKey,meaning:'Funding collection account key: Coordinator plan.accountKey with series 1'},epochKey:{value:f.epochKey,meaning:'Funding collection epoch key: Coordinator, Domain, series 1, epoch 1, policy basisHash'},coordinatorAccountKey:{value:f.plan.accountKey,meaning:'Coordinator plan account key before series wrapping'},settlementId:{value:f.seal.settlementId,meaning:'Sealed settlement identity used by Executor context key'}};
  record.controlBlock=await anchor(s);s.readTag=record.controlBlock.number;
  await s.wait(()=>f.ready());s.readTag=null;
  const result=await f.execute(record,observedSnapshot); // Exactly the original C05 transaction.
  const events=record.receipt.logs.filter(x=>x.address.toLowerCase()===f.executor.target.toLowerCase()).map(x=>f.executor.interface.parseLog(x));
  assert.equal(events.length,1);assert.equal(events[0].name,'Collected');
  record.collected={amount:events[0].args.amount,meaning:'Funding cumulative increase; not total consumption'};
  assertConsumption(f,result);record.status='COLLECTED';
 }catch(error){s.fail('test-or-collection',error);}
 s.finishQueries();record.primary=s.primary;record.primaryKind=s.primaryKind;record.failures=s.failures.slice();record.queryObservations=s.observations;record.transactionState=s.txState;record.transactionHash??=s.transactionHash;record.sendCalls=s.sendCalls;record.pendingUnderlying=s.pending.size;
 try{
  const {file,bytes}=s.save('normal-consumption.json',record);s.checkWrite();
  const reread=fs.readFileSync(file);assert.equal(reread.toString('utf8'),bytes,'SAVED_BYTES_CHANGED');
  if(!s.failures.length){
   assert.equal(s.pending.size,0,'UNDERLYING_OPERATION_NOT_SETTLED');
   const fixedABIBytes=fs.readFileSync(new URL('../normal-evidence-abi.json',import.meta.url));
   const verified=verifyStoredConsumption(reread,fixedABIBytes);const values=verified.values;
   const saved=decodeStored(JSON.parse(reread));assertFixtureIdentity(saved,f);assert.equal(saved.status,'COLLECTED');
   s.save('normal-consumption-validation.json',{state:'PASS',evidenceSHA256:crypto.createHash('sha256').update(reread).digest('hex'),values,amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'});
  }
 }catch(error){s.fail('evidence-save-or-reread',error);}
 s.end();
 if(s.failures.length){
  try{s.save('normal-consumption-failure.json',{primary:s.primary,primaryKind:s.primaryKind,failures:s.failures.slice(),transactionState:s.txState,pendingUnderlying:s.pending.size,amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'});}catch{}
 }
 try{s.save('normal-consumption-state.json',{caseId:'C05',state:s.failures.length?'FAILURE':'SUCCESS',transactionState:s.txState,pendingUnderlying:s.pending.size,amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'},false);s.terminal=true;}catch{}
 if(s.failures.length){
  // Always throw the earliest failure; recording failures remain visible independently.
  const first=s.primary;
  try{Object.defineProperty(first,'normalConsumptionFailures',{value:s.failures.slice(),enumerable:true});}catch{}
  s.stderr({normalConsumptionFailures:s.failures});
  throw first;
 }
}
export function preserveNormalConsumption(f){
 const s=new NormalEvidenceSession(f);f.normalCollection=s;
 s.task=collectAndPreserve(f,s);s.task.then(()=>{s.settled=true;},error=>{s.settled=true;s.stderr({primary:error,failures:s.failures});});return s.task;
}
