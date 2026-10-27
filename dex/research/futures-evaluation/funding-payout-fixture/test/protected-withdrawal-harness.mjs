import assert from 'node:assert/strict';
import {ethers} from 'ethers';
import {LongPayoutFixture} from './long-payout-harness.mjs';
import {W,U} from './collection-harness.mjs';
import {plain} from './positive-funding-harness.mjs';
import {requiredQueries,roleNames} from './verify-protected-withdrawal.mjs';
const Z=ethers.ZeroHash;
export class ProtectedWithdrawalFixture extends LongPayoutFixture {
 constructor(progress,life,{configure=true}={}){super(progress,life);this.configureWithdrawal=configure;this.withdrawalObservations=[];this.withdrawalDocuments=[];}
 // Separate setup override: original positive Funding and P01-P10 setup stays byte-identical.
 async preparePolicy(){
  this.L=await this.other.getAddress();this.origin=BigInt((await this.provider.getBlock('latest')).timestamp)+1000n;this.openTime=this.origin+10n;this.exitTime=this.origin+50n;
  const cfg={minOrder:W,maxOrder:10n*W,maxPosition:10n*W,maxOI:100n*W,bufferUsd:W,liquidationCostUsd:W,maxPositions:10,maxBatch:4,marketAge:10000,collateralAge:10000,maxSkew:10000,initialMarginBps:5000,maintenanceBps:4000,stressBps:3000,feeBps:0,insuranceCoverageBps:0,fundingDeltaLimit:10n**25n,policyDigest:ethers.id('POSITIVE_FUNDING_TWO_ACCOUNTS'),observationPolicyReady:true,fundingPolicyReady:true};
  await this.send(this.core,'createDomain',[this.token.target,this.market.target,this.collateral.target,this.token.target,this.G,this.G,cfg]);this.id=await this.core.domainCount();assert(this.id>await this.partial.legacyDomainCutoff());
  await this.send(this.core,'configureExposureResearch',[this.id,1,this.origin,100,1,4,8,1]);await this.send(this.funding,'enablePolicyGapStudy',[this.id,1]);await this.send(this.partial,'configureLinkedResearch',[this.id,2]);await this.send(this.attr,'registerDomain',[this.id,8,4]);
  await this.send(this.coord,'registerMockPolicy',[this.id,{fundingPrice18:W,exitMarket18:12n*W/10n,exitCollateral18:W,exitTime:this.exitTime,observationTag:ethers.id('POSITIVE_FUNDING_LOCAL'),calculationPolicy:await this.coord.CALCULATION_POLICY()}]);
  assert.equal(await this.core.domainRegistry(),ethers.ZeroAddress);assert.equal(await this.core.governance(),this.G);
  if(this.configureWithdrawal){await this.send(this.partial,'configureProtectedWithdrawal',[this.id],this.gov);assert.notEqual(await this.partial.protectedWithdrawalPolicy(this.id),Z);}
  else assert.equal(await this.partial.protectedWithdrawalPolicy(this.id),Z);
  for(const [who,amount,signer]of [[this.G,1000n*U,this.gov],[this.O,100n*U,this.owner],[this.L,100n*U,this.other]]){await this.send(this.token,'mint',[who,amount]);await this.send(this.token,'approve',[this.partial.target,amount],signer);}
  await this.send(this.partial,'enableResearchLP',[this.id]);await this.send(this.partial,'depositResearchLP',[this.id,1000n*U,1]);assert(BigInt((await this.provider.getBlock('latest')).timestamp)<this.origin,'PREPARATION_BEFORE_ORIGIN');
 }
 scope(){return {chainId:31337n,addresses:Object.fromEntries(Object.keys(roleNames).map(role=>[role,this[role].target])),G:this.G,O:this.O,L:this.L,id:this.id,pid:this.pid,longPid:this.longPid,rights:this.rights,positionKey:this.positionKey,accountKey:this.accountKey,epochKey:this.epochKey,spec:this.spec,payoutSpecId:this.payoutSpecId,preparation:this.preparation,paymentReceipt:this.paymentReceipt,paymentReceipt2:this.paymentReceipt2};}
 async beginWithdrawals(){await this.prepareCollection();await this.preparePayout();await this.receive();this.observeWithdrawal=true;const s=await this.snapshot();assert.equal(s.received[0],20n);assert.equal(s.withdrawalState[2],20n);assert.equal(s.withdrawal[1],0n);}
 async snapshot(anchor){
  if(!this.observeWithdrawal)return super.snapshot(anchor);
  const block=anchor??await this.rpc.request({method:'eth_getBlockByNumber',params:['latest',false]});assert(block?.number&&block?.hash,'WITHDRAWAL_ANCHOR');const side={block,queries:[],codes:[],values:{}};this.withdrawalObservations.push(side);this.payoutObservations.push(side);
  const fixed=await this.rpc.request({method:'eth_getBlockByNumber',params:[block.number,false]});assert.equal(fixed.hash,block.hash);
  for(const def of requiredQueries(this.scope())){this.lifetime.check();const contract=this[def.role],input=contract.interface.encodeFunctionData(def.method,def.args),q={...def,address:contract.target,blockTag:block.number,blockHash:block.hash,input,state:'REQUESTED'};side.queries.push(q);this.progress({kind:'WITHDRAWAL_QUERY_REQUEST',query:q});try{q.raw=await this.rpc.request({method:'eth_call',params:[{to:q.address,data:input},block.number]});const result=contract.interface.decodeFunctionResult(def.method,q.raw);assert.equal(contract.interface.encodeFunctionResult(def.method,result).toLowerCase(),q.raw.toLowerCase());q.value=plain(result.length===1?result[0]:result);side.values[def.label]=q.value;q.state='SUCCESS';this.progress({kind:'WITHDRAWAL_QUERY_RESPONSE',query:q});}catch(error){this.lifetime.fail('withdrawal-query',error);q.state='FAIL';q.error=error;try{this.progress({kind:'WITHDRAWAL_QUERY_ERROR',query:q});}catch{}throw error;}}
  for(const role of Object.keys(roleNames)){this.lifetime.check();const entry={role,address:this[role].target,blockTag:block.number,blockHash:block.hash,state:'REQUESTED'};side.codes.push(entry);this.progress({kind:'WITHDRAWAL_CODE_REQUEST',entry});try{entry.bytes=await this.rpc.request({method:'eth_getCode',params:[entry.address,block.number]});entry.hash=ethers.keccak256(entry.bytes);assert.equal(entry.hash,this.runtimeRecords.find(x=>x.address===entry.address).hash);entry.state='SUCCESS';this.progress({kind:'WITHDRAWAL_CODE_RESPONSE',entry});}catch(error){this.lifetime.fail('withdrawal-code',error);entry.state='FAIL';entry.error=error;try{this.progress({kind:'WITHDRAWAL_CODE_ERROR',entry});}catch{}throw error;}}
  side.endBlock=await this.rpc.request({method:'eth_getBlockByNumber',params:[block.number,false]});assert.equal(side.endBlock.hash,block.hash);this.progress({kind:'WITHDRAWAL_SNAPSHOT_COMPLETE',side});return side.values;
 }
 async withdraw(amount=20n,sequence=1){
  await this.snapshot();const before=this.withdrawalObservations.at(-1),args=[this.id,this.rights,sequence,amount],document={schema:'LQC_PROTECTED_WITHDRAWAL_1',scope:this.scope(),before,amount,sequence:BigInt(sequence),submission:'UNKNOWN'};this.withdrawalDocuments.push(document);this.progress({kind:'WITHDRAWAL_INTENT',args,retry:false});
  const r=await this.send(this.partial,'withdrawProtected',args,this.other);document.submission='RECEIPT_RETURNED';document.transactionHash=r.hash;
  document.link=await this.transactionLink(r,before,{from:this.L,to:this.partial.target,input:this.partial.interface.encodeFunctionData('withdrawProtected',args),status:1});await this.snapshot(document.link.block);document.after=this.withdrawalObservations.at(-1);await this.finishLink(document.link,document.after);
  document.runtimeValues=Object.fromEntries(Object.keys(roleNames).map(role=>[role,this.runtimeRecords.find(x=>x.address===this[role].target).values]));this.progress({kind:'WITHDRAWAL_STORED_DOCUMENT',document});return document;
 }
 async rejectWithdrawal({signer=this.other,key=this.rights,sequence=1,amount=1n,error,origin=this.partial.target,precondition}){
  const fragments=new Map(this.partial.interface.fragments.map(x=>[x.format('full'),x]));for(const peer of [this.withdrawal,this.payout,this.funding])for(const fragment of peer.interface.fragments.filter(x=>x.type==='error'))fragments.set(fragment.format('full'),fragment);
  const contract=new ethers.Contract(this.partial.target,[...fragments.values()],signer);
  return this.reject({contract,method:'withdrawProtected',args:[this.id,key,sequence,amount],signer,error,origin,label:'WITHDRAWAL_TARGET:'+error,precondition:async()=>{const s=await this.snapshot();assert.deepEqual(s.paid[1],[20n,1n,this.preparation,20n]);assert.equal(s.partialAuth,Z);assert.equal(s.fundingAuth,Z);if(this.configureWithdrawal)assert.notEqual(s.withdrawalPolicy,Z);await precondition(s);if(this.configureWithdrawal&&error!=='TransferFailed')await this.partial.connect(this.other).withdrawProtected.staticCall(this.id,this.rights,s.withdrawal[1]+1n,1n);}});
 }
}
