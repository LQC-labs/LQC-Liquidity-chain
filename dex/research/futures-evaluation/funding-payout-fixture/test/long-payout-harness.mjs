import assert from 'node:assert/strict';
import {ethers} from 'ethers';
import {PositiveFundingFixture,plain} from './positive-funding-harness.mjs';
import {outcomes} from './collection-harness.mjs';

const abi=ethers.AbiCoder.defaultAbiCoder(),Z=ethers.ZeroHash;
export class LongPayoutFixture extends PositiveFundingFixture {
 constructor(progress,lifetime){super(progress,lifetime);this.payoutObservations=[];this.paymentLinks=[];this.rejectionStart=outcomes.length;}
 async deployAll(){
  await super.deployAll();
  this.payoutSource=await this.deploy('LocalFuturesPayoutSpecification',[this.coord.target]);
  const peers={coordinator:this.coord.target,core:this.core.target,funding:this.funding.target,partialSettlement:this.partial.target,attribution:this.attr.target};
  await this.code(this.payoutSource,'LocalFuturesPayoutSpecification',peers);
  this.payout=await this.deploy('LocalFuturesPayoutExecutor',[this.payoutSource.target]);
  const contextHash=ethers.keccak256(abi.encode(['uint256',...Array(6).fill('address')],[31337,this.core.target,this.funding.target,this.partial.target,this.coord.target,this.attr.target,this.payoutSource.target]));
  await this.code(this.payout,'LocalFuturesPayoutExecutor',{...peers,payoutSpecification:this.payoutSource.target,contextHash});
  // Governance binds payout only after Core/Partial/Attribution/Coordinator/Collector bindings.
  assert.equal(await this.core.governance(),this.G);assert.equal(await this.core.domainRegistry(),ethers.ZeroAddress);
  assert.equal(await this.funding.collectionExecutor(),this.executor.target);
  await this.send(this.funding,'bindPayoutExecutor',[this.payout.target],this.gov);
  assert.equal(await this.funding.payoutExecutor(),this.payout.target);
  assert.equal(await this.funding.payoutSpecification(),this.payoutSource.target);
 }
 async prepareCollection(){
  await this.specifyPositive();
  // LONG needs its own normal plan/seal; SHORT's plan never substitutes for it.
  await this.send(this.coord,'recordPlan',[this.longPid]);this.longPlan=await this.coord.plan(this.longPid);
  assert.equal(this.longPlan.fundingClaimRaw.n,20n*this.longPlan.fundingClaimRaw.d);
  assert.equal(this.longPlan.fundingDebtRaw.n,0n);assert.equal(this.longPlan.pnlLossRaw.n,0n);assert.equal(this.longPlan.feesRaw.n,0n);
  await this.send(this.coord,'sealPlan',[this.longPid,this.longPlan.id],this.other);
  this.rights=await this.payout.rightsKey(this.id,this.L);
  this.paymentReceipt=ethers.keccak256(abi.encode(['bytes32','uint256'],[this.rights,1]));
  this.paymentReceipt2=ethers.keccak256(abi.encode(['bytes32','uint256'],[this.rights,2]));
  const before=await this.snapshot();
  this.collectionReceipt=await this.send(this.executor,'execute',[this.pid,this.spec,1],this.owner);
  const after=await this.snapshot();
  assert.deepEqual(after.execution,[1n,600020n,600000n,20n,0n,this.spec]);
  assert.equal(after.consumed-before.consumed,600020n);assert.equal(before.held-after.held,600020n);
  assert.equal(after.pool[1]-before.pool[1],600000n);assert.equal(after.cash-before.cash,20n);
  assert.equal(after.fundingToken-before.fundingToken,20n);assert.equal(after.collected-before.collected,20n);
  assert.equal(after.custody-before.custody,20n);assert.equal(before.partialToken-after.partialToken,20n);
  assert.equal(before.pool[0]-after.pool[0],20n);assert.equal(before.accounted-after.accounted,20n);
  assert.equal(before.pool[7],after.pool[7]);
  const logs=this.collectionReceipt.logs.filter(x=>x.address.toLowerCase()===this.executor.target.toLowerCase()).map(x=>this.executor.interface.parseLog(x));
  assert.equal(logs.length,1);assert.equal(logs[0].name,'Collected');assert.equal(logs[0].args.amount,20n);
  this.progress({kind:'COLLECTION_EXISTING_SEMANTICS',transactionHash:this.collectionReceipt.hash,components:[600000n,20n,0n],total:600020n,collectedAmount:20n,meaning:'Collected is Funding increase, not all-component consumption; ordinary transaction Receipt is not a consumption Receipt'});
 }
 async preparePayout({ready=true}={}){
  await this.send(this.payoutSource,'begin',[this.id,4],this.gov);
  for(const [who,pid]of [[this.O,this.pid],[this.L,this.longPid]])await this.send(this.payoutSource,'verifyMember',[this.id,who,[pid]],this.gov);
  await this.send(this.payoutSource,'sealDenominator',[this.id],this.gov);
  const e=await this.payoutSource.epochs(this.id);
  assert.equal(e.participants,2n);assert.equal(e.verified,2n);assert.equal(e.denominator,20n);assert.equal(e.debt,20n);assert.equal(e.claims,20n);assert.equal(e.sealed_,true);
  assert.equal((await this.payoutSource.members(this.id,this.O)).claim,0n);
  assert.equal((await this.payoutSource.members(this.id,this.L)).claim,20n);
  if(!ready){assert.equal((await this.payout.payoutReadiness(this.id)).ready,false);return;}
  await this.send(this.payoutSource,'specify',[this.id,1,Z],this.other);
  this.payoutSpecId=(await this.payoutSource.members(this.id,this.L)).latest;
  await this.send(this.payout,'prepare',[this.id,this.payoutSpecId,1,Z],this.other);
  this.preparation=(await this.payout.progression(this.rights)).latestPreparation;
  const q=await this.payout.payoutQuote(this.id,this.L,this.preparation),r=await this.payout.payoutReadiness(this.id);
  assert.equal(q.rightsKey,this.rights);assert.equal(q.epochKey,this.epochKey);assert.equal(q.claim,20n);assert.equal(q.denominator,20n);assert.equal(q.limit,20n);assert.equal(q.collected,20n);
  assert.equal(r.ready,true);assert.equal(r.round.preparedClaims,20n);assert.equal(r.round.preparedAccounts,1n);
 }
 definitions(){return [
  ['pool',this.partial,'partialPool',[this.id]],['held',this.partial,'linkedHeld',[this.id]],['pending',this.partial,'linkedPending',[this.id]],['final',this.partial,'linkedFinalReserved',[this.id]],
  ['accounted',this.partial,'tokenAccounted',[this.token.target]],['lpShares',this.partial,'lpShares',[this.id,this.G]],['shortLpShares',this.partial,'lpShares',[this.id,this.O]],['longLpShares',this.partial,'lpShares',[this.id,this.L]],['lpTotal',this.partial,'lpTotalShares',[this.id]],
  ['partialToken',this.token,'balanceOf',[this.partial.target]],['fundingToken',this.token,'balanceOf',[this.funding.target]],['governanceToken',this.token,'balanceOf',[this.G]],['shortToken',this.token,'balanceOf',[this.O]],['longToken',this.token,'balanceOf',[this.L]],
  ['partialAllowance',this.token,'allowance',[this.partial.target,this.funding.target]],['shortAllowance',this.token,'allowance',[this.O,this.partial.target]],['longAllowance',this.token,'allowance',[this.L,this.partial.target]],
  ['partialAuth',this.executor,'partialAuthorization',[]],['fundingAuth',this.executor,'fundingAuthorization',[]],['execution',this.executor,'executions',[this.positionKey]],['consumed',this.partial,'linkedConsumed',[this.pid]],['longConsumed',this.partial,'linkedConsumed',[this.longPid]],
  ['shortRelease',this.partial,'releases',[this.pid]],['longRelease',this.partial,'releases',[this.longPid]],['shortReturn',this.partial,'releasedReturnAvailable',[this.id,this.O]],['longReturn',this.partial,'releasedReturnAvailable',[this.id,this.L]],
  ['cash',this.funding,'repeatCash',[this.epochKey]],['collected',this.funding,'repeatAccountCollected',[this.accountKey]],['custody',this.funding,'repeatCustody',[this.token.target]],
  ['paid',this.funding,'repeatPayoutState',[this.id,this.rights,this.paymentReceipt]],['received',this.partial,'repeatReceiptState',[this.id,this.rights,this.paymentReceipt]],
  ['paid2',this.funding,'repeatPayoutState',[this.id,this.rights,this.paymentReceipt2]],['received2',this.partial,'repeatReceiptState',[this.id,this.rights,this.paymentReceipt2]],
  ['sourceEpoch',this.payoutSource,'epochs',[this.id]],['shortMember',this.payoutSource,'members',[this.id,this.O]],['longMember',this.payoutSource,'members',[this.id,this.L]],
  ['sourceSpec',this.payoutSource,'specifications',[this.payoutSpecId??Z]],['progression',this.payout,'progression',[this.rights]],['preparation',this.payout,'preparations',[this.preparation??Z]],['preparedUsed',this.payout,'preparedSpecifications',[this.payoutSpecId??Z]],
  ['latest',this.coord,'latestIntegerSpecification',[this.pid]],['integerUsed',this.executor,'consumedSpecifications',[this.spec]],['integer',this.coord,'integerSpecification',[this.spec]],
  ['withdrawal',this.partial,'withdrawals',[this.rights]],['shortReturnWithdrawal',this.partial,'returnWithdrawals',[this.id,this.O]],['longReturnWithdrawal',this.partial,'returnWithdrawals',[this.id,this.L]],
  ['readinessGeneration',this.payout,'readinessGeneration',[this.id]],['accountReadiness',this.payout,'accountReadiness',[this.rights]]
 ];}
 async snapshot(anchor){
  const block=anchor??await this.rpc.request({method:'eth_getBlockByNumber',params:['latest',false]});
  assert(block&&typeof block.number==='string'&&typeof block.hash==='string','SNAPSHOT_ANCHOR_REQUIRED');
  const tag=block.number,values={};
  const fixed=await this.rpc.request({method:'eth_getBlockByNumber',params:[tag,false]});assert.equal(fixed.hash,block.hash,'SNAPSHOT_ANCHOR_CHANGED');
  this.progress({kind:'SNAPSHOT_BEGIN',number:tag,hash:block.hash});
  for(const [label,contract,method,args]of this.definitions()){
   const input=contract.interface.encodeFunctionData(method,args),request={label,address:contract.target,method,args,blockTag:tag,blockHash:block.hash,input};
   this.progress({kind:'SNAPSHOT_REQUEST',request});
   try{const raw=await this.rpc.request({method:'eth_call',params:[{to:contract.target,data:input},tag]}),decoded=contract.interface.decodeFunctionResult(method,raw);assert.equal(contract.interface.encodeFunctionResult(method,decoded).toLowerCase(),raw.toLowerCase(),'CANONICAL_RESPONSE:'+label);values[label]=plain(decoded.length===1?decoded[0]:decoded);this.progress({kind:'SNAPSHOT_RESPONSE',request,raw,value:values[label]});}
   catch(error){this.lifetime.fail('snapshot-rpc-or-decode',error);try{this.progress({kind:'SNAPSHOT_ERROR',request,error});}catch{}throw error;}
  }
  for(const role of ['core','funding','partial','attr','coord','executor','payoutSource','payout','token']){const bytes=await this.rpc.request({method:'eth_getCode',params:[this[role].target,tag]}),hash=ethers.keccak256(bytes),expected=this.runtimeRecords.find(x=>x.address===this[role].target);assert.equal(hash,expected.hash,'SNAPSHOT_RUNTIME:'+role);this.progress({kind:'SNAPSHOT_CODE',role,address:this[role].target,blockTag:tag,hash,bytes});}
  const end=await this.rpc.request({method:'eth_getBlockByNumber',params:[tag,false]});assert.equal(end.hash,block.hash,'SNAPSHOT_BLOCK_CHANGED');
  this.payoutObservations.push({block,endBlock:end,values});this.progress({kind:'SNAPSHOT_END',number:tag,hash:end.hash,values});return values;
 }
 async receive(amount=20n,sequence=1){
  const before=await this.snapshot(),beforeObservation=this.payoutObservations.at(-1);
  const args=[this.id,this.preparation,sequence,amount],r=await this.send(this.partial,'receiveRepeatFunding',args,this.other);
  const link=await this.transactionLink(r,beforeObservation,{from:this.L,to:this.partial.target,input:this.partial.interface.encodeFunctionData('receiveRepeatFunding',args),status:1});
  const after=await this.snapshot(link.block),afterObservation=this.payoutObservations.at(-1);
  await this.finishLink(link,afterObservation);this.assertPayment(before,after,r,amount,sequence);
  return {before,after,receipt:r,transactionLink:link};
 }
 async transactionLink(r,before,expected){
  const hash=r.hash??r.transactionHash,link={hash,beforeBlock:before.endBlock,expected,state:'PARTIAL'};this.paymentLinks.push(link);
  this.progress({kind:'PAYMENT_LINK_STARTED',hash,beforeBlock:link.beforeBlock,expected});
  try{
   for(const [key,method,params]of [['transaction','eth_getTransactionByHash',[hash]],['receipt','eth_getTransactionReceipt',[hash]]]){
    link[key]=await this.rpc.request({method,params});this.progress({kind:'PAYMENT_LINK_PARTIAL',hash,key,value:link[key]});assert(link[key],'PAYMENT_LINK_MISSING:'+key);
   }
   const tx=link.transaction,receipt=link.receipt;
   link.block=await this.rpc.request({method:'eth_getBlockByHash',params:[receipt.blockHash,false]});this.progress({kind:'PAYMENT_LINK_PARTIAL',hash,key:'block',value:link.block});
   const block=link.block;assert(block,'PAYMENT_BLOCK_MISSING');
   assert.equal(receipt.transactionHash.toLowerCase(),hash.toLowerCase());assert.equal(tx.hash.toLowerCase(),hash.toLowerCase());
   assert.equal(tx.from.toLowerCase(),expected.from.toLowerCase());assert.equal(tx.to.toLowerCase(),expected.to.toLowerCase());assert.equal(tx.input.toLowerCase(),expected.input.toLowerCase());assert.equal(BigInt(tx.value),0n);
   assert.equal(BigInt(receipt.status),BigInt(expected.status));assert.equal(BigInt(r.status),BigInt(expected.status));
   assert.equal(tx.blockHash,receipt.blockHash);assert.equal(block.hash,receipt.blockHash);assert.equal(r.blockHash,block.hash);
   assert.equal(BigInt(tx.blockNumber),BigInt(block.number));assert.equal(BigInt(receipt.blockNumber),BigInt(block.number));assert.equal(BigInt(r.blockNumber),BigInt(block.number));
   assert.equal(BigInt(block.number),BigInt(before.endBlock.number)+1n,'PAYMENT_BLOCK_ADJACENT');assert.equal(block.parentHash,before.endBlock.hash,'PAYMENT_PARENT_HASH');
   assert.equal(before.block.hash,before.endBlock.hash);assert.equal(BigInt(before.block.number),BigInt(before.endBlock.number));
   assert.deepEqual(block.transactions.map(x=>x.toLowerCase()),[hash.toLowerCase()],'PAYMENT_ONLY_TRANSACTION_IN_BLOCK');
   assert.equal(BigInt(tx.transactionIndex),0n);assert.equal(BigInt(receipt.transactionIndex),0n);
   const indexes=new Set();for(const log of receipt.logs){assert.equal(log.transactionHash.toLowerCase(),hash.toLowerCase());assert.equal(log.blockHash,block.hash);assert.equal(BigInt(log.blockNumber),BigInt(block.number));assert.equal(BigInt(log.transactionIndex),0n);assert.notEqual(log.removed,true);assert(!indexes.has(log.logIndex),'DUPLICATE_LOG_INDEX');indexes.add(log.logIndex);}
   const logView=x=>({address:x.address.toLowerCase(),topics:[...x.topics],data:x.data,blockHash:x.blockHash,blockNumber:BigInt(x.blockNumber),transactionHash:x.transactionHash.toLowerCase()});
   assert.deepEqual(r.logs.map(logView),receipt.logs.map(logView),'PAYMENT_RECEIPT_RAW_LOGS');
   if(expected.status===0)assert.deepEqual(receipt.logs,[],'FAILED_PAYMENT_LOGS');
   const fixed=await this.rpc.request({method:'eth_getBlockByNumber',params:[block.number,false]});assert.equal(fixed.hash,block.hash,'PAYMENT_BLOCK_RECHECK');
   link.state='TRANSACTION_LINKED';this.progress({kind:'PAYMENT_TRANSACTION_LINKED',link});return link;
  }catch(error){this.lifetime.fail('payment-transaction-link',error);try{this.progress({kind:'PAYMENT_LINK_ERROR',hash,link,error});}catch{}throw error;}
 }
 async finishLink(link,after){
  assert.equal(after.block.hash,link.block.hash,'PAYMENT_AFTER_BLOCK_HASH');assert.equal(after.endBlock.hash,link.block.hash,'PAYMENT_AFTER_END_HASH');
  assert.equal(BigInt(after.block.number),BigInt(link.receipt.blockNumber));assert.equal(BigInt(after.endBlock.number),BigInt(link.receipt.blockNumber));
  const head=await this.rpc.request({method:'eth_getBlockByNumber',params:['latest',false]});assert.equal(head.hash,link.block.hash,'PAYMENT_NO_LATER_BLOCK');assert.equal(head.number,link.block.number);
  link.afterBlock=after.endBlock;link.state='SNAPSHOTS_LINKED';this.progress({kind:'PAYMENT_SNAPSHOTS_LINKED',link});
 }
 async reject(options){
  let start;const precondition=options.precondition;
  const r=await super.reject({...options,precondition:async()=>{await precondition();start=this.payoutObservations.length;}}),observed=this.payoutObservations.slice(start);
  assert.equal(observed.length,3,'REJECTION_BEFORE_STATIC_AFTER_SNAPSHOTS');
  assert.equal(observed[1].block.hash,observed[0].endBlock.hash,'STATIC_REJECTION_DID_NOT_MINE');
  const signer=options.signer??this.owner,link=await this.transactionLink(r,observed[0],{from:await signer.getAddress(),to:options.contract.target,input:options.contract.interface.encodeFunctionData(options.method,options.args),status:0});
  await this.finishLink(link,observed[2]);return r;
 }
 assertPayment(b,v,r,amount,sequence){
  assert.equal(b.cash,20n);assert.equal(v.cash,20n,'REPEAT_CASH_IS_CUMULATIVE_COLLECTION');
  assert.equal(b.fundingToken-v.fundingToken,amount);assert.equal(b.custody-v.custody,amount);
  assert.equal(v.partialToken-b.partialToken,amount);assert.equal(v.accounted-b.accounted,amount);assert.equal(v.pool[0]-b.pool[0],amount);assert.equal(v.pool[5]-b.pool[5],amount);
  assert.equal(v.received[0]-b.received[0],amount);assert.equal(v.received[1]-b.received[1],amount);assert.equal(v.received[2],true);
  const cumulative=b.paid[1][0]+amount;assert.equal(BigInt(sequence),b.paid[1][1]+1n);assert(cumulative<=20n);
  assert.deepEqual(v.paid[0],[b.paid[0][0]+amount,0n,true]);assert.deepEqual(v.paid[1],[cumulative,BigInt(sequence),this.preparation,20n]);
  assert.deepEqual(v.paid2[0],v.paid[0]);assert.deepEqual(v.paid2[1],v.paid[1]);assert.deepEqual(v.received2.slice(0,2),v.received.slice(0,2));
  const active=sequence===1?v.paid:v.paid2,received=sequence===1?v.received:v.received2;
  assert.equal(received[2],true);
  const data=this.funding.interface.encodeFunctionData('payRepeat',[this.id,this.L,this.preparation,sequence,amount]);assert.equal(active[2],ethers.keccak256(abi.encode(['bytes','uint256'],[data,cumulative])));
  if(sequence===1){assert.equal(v.paid2[2],b.paid2[2]);assert.equal(v.received2[2],b.received2[2]);}
  else{assert.equal(sequence,2);assert.equal(v.paid[2],b.paid[2],'FIRST_PAYMENT_RECEIPT_PRESERVED');assert.equal(v.received[2],b.received[2]);}
  const changed=new Set(['fundingToken','custody','partialToken','accounted','pool','received','paid','received2','paid2']);for(const key of Object.keys(b))if(!changed.has(key))assert.deepEqual(v[key],b[key],'PAYOUT_UNCHANGED:'+key);
  for(let i=1;i<12;i++)if(i!==5)assert.equal(v.pool[i],b.pool[i],'POOL_UNCHANGED:'+i);
  assert.equal(v.partialAllowance,0n);assert.equal(v.partialAuth,Z);assert.equal(v.fundingAuth,Z);
  const receiptKey=ethers.keccak256(abi.encode(['bytes32','uint256'],[this.rights,sequence]));
  for(const [contract,event]of [[this.funding,'RepeatFundingPaid'],[this.partial,'RepeatFundingReceived']]){const logs=r.logs.filter(x=>x.address.toLowerCase()===contract.target.toLowerCase()).map(x=>contract.interface.parseLog(x));assert.equal(logs.length,1);assert.equal(logs[0].name,event);assert.deepEqual(plain(logs[0].args),[receiptKey,this.id,this.L,BigInt(sequence),amount,cumulative]);}
  this.progress({kind:'PAYMENT_VALIDATED',transactionHash:r.hash,paymentReceiptKey:receiptKey,meaning:'Existing Funding/Partial payout receipt; not consumption Receipt/terminal or user withdrawal',amount,repeatCash:v.cash});
 }
 rejections(){return outcomes.slice(this.rejectionStart);}
}
