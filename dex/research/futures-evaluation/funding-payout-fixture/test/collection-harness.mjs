import assert from 'node:assert/strict';
import {ethers} from 'ethers';
import anvil from './anvil-compat.mjs';
import {artifact,expectedRuntime,assertRuntime,rejects,errors} from './runtime-tools.mjs';

export const W=10n**18n,U=10n**6n,LOSS=600000n;
const coder=ethers.AbiCoder.defaultAbiCoder();
const plain=x=>Array.isArray(x)?Array.from(x,plain):x;
const lower=x=>x.toLowerCase();
export const outcomes=[];
async function bounded(op,ms=15000){let timer;try{return await Promise.race([Promise.resolve().then(op),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('LOCAL_OPERATION_DEADLINE')),ms);})]);}finally{clearTimeout(timer);}}
export async function receipt(provider,tx,status=1){
 const sent=await bounded(()=>tx),deadline=performance.now()+15000;
 for(let query=0;query<200;query++){
  const r=await bounded(()=>provider.getTransactionReceipt(sent.hash),Math.max(1,deadline-performance.now()));
  if(r){const b=await bounded(()=>provider.getBlock(r.blockNumber),Math.max(1,deadline-performance.now()));assert(b);assert.equal(b.hash,r.blockHash);assert.equal(lower(b.transactions[r.index]),lower(sent.hash));assert.equal(r.status,status);return r;}
  assert(performance.now()<deadline,'RECEIPT_DEADLINE');await new Promise(resolve=>setTimeout(resolve,25));
 }
 assert.fail('RECEIPT_QUERY_LIMIT');
}
function traceAddress(word){
 assert.equal(typeof word,'string','TRACE_STACK_WORD_TYPE');
 assert(/^(?:0[xX])?[0-9a-fA-F]{1,64}$/.test(word),'TRACE_STACK_WORD_HEX256');
 const value=BigInt('0x'+word.replace(/^0[xX]/,''));
 assert(value>=0n&&value<(1n<<256n),'TRACE_STACK_WORD_RANGE');
 return ethers.getAddress('0x'+(value&((1n<<160n)-1n)).toString(16).padStart(40,'0'));
}
function traceOrigin(trace,to,error){
 assert.equal(trace.failed,true,'TRACE_MUST_HAVE_FAILED');
 const data='0x'+String(trace.returnValue).replace(/^0x/,'');
 assert.equal(lower(data),lower(ethers.id(error+'()').slice(0,10)),'EXACT_CUSTOM_ERROR_BYTES');
 assert(Array.isArray(trace.structLogs)&&trace.structLogs.length,'TRACE_REQUIRED');
 const frames=new Map([[1,lower(to)]]),reverts=[];
 for(let i=0;i<trace.structLogs.length;i++){
  const log=trace.structLogs[i],next=trace.structLogs[i+1];
  if(['CALL','STATICCALL','DELEGATECALL','CALLCODE'].includes(log.op)&&next?.depth===log.depth+1){
   assert(log.stack?.length>=2,'TRACE_STACK_REQUIRED');
   frames.set(next.depth,lower(traceAddress(log.stack.at(-2))));
  }
  if(log.op==='REVERT')reverts.push({depth:log.depth,address:frames.get(log.depth)});
 }
 assert(reverts.length,'REVERT_OPCODE_REQUIRED');return reverts.sort((a,b)=>b.depth-a.depth)[0];
}

export class CollectionFixture {
 constructor(){this.runtimeRecords=[];this.specs=new Set();this.sequenceChecks=[];}
 async start(){
  this.rpc=anvil.provider({chain:{chainId:31337,hardfork:'shanghai'},wallet:{totalAccounts:4},stepsTracing:true});
  try{
   this.provider=new ethers.BrowserProvider(this.rpc,undefined,{cacheTimeout:-1,pollingInterval:25});
   assert.equal((await this.provider.getNetwork()).chainId,31337n);
   await this.rpc.request({method:'anvil_setBlockTimestampInterval',params:[0]});
   [this.gov,this.owner,this.other]=await Promise.all([0,1,2].map(i=>this.provider.getSigner(i)));
   this.G=await this.gov.getAddress();this.O=await this.owner.getAddress();
   await this.deployAll();await this.preparePolicy();await this.closeAndFinalize();
  }catch(e){try{await this.stop();}catch(cleanup){e.cleanupFailure={message:cleanup.message,code:cleanup.code};}throw e;}
 }
 async stop(){
  let first;try{if(this.rpc)await this.rpc.disconnect();}catch(e){first=e;}
  try{if(this.provider)this.provider.destroy();}catch(e){if(first)first.providerCleanupFailure=e.message;else first=e;}
  if(first)throw first;
 }
 async send(contract,method,args=[],signer=this.gov){return receipt(this.provider,contract.connect(signer).getFunction(method)(...args,{gasLimit:8000000n}));}
 async deploy(name,args=[],nonce){
  const z=artifact(name),overrides={gasLimit:28000000n};if(nonce!==undefined)overrides.nonce=Number(nonce);
  const contract=await bounded(()=>new ethers.ContractFactory(z.abi,'0x'+z.evm.bytecode.object,this.gov).deploy(...args,overrides));
  await receipt(this.provider,contract.deploymentTransaction());return contract;
 }
 async code(contract,name,values){const hash=await assertRuntime(this.provider,contract,name,values);this.runtimeRecords.push({name,address:contract.target,hash,values});return hash;}
 async nonce(expected){for(const tag of ['latest','pending'])assert.equal(BigInt(await this.rpc.request({method:'eth_getTransactionCount',params:[this.G,tag]})),expected,'NONCE_'+tag);this.sequenceChecks.push(String(expected));}
 async deployAll(){
  this.core=await this.deploy('LocalFuturesCore');await this.code(this.core,'LocalFuturesCore',{governance:this.G});
  this.funding=await this.deploy('LocalFuturesFundingV11',[this.core.target]);
  const ledgerAddress=ethers.getCreateAddress({from:this.funding.target,nonce:1n});assert.equal(await this.funding.exposureLedger(),ledgerAddress);
  this.ledger=new ethers.Contract(ledgerAddress,artifact('LocalFuturesExposureLedger').abi,this.gov);
  await this.code(this.ledger,'LocalFuturesExposureLedger',{core:this.core.target,funding:this.funding.target});
  await this.code(this.funding,'LocalFuturesFundingV11',{core:this.core.target,exposureLedger:ledgerAddress});
  await this.send(this.core,'bindFundingStudy',[this.funding.target]);
  const n=BigInt(await this.rpc.request({method:'eth_getTransactionCount',params:[this.G,'pending']}));await this.nonce(n);
  const predicted=ethers.getCreateAddress({from:this.G,nonce:n+2n});assert.equal(await this.provider.getCode(predicted),'0x');
  this.release=await this.deploy('LocalFuturesReleaseVerifier',[this.core.target,this.funding.target,predicted],n);
  assert.equal(this.release.target,ethers.getCreateAddress({from:this.G,nonce:n}));
  const releaseHash=await this.code(this.release,'LocalFuturesReleaseVerifier',{core:this.core.target,funding:this.funding.target,partialSettlement:predicted});await this.nonce(n+1n);
  this.linked=await this.deploy('LocalFuturesLinkedExposureVerifier',[this.core.target,this.funding.target,predicted],n+1n);
  assert.equal(this.linked.target,ethers.getCreateAddress({from:this.G,nonce:n+1n}));
  const linkedHash=await this.code(this.linked,'LocalFuturesLinkedExposureVerifier',{core:this.core.target,funding:this.funding.target,partialSettlement:predicted});await this.nonce(n+2n);
  const cutoff=await this.core.domainCount();
  this.partial=await this.deploy('LocalFuturesPartialV11',[this.core.target,this.funding.target,this.release.target,releaseHash,this.linked.target,linkedHash],n+2n);
  assert.equal(this.partial.target,predicted);assert.equal(await this.partial.legacyDomainCutoff(),cutoff);
  const withdrawalAddress=ethers.getCreateAddress({from:predicted,nonce:1n});assert.equal(await this.partial.withdrawalVerifier(),withdrawalAddress);
  this.withdrawal=new ethers.Contract(withdrawalAddress,artifact('LocalFuturesWithdrawalVerifier').abi,this.gov);
  const withdrawalHash=await this.code(this.withdrawal,'LocalFuturesWithdrawalVerifier',{core:this.core.target,funding:this.funding.target,partialSettlement:predicted});
  await this.code(this.partial,'LocalFuturesPartialV11',{core:this.core.target,funding:this.funding.target,legacyDomainCutoff:cutoff,withdrawalVerifier:withdrawalAddress,withdrawalVerifierCodeHash:withdrawalHash,releaseVerifier:this.release.target,releaseVerifierCodeHash:releaseHash,linkedExposureVerifier:this.linked.target,linkedExposureVerifierCodeHash:linkedHash});
  await this.send(this.core,'bindPartialStudy',[this.partial.target]);
  this.attr=await this.deploy('LocalFuturesAttribution',[this.partial.target]);
  await this.code(this.attr,'LocalFuturesAttribution',{core:this.core.target,funding:this.funding.target,partialSettlement:this.partial.target});
  await this.send(this.partial,'bindAttribution',[this.attr.target]);
  this.coord=await this.deploy('LocalFuturesSettlementCoordinator',[this.partial.target]);
  await this.code(this.coord,'LocalFuturesSettlementCoordinator',{core:this.core.target,funding:this.funding.target,partialSettlement:this.partial.target,attribution:this.attr.target});
  this.executor=await this.deploy('LocalFuturesCollectionExecutor',[this.coord.target]);
  this.context=ethers.keccak256(coder.encode(['address','address','address','address'],[this.core.target,this.funding.target,this.partial.target,this.coord.target]));
  await this.code(this.executor,'LocalFuturesCollectionExecutor',{core:this.core.target,funding:this.funding.target,partialSettlement:this.partial.target,coordinator:this.coord.target,contextHash:this.context});
  await this.send(this.funding,'bindCollectionCoordinator',[this.coord.target,this.executor.target]);
  this.token=await this.deploy('LocalVNextToken',[6]);await this.code(this.token,'LocalVNextToken',{decimals:6n});
  this.market=await this.deploy('LocalVNextOracle');this.collateral=await this.deploy('LocalVNextOracle');
  await this.code(this.market,'LocalVNextOracle',{});await this.code(this.collateral,'LocalVNextOracle',{});
 }
 async connections(){
  assert.equal(await this.core.governance(),this.G);assert.equal(await this.core.domainRegistry(),ethers.ZeroAddress);
  assert.equal(await this.core.localFunding(),this.funding.target);assert.equal(await this.core.localPartial(),this.partial.target);
  assert.equal(await this.funding.core(),this.core.target);assert.equal(await this.partial.core(),this.core.target);assert.equal(await this.partial.funding(),this.funding.target);
  assert.equal(await this.funding.collectionCoordinator(),this.coord.target);assert.equal(await this.funding.collectionExecutor(),this.executor.target);
  assert.equal(await this.partial.attribution(),this.attr.target);
  assert.equal(await this.funding.exposureLedger(),this.ledger.target);assert.equal(await this.ledger.core(),this.core.target);assert.equal(await this.ledger.funding(),this.funding.target);
  assert.equal(await this.partial.releaseVerifier(),this.release.target);assert.equal(await this.partial.linkedExposureVerifier(),this.linked.target);assert.equal(await this.partial.withdrawalVerifier(),this.withdrawal.target);
  for(const x of [this.attr,this.coord]){assert.equal(await x.core(),this.core.target);assert.equal(await x.funding(),this.funding.target);assert.equal(await x.partialSettlement(),this.partial.target);}
  for(const x of [this.release,this.linked,this.withdrawal]){assert.equal(await x.core(),this.core.target);assert.equal(await x.funding(),this.funding.target);assert.equal(await x.partialSettlement(),this.partial.target);}
  assert.equal(await this.executor.core(),this.core.target);assert.equal(await this.executor.funding(),this.funding.target);assert.equal(await this.executor.partialSettlement(),this.partial.target);assert.equal(await this.executor.coordinator(),this.coord.target);assert.equal(await this.executor.contextHash(),this.context);
  for(const [method,name]of [['releaseVerifierCodeHash','LocalFuturesReleaseVerifier'],['linkedExposureVerifierCodeHash','LocalFuturesLinkedExposureVerifier'],['withdrawalVerifierCodeHash','LocalFuturesWithdrawalVerifier']]){
   assert.equal(await this.partial[method](),ethers.keccak256(expectedRuntime(name,{core:this.core.target,funding:this.funding.target,partialSettlement:this.partial.target})));
  }
  for(const x of [this.core,this.funding,this.partial,this.attr,this.coord,this.executor,this.release,this.linked,this.withdrawal])assert.equal(await x.productionEnabled(),false);
 }
 async preparePolicy(){
  const latest=await this.provider.getBlock('latest');this.origin=BigInt(latest.timestamp)+1000n;this.openTime=this.origin+10n;this.exitTime=this.origin+50n;
  const cfg={minOrder:W,maxOrder:10n*W,maxPosition:10n*W,maxOI:100n*W,bufferUsd:W,liquidationCostUsd:W,maxPositions:10,maxBatch:4,marketAge:10000,collateralAge:10000,maxSkew:10000,initialMarginBps:5000,maintenanceBps:4000,stressBps:3000,feeBps:0,insuranceCoverageBps:0,fundingDeltaLimit:10n**25n,policyDigest:ethers.id('COLLECTION_SINGLE_SHORT_POLICY'),observationPolicyReady:true,fundingPolicyReady:true};
  await this.send(this.core,'createDomain',[this.token.target,this.market.target,this.collateral.target,this.token.target,this.G,this.G,cfg]);this.id=await this.core.domainCount();
  assert(this.id>await this.partial.legacyDomainCutoff());
  await this.send(this.core,'configureExposureResearch',[this.id,1,this.origin,100,1,4,8,0]);
  await this.send(this.funding,'enablePolicyGapStudy',[this.id,1]);await this.send(this.partial,'configureLinkedResearch',[this.id,2]);await this.send(this.attr,'registerDomain',[this.id,8,4]);
  await this.send(this.coord,'registerMockPolicy',[this.id,{fundingPrice18:W,exitMarket18:12n*W/10n,exitCollateral18:W,exitTime:this.exitTime,observationTag:ethers.id('COLLECTION_SINGLE_SHORT_LOCAL'),calculationPolicy:await this.coord.CALCULATION_POLICY()}]);
  await this.send(this.token,'mint',[this.G,1000n*U]);await this.send(this.token,'mint',[this.O,100n*U]);
  await this.send(this.token,'approve',[this.partial.target,1000n*U]);await this.send(this.token,'approve',[this.partial.target,100n*U],this.owner);
  await this.send(this.partial,'enableResearchLP',[this.id]);await this.send(this.partial,'depositResearchLP',[this.id,1000n*U,1]);
  assert(BigInt((await this.provider.getBlock('latest')).timestamp)<this.origin,'PREPARATION_BEFORE_ORIGIN');
 }
 async next(t){await this.rpc.request({method:'evm_setNextBlockTimestamp',params:[Number(t)]});}
 async closeAndFinalize(){
  await this.send(this.market,'set',[W,this.openTime]);await this.send(this.collateral,'set',[W,this.openTime]);await this.next(this.openTime);
  const opened=await this.send(this.core,'openLinkedExposureResearch',[this.id,3n*W,false,100n*U],this.owner);assert.equal(BigInt((await this.provider.getBlock(opened.blockNumber)).timestamp),this.openTime);
  this.pid=await this.core.exposureAccountPosition(this.id,this.O);this.openedBasis=plain(await this.partial.linkedBasis(this.pid));assert.equal((await this.core.coreExposureContext(this.pid))[1][2],1n);
  await this.send(this.market,'set',[12n*W/10n,this.exitTime]);await this.send(this.collateral,'set',[W,this.exitTime]);await this.next(this.exitTime);
  const closed=await this.send(this.core,'reduceExposureResearch',[this.pid,3n*W,2],this.owner);assert.equal(BigInt((await this.provider.getBlock(closed.blockNumber)).timestamp),this.exitTime);
  await this.next(this.origin+100n);await this.send(this.funding,'advanceFundingSeries',[this.id,1,1]);
  assert.equal((await this.funding.fundingSeriesEpoch(this.id,1,1))[0][10],2n);
  await this.send(this.funding,'checkpointFundingAccount',[this.id,1,this.O,1]);await this.send(this.funding,'fixSeriesMemberUSD',[this.id,1,1,this.O]);await this.send(this.funding,'finalizeSeriesUSD',[this.id,1,1]);await this.send(this.attr,'processAccount',[this.id,this.O,4]);
  await this.send(this.coord,'recordPlan',[this.pid]);const plan=await this.coord.plan(this.pid);await this.send(this.coord,'sealPlan',[this.pid,plan.id],this.owner);
  this.plan=plan;this.seal=await this.coord.sealedPlan(this.pid);
  this.positionKey=ethers.keccak256(coder.encode(['address','address','address','address','bytes32'],[this.core.target,this.funding.target,this.partial.target,this.coord.target,this.seal.settlementId]));
  this.accountKey=ethers.keccak256(coder.encode(['bytes32','uint256'],[plan.accountKey,1]));const policy=await this.coord.mockPolicy(this.id);
  this.epochKey=ethers.keccak256(coder.encode(['address','uint256','uint256','uint256','bytes32'],[this.coord.target,this.id,1,1,policy.basisHash]));
  this.collectionPolicyBasisHash=policy.basisHash; // Retain the already-read input for offline evidence; no extra query.
 }
 async specify(step=1,budget=LOSS){
  await this.send(this.coord,'specifyCumulativeBudget',[this.pid,this.seal.settlementId,step,budget],this.owner);
  const old=await this.coord.modeledAccountFunding(this.plan.accountKey,1);assert.equal(old,0n);
  await this.send(this.coord,'recordIntegerSpecification',[this.pid,this.seal.settlementId,step,old],this.owner);
  const spec=await this.coord.latestIntegerSpecification(this.pid);this.specs.add(spec);return spec;
 }
 async quote(spec=this.spec){return this.coord.collectionQuote(this.pid,spec);}
 async ready(spec=this.spec){
  await this.connections();assert.equal(await this.coord.latestIntegerSpecification(this.pid),spec);
  const q=await this.quote(spec),basis=await this.partial.linkedBasis(this.pid),e=await this.executor.executions(this.positionKey);
  assert.equal(q.owner,this.O);assert.equal(q.positionKey,this.positionKey);assert.equal(q.accountKey,this.accountKey);assert.equal(q.epochKey,this.epochKey);assert.equal(q.domain,this.id);
  assert.equal(q.pnl,LOSS);assert.equal(q.funding,0n);assert.equal(q.fee,0n);assert.equal(q.accountLimit,0n);assert.equal(q.positionLimit,0n);
  assert.equal(e.sequence,0n);assert.equal(e.budget,0n);assert.equal(await this.executor.consumedSpecifications(spec),false);assert.equal(await this.partial.linkedConsumed(this.pid),0n);
  assert.equal(basis.closed,basis.initialSize);assert.equal(basis.held,basis.margin);assert(q.budget<=basis.held);await this.zeroAuth();
  // A successful ordinary eth_call is the positive control for guard tests.
  // It neither injects a quote nor persists storage changes.
  await this.executor.connect(this.owner).execute.staticCall(this.pid,spec,1);await this.zeroAuth();return q;
 }
 async zeroAuth(){assert.equal(await this.executor.partialAuthorization(),ethers.ZeroHash);assert.equal(await this.executor.fundingAuthorization(),ethers.ZeroHash);}
 async snapshot(){
  const p=this.partial,f=this.funding,c=this.coord,addresses=[this.G,this.O,await this.other.getAddress(),this.core.target,p.target,f.target];
  return {pool:plain(await p.partialPool(this.id)),held:await p.linkedHeld(this.id),basis:plain(await p.linkedBasis(this.pid)),exit:plain(await p.linkedExit(this.pid,2,true)),consumed:await p.linkedConsumed(this.pid),pending:await p.linkedPending(this.id),reserved:await p.linkedFinalReserved(this.id),shares:await p.lpShares(this.id,this.G),totalShares:await p.lpTotalShares(this.id),accounted:await p.tokenAccounted(this.token.target),releases:plain(await p.releases(this.pid)),returnAvailable:await p.releasedReturnAvailable(this.id,this.O),receiptState:plain(await p.repeatReceiptState(this.id,ethers.ZeroHash,ethers.ZeroHash)),fundingPayout:plain(await f.repeatPayoutState(this.id,ethers.ZeroHash,ethers.ZeroHash)),cash:await f.repeatCash(this.epochKey),collected:await f.repeatAccountCollected(this.accountKey),custody:await f.repeatCustody(this.token.target),balances:await Promise.all(addresses.map(x=>this.token.balanceOf(x))),allowances:await Promise.all(addresses.map(x=>this.token.allowance(x,f.target))),partialAllowance:await this.token.allowance(p.target,f.target),ownerAllowance:await this.token.allowance(this.O,p.target),executor:plain(await this.executor.executions(this.positionKey)),specifications:await Promise.all([...this.specs].sort().map(async x=>[x,await this.executor.consumedSpecifications(x),plain(await c.integerSpecification(x))])),sealed:plain(await c.sealedPlan(this.pid)),latest:await c.latestIntegerSpecification(this.pid),modeled:await c.modeledAccountFunding(this.plan.accountKey,1),partialAuth:await this.executor.partialAuthorization(),fundingAuth:await this.executor.fundingAuthorization(),exposure:plain(await this.core.coreExposureContext(this.pid)),epoch:plain(await f.fundingSeriesEpoch(this.id,1,1)),member:plain(await f.fundingSeriesMember(this.id,1,1,this.O)),attributed:plain(await this.attr.accountEpoch(this.id,this.O,1))};
 }
 async execute(record,observe){
  const before=record?await observe(this,record,'before'):await this.snapshot();
  let r;
  if(record){
   const session=this.normalCollection;record.transactionState='UNKNOWN';session.txState='UNKNOWN';
   let sent;
   await session.observe({kind:'send-once',from:this.O,to:this.executor.target,input:this.executor.interface.encodeFunctionData('execute',[this.pid,this.spec,1]),retry:false},async()=>{
    sent=await this.executor.connect(this.owner).getFunction('execute')(this.pid,this.spec,1,{gasLimit:8000000n});
    record.transactionHash=sent.hash;record.transactionState='HASH_RETURNED';session.txState='HASH_RETURNED';
    session.append({kind:'transaction-hash-before-receipt-wait',hash:sent.hash,state:'HASH_RETURNED'});
    return {hash:sent.hash};
   });
   r=await session.wait(()=>receipt(this.provider,Promise.resolve(sent)));
  }else r=await this.send(this.executor,'execute',[this.pid,this.spec,1],this.owner);
  if(record){
   record.transactionState='RECEIPT_RETURNED';this.normalCollection.txState='RECEIPT_RETURNED';
   record.transaction=await this.rpc.request({method:'eth_getTransactionByHash',params:[r.hash]});
   record.receipt=await this.rpc.request({method:'eth_getTransactionReceipt',params:[r.hash]});
   record.block=await this.rpc.request({method:'eth_getBlockByHash',params:[r.blockHash,false]});
  }
  const after=record?await observe(this,record,'after'):await this.snapshot();return {before,after,r};
 }
 async reject({contract,method,args,signer=this.owner,error,origin,label,precondition}){
  assert.equal(typeof precondition,'function','TARGET_PRECONDITION_REQUIRED');await precondition();await this.zeroAuth();
  const before=await this.snapshot(),to=contract.target,from=await signer.getAddress(),data=contract.interface.encodeFunctionData(method,args);
  const rejectedCall=()=>rejects(contract,contract.connect(signer).getFunction(method).staticCall(...args),error,label);
  const validateCall=async()=>{
   assert.deepEqual(await this.snapshot(),before,'STATIC_REJECTION_ATOMIC');
   const tx={from,to,data,gas:'0x7a1200'},trace=await this.rpc.request({method:'debug_traceCall',params:[tx,'latest',{disableStorage:true,disableMemory:true,disableStack:false}]}),callOrigin=traceOrigin(trace,to,error);
   assert.equal(callOrigin.address,lower(origin),'CALL_REVERT_ORIGIN:'+label);return callOrigin;
  };
  let callOrigin;
  if(this.lifetime)callOrigin=await this.lifetime.expectRpcRevert({from,to,data,selector:ethers.id(error+'()').slice(0,10)},rejectedCall,validateCall);
  else{await rejectedCall();callOrigin=await validateCall();}
  const sent=await signer.sendTransaction({to,data,gasLimit:8000000n}),r=await receipt(this.provider,sent,0);assert.equal(r.logs.length,0,'FAILED_TRANSACTION_LOGS');
  const minedTrace=await this.rpc.request({method:'debug_traceTransaction',params:[r.hash,{disableStorage:true,disableMemory:true,disableStack:false}]}),minedOrigin=traceOrigin(minedTrace,to,error);
  assert.equal(minedOrigin.address,lower(origin),'MINED_REVERT_ORIGIN:'+label);
  assert.deepEqual(await this.snapshot(),before,'FAILED_TRANSACTION_ATOMIC');await this.zeroAuth();
  outcomes.push({label,error,origin,method,receipt:r.hash,status:r.status,callOrigin,minedOrigin});return r;
 }
 async traceZeroFunding(r){
  const trace=await this.rpc.request({method:'debug_traceTransaction',params:[r.hash,{disableMemory:true,disableStorage:true,disableStack:false}]});assert.equal(trace.failed,false);assert(trace.structLogs.length);
  const calls=trace.structLogs.filter(x=>['CALL','CALLCODE','DELEGATECALL'].includes(x.op));assert.equal(calls.length,1,'ONLY_EXECUTOR_TO_PARTIAL_MUTATING_CALL');assert.equal(calls[0].op,'CALL');assert.equal(calls[0].depth,1);assert.equal(lower(traceAddress(calls[0].stack.at(-2))),lower(this.partial.target));await this.zeroAuth();
  // Fixed by the preserved Executor declaration order: entered slot0,
  // partialAuthorization slot1, fundingAuthorization slot2 (immutables use no slots).
  const writes=trace.structLogs.filter(x=>x.depth===1&&x.op==='SSTORE').map(x=>({slot:BigInt('0x'+x.stack.at(-1).replace(/^0x/,'')),value:BigInt('0x'+x.stack.at(-2).replace(/^0x/,''))}));
  const expected=BigInt(ethers.keccak256(this.partial.interface.encodeFunctionData('applyCollection',[this.pid,this.id,LOSS,0,0,this.accountKey,this.epochKey,0])));
  const partialWrites=writes.filter(x=>x.slot===1n);assert(partialWrites.some(x=>x.value===expected),'EXACT_TEMPORARY_PARTIAL_AUTHORIZATION');assert.equal(partialWrites.at(-1).value,0n,'PARTIAL_AUTHORIZATION_CLEARED');assert(writes.filter(x=>x.slot===2n).every(x=>x.value===0n),'ZERO_FUNDING_NEVER_AUTHORIZED');
 }
}
export function assertConsumption(f,{before:b,after:a,r}){
 assert.equal(a.consumed-b.consumed,LOSS);assert.equal(b.held-a.held,LOSS);assert.equal(a.pool[1]-b.pool[1],LOSS);
 for(const key of ['pending','reserved','shares','totalShares','accounted','basis','exit','releases','returnAvailable','receiptState','fundingPayout','cash','collected','custody','balances','allowances','partialAllowance','ownerAllowance','sealed','latest','modeled','exposure','epoch','member','attributed'])assert.deepEqual(a[key],b[key],'UNCHANGED:'+key);
 for(const j of [0,2,3,4,5,6,7,8,9,10,11])assert.equal(a.pool[j],b.pool[j],'POOL:'+j);
 assert.deepEqual(a.executor,[1n,LOSS,LOSS,0n,0n,f.spec]);assert.equal(a.specifications.find(x=>x[0]===f.spec)[1],true);assert.equal(b.specifications.find(x=>x[0]===f.spec)[1],false);
 for(const [key,used,integer]of b.specifications){const actual=a.specifications.find(x=>x[0]===key);assert(actual);assert.equal(actual[1],key===f.spec?true:used);assert.deepEqual(actual[2],integer,'INTEGER_SPECIFICATION_IMMUTABLE');}
 assert.equal(a.partialAuth,ethers.ZeroHash);assert.equal(a.fundingAuth,ethers.ZeroHash);assert.equal(a.pool[0],a.pool.slice(1,8).reduce((x,y)=>x+y,0n)+a.held);
 const logs=r.logs.filter(x=>lower(x.address)===lower(f.executor.target)).map(x=>f.executor.interface.parseLog(x));assert.equal(logs.length,1);assert.equal(logs[0].name,'Collected');assert.deepEqual(Array.from(logs[0].args),[f.positionKey,f.spec,1n,0n]);
}
export {errors};
