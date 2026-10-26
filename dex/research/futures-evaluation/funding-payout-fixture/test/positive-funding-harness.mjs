import assert from 'node:assert/strict';
import {ethers} from 'ethers';
import {CollectionFixture,W,U} from './collection-harness.mjs';
import anvil from './anvil-compat.mjs';
import {artifact} from './runtime-tools.mjs';

const coder=ethers.AbiCoder.defaultAbiCoder();
export const plain=x=>Array.isArray(x)?Array.from(x,plain):x;
import {independentExpectation} from './positive-funding-expectation.mjs';
export {independentExpectation};

// Deployment plan, nonce prediction, runtime and reverse-binding checks are inherited.
// Funding-zero prepare/ready/execute/assertions are deliberately NOT used.
export class PositiveFundingFixture extends CollectionFixture {
 constructor(progress,lifetime){super();this.progress=progress;this.lifetime=lifetime;this.transitions=[];this.setupTransactions=[];}
 async start(){
  const life=this.lifetime;life.check();
  this.rpc=anvil.provider({chain:{chainId:31337,hardfork:'shanghai'},wallet:{totalAccounts:4},stepsTracing:true});life.install(this);
  this.provider=new ethers.BrowserProvider(this.rpc,undefined,{cacheTimeout:-1,pollingInterval:25});
  assert.equal((await this.provider.getNetwork()).chainId,31337n);await this.rpc.request({method:'anvil_setBlockTimestampInterval',params:[0]});
  [this.gov,this.owner,this.other]=await Promise.all([0,1,2].map(i=>this.provider.getSigner(i)));this.G=await this.gov.getAddress();this.O=await this.owner.getAddress();
  await this.deployAll();await this.preparePolicy();await this.closeAndFinalize();
  // Cleanup is owned by F01, after partial evidence and actual-task termination checks.
 }
 async send(contract,method,args=[],signer=this.gov){
  const life=this.lifetime;life.check();
  const item={id:this.setupTransactions.length+1,contract:contract.target,method,args,caller:await signer.getAddress(),submission:'NOT_SENT',receiptState:'NOT_QUERIED'};this.setupTransactions.push(item);this.progress({...item,state:'REQUESTED'});
  let sent;item.submission='UNKNOWN';const submissionIndex=life.submissions.length;
  try{sent=await life.wait(()=>contract.connect(signer).getFunction(method)(...args,{gasLimit:8000000n}));}
  catch(error){const known=life.submissions[submissionIndex];if(known){item.hash=known.hash;item.submission='HASH_RETURNED';}life.fail(known?'setup-submission-result-or-recording':'setup-submission-unknown',error);try{this.progress({...item,state:known?'HASH_KNOWN_RESULT_ERROR':'SUBMISSION_UNKNOWN',error,retry:false});}catch{}throw error;}
  life.check();assert.match(sent.hash,/^0x[0-9a-fA-F]{64}$/);item.hash=sent.hash;item.submission='HASH_RETURNED';
  // A journal failure here is a recording failure, never a claim of transaction failure.
  this.progress({...item,state:'HASH_RETURNED_BEFORE_RECEIPT',retry:false});
  return this.setupReceipt(sent,item);
 }
 async deploy(name,args=[],nonce){
  const life=this.lifetime;life.check();const z=artifact(name),overrides={gasLimit:28000000n};if(nonce!==undefined)overrides.nonce=Number(nonce);
  const item={id:this.setupTransactions.length+1,method:'constructor:'+name,args,caller:this.G,submission:'UNKNOWN',receiptState:'NOT_QUERIED'};this.setupTransactions.push(item);this.progress({...item,state:'REQUESTED',retry:false});
  let contract;const submissionIndex=life.submissions.length;
  try{contract=await life.wait(()=>new ethers.ContractFactory(z.abi,'0x'+z.evm.bytecode.object,this.gov).deploy(...args,overrides));}
  catch(error){const known=life.submissions[submissionIndex];if(known){item.hash=known.hash;item.submission='HASH_RETURNED';}life.fail(known?'deployment-submission-result-or-recording':'deployment-submission-unknown',error);throw error;}
  life.check();const sent=contract.deploymentTransaction();assert.match(sent.hash,/^0x[0-9a-fA-F]{64}$/);item.hash=sent.hash;item.submission='HASH_RETURNED';this.progress({...item,state:'HASH_RETURNED_BEFORE_RECEIPT',retry:false});
  await this.setupReceipt(sent,item);return contract;
 }
 async setupReceipt(sent,item){
  const life=this.lifetime,operation=item.operation??'setup';
  let raw;
  try{
   for(;;){life.check();raw=await this.rpc.request({method:'eth_getTransactionReceipt',params:[sent.hash]});if(raw)break;await life.wait(()=>new Promise(resolve=>setTimeout(resolve,25)));}
   life.check();item.receipt=raw;item.receiptState='RETURNED';
  }catch(error){life.fail(operation+'-receipt-query',error);try{this.progress({...item,state:'RECEIPT_ERROR',error});}catch{}throw error;}
  if(raw.status==='0x0'){
   const code='F01_'+operation.toUpperCase()+'_TRANSACTION_FAILED',error=Object.assign(Error(code),{code,transactionHash:sent.hash});life.fail(operation+'-transaction',error);
   try{this.progress({...item,state:'TRANSACTION_FAILED',error});}catch{}throw error;
  }
  try{
   assert.equal(raw.status,'0x1','SETUP_RECEIPT_STATUS');assert.equal(raw.transactionHash.toLowerCase(),sent.hash.toLowerCase());
   const block=await this.rpc.request({method:'eth_getBlockByHash',params:[raw.blockHash,false]});assert.equal(block.hash,raw.blockHash);assert.equal(block.transactions[Number(BigInt(raw.transactionIndex))].toLowerCase(),sent.hash.toLowerCase());
  }catch(error){life.fail(operation+'-receipt-validation',error);throw error;}
  this.progress({...item,state:'TRANSACTION_SUCCESS'});
  return {...raw,hash:raw.transactionHash,blockNumber:Number(BigInt(raw.blockNumber)),status:1};
 }
 async preparePolicy(){
  this.L=await this.other.getAddress();
  this.origin=BigInt((await this.provider.getBlock('latest')).timestamp)+1000n;this.openTime=this.origin+10n;this.exitTime=this.origin+50n;
  const cfg={minOrder:W,maxOrder:10n*W,maxPosition:10n*W,maxOI:100n*W,bufferUsd:W,liquidationCostUsd:W,maxPositions:10,maxBatch:4,marketAge:10000,collateralAge:10000,maxSkew:10000,initialMarginBps:5000,maintenanceBps:4000,stressBps:3000,feeBps:0,insuranceCoverageBps:0,fundingDeltaLimit:10n**25n,policyDigest:ethers.id('POSITIVE_FUNDING_TWO_ACCOUNTS'),observationPolicyReady:true,fundingPolicyReady:true};
  await this.send(this.core,'createDomain',[this.token.target,this.market.target,this.collateral.target,this.token.target,this.G,this.G,cfg]);this.id=await this.core.domainCount();assert(this.id>await this.partial.legacyDomainCutoff());
  await this.send(this.core,'configureExposureResearch',[this.id,1,this.origin,100,1,4,8,1]);
  await this.send(this.funding,'enablePolicyGapStudy',[this.id,1]);await this.send(this.partial,'configureLinkedResearch',[this.id,2]);await this.send(this.attr,'registerDomain',[this.id,8,4]);
  await this.send(this.coord,'registerMockPolicy',[this.id,{fundingPrice18:W,exitMarket18:12n*W/10n,exitCollateral18:W,exitTime:this.exitTime,observationTag:ethers.id('POSITIVE_FUNDING_LOCAL'),calculationPolicy:await this.coord.CALCULATION_POLICY()}]);
  for(const [who,amount,signer]of [[this.G,1000n*U,this.gov],[this.O,100n*U,this.owner],[this.L,100n*U,this.other]]){
   await this.send(this.token,'mint',[who,amount]);await this.send(this.token,'approve',[this.partial.target,amount],signer);
  }
  await this.send(this.partial,'enableResearchLP',[this.id]);await this.send(this.partial,'depositResearchLP',[this.id,1000n*U,1]);
  assert(BigInt((await this.provider.getBlock('latest')).timestamp)<this.origin,'PREPARATION_BEFORE_ORIGIN');
 }
 async transition(method,args,signer,time,sequence,role){
  await this.next(time);const r=await this.send(this.core,method,args,signer);
  const block=await this.rpc.request({method:'eth_getBlockByNumber',params:[ethers.toQuantity(r.blockNumber),false]});
  assert.equal(BigInt(block.timestamp),time,'EXACT_POSITION_TIMESTAMP');assert.equal(block.hash,r.blockHash);
  const who=await signer.getAddress(),pid=method==='openLinkedExposureResearch'?await this.core.exposureAccountPosition(this.id,who):args[0],context=await this.core.coreExposureContext(pid);
  assert.equal(context[1][2],BigInt(sequence),'EXPOSURE_SEQUENCE');
  const rawReceipt=await this.rpc.request({method:'eth_getTransactionReceipt',params:[r.hash]}),transaction=await this.rpc.request({method:'eth_getTransactionByHash',params:[r.hash]});
  this.transitions.push({role,method,args:plain(args),pid,sequence,time,block,receipt:rawReceipt,transaction});return pid;
 }
 async closeAndFinalize(){
  await this.send(this.market,'set',[W,this.openTime]);await this.send(this.collateral,'set',[W,this.openTime]);
  this.pid=await this.transition('openLinkedExposureResearch',[this.id,3n*W,false,100n*U],this.owner,this.openTime,1,'SHORT');
  this.longPid=await this.transition('openLinkedExposureResearch',[this.id,W,true,100n*U],this.other,this.openTime,1,'LONG');assert.notEqual(this.pid,this.longPid);
  await this.send(this.market,'set',[12n*W/10n,this.exitTime]);await this.send(this.collateral,'set',[W,this.exitTime]);
  await this.transition('reduceExposureResearch',[this.pid,3n*W,2],this.owner,this.exitTime,2,'SHORT');
  await this.transition('reduceExposureResearch',[this.longPid,W,2],this.other,this.exitTime,2,'LONG');
  await this.next(this.origin+100n);await this.send(this.funding,'advanceFundingSeries',[this.id,1,1]);
  for(const who of [this.O,this.L]){await this.send(this.funding,'checkpointFundingAccount',[this.id,1,who,1]);await this.send(this.funding,'fixSeriesMemberUSD',[this.id,1,1,who]);}
  await this.send(this.funding,'finalizeSeriesUSD',[this.id,1,1]);
  for(const who of [this.O,this.L])await this.send(this.attr,'processAccount',[this.id,who,4]);
  await this.prerequisites(); // Stop before plan/seal/budget if any timing/integral condition fails.
  await this.send(this.coord,'recordPlan',[this.pid]);this.plan=await this.coord.plan(this.pid);
  await this.send(this.coord,'sealPlan',[this.pid,this.plan.id],this.owner);this.seal=await this.coord.sealedPlan(this.pid);
  this.positionKey=ethers.keccak256(coder.encode(['address','address','address','address','bytes32'],[this.core.target,this.funding.target,this.partial.target,this.coord.target,this.seal.settlementId]));
  this.accountKey=ethers.keccak256(coder.encode(['bytes32','uint256'],[this.plan.accountKey,1]));const policy=await this.coord.mockPolicy(this.id);
  this.epochKey=ethers.keccak256(coder.encode(['address','uint256','uint256','uint256','bytes32'],[this.coord.target,this.id,1,1,policy.basisHash]));this.policyBasisHash=policy.basisHash;
 }
 async prerequisites(){
  const x=independentExpectation(),epoch=await this.funding.fundingSeriesEpoch(this.id,1,1),e=epoch[0];
  assert.deepEqual([e[3],e[4],e[5],e[6],e[7],e[8],e[9],e[10]],[x.le,x.se,x.matched,2n,2n,x.le,x.se,3n]);
  assert.equal(epoch[1]*x.usd.d,x.usd.n*epoch[2]);
  assert.equal((await this.funding.fundingSeries(this.id,1))[0][5],1n);assert.equal((await this.core.domain(this.id)).cfg.feeBps,0n);
  for(const [who,pid,le,se,debt,claim]of [[this.O,this.pid,0n,x.se,x.usd.n,0n],[this.L,this.longPid,x.le,0n,0n,x.usd.n]]){
   const m=await this.funding.fundingSeriesMember(this.id,1,1,who),a=await this.attr.accountEpoch(this.id,who,1),p=await this.attr.positionEpoch(pid,1);
   assert.deepEqual([m[0],m[1],m[2],m[3]],[le,se,1n,1n]);assert.equal(m[4],debt*m[5]);assert.equal(m[6],claim*m[7]);assert(m[5]>0n&&m[7]>0n);
   assert.equal(a.done,true);assert.equal(a.le,le);assert.equal(a.se,se);assert.equal(a.debt.n,debt*a.debt.d);assert.equal(a.claim_.n,claim*a.claim_.d);
   assert.equal(p[0],le);assert.equal(p[1],se);assert.equal(p[2].n,debt*p[2].d);assert.equal(p[3].n,claim*p[3].d);
   const b=await this.partial.linkedBasis(pid);assert.equal(b.sequence,2n);assert.equal(b.partials,0n);assert.equal(b.closed,b.initialSize);assert.equal(b.held,100n*U);
   const gap=await this.funding.policyGap(this.id,1,who,pid);assert.equal(gap[1],true);assert.equal(gap[2],false);
  }
 }
 async specifyPositive(){
  const x=independentExpectation();
  for(const [name,n]of [['pnlLossRaw',x.pnl.n],['fundingDebtRaw',x.shortDebt.n],['feesRaw',0n],['fundingClaimRaw',0n],['pnlGainRaw',0n]]){assert.equal(this.plan[name].n,n*this.plan[name].d);assert(this.plan[name].d>0n);}
  await this.send(this.coord,'specifyCumulativeBudget',[this.pid,this.seal.settlementId,1,x.total],this.owner);
  assert.equal(await this.coord.modeledAccountFunding(this.plan.accountKey,1),0n);
  await this.send(this.coord,'recordIntegerSpecification',[this.pid,this.seal.settlementId,1,0],this.owner);this.spec=await this.coord.latestIntegerSpecification(this.pid);this.specs.add(this.spec);
  const z=await this.coord.integerSpecification(this.spec),q=await this.coord.collectionQuote(this.pid,this.spec);
  assert.deepEqual([q.pnl,q.funding,q.fee,q.budget,q.accountLimit,q.positionLimit],[600000n,20n,0n,600020n,20n,20n]);
  assert.equal(q.owner,this.O);for(const key of ['positionKey','accountKey','epochKey'])assert.equal(q[key],this[key]);assert.equal(q.domain,this.id);
  assert.deepEqual([z.specificationSequence,z.expectedActualExecutionSequence,z.pnlTarget,z.fundingTarget,z.feeTarget,z.budget],[1n,0n,600000n,20n,0n,600020n]);assert.equal(z.actualReceiptConfirmed,false);
  assert.equal((await this.executor.executions(this.positionKey)).sequence,0n);assert.equal(await this.executor.consumedSpecifications(this.spec),false);await this.zeroAuth();await this.connections();
 }
}
