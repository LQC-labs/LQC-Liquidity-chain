// Offline consistency verification only. No fixture, provider, filesystem or RPC access.
// This does not authenticate RPC replies or certify a complete consumption history.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {ethers} from 'ethers';
import {independentExpectation} from './positive-fee-expectation.mjs';

export const FIXED_ABI_SHA256='ecfc8e576031d146b482cc1f7a7bd0c7bd83cf71a7fe2e63cdcf91465d121bf0';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function decodeStored(node,ids=new Map()){
 if(node===null||typeof node!=='object')return node;
 if(Object.hasOwn(node,'$ref')){assert(ids.has(node.$ref),'UNKNOWN_REFERENCE');return ids.get(node.$ref);}
 if(node.$type==='bigint'){assert.match(node.decimal,/^-?(0|[1-9][0-9]*)$/);return BigInt(node.decimal);}
 if(node.$type==='undefined')return undefined;
 assert(['array','object'].includes(node.$type),'UNEXPECTED_TYPED_RECORD');assert(!ids.has(node.$id),'DUPLICATE_ID');
 const value=node.$type==='array'?[]:Object.create(null);ids.set(node.$id,value);
 for(const [key,item]of Object.entries(node.properties)){if(node.$type==='array'&&key==='length')continue;Object.defineProperty(value,key,{value:decodeStored(item,ids),enumerable:true,writable:true,configurable:true});}
 return value;
}
export const abiField=(x,index)=>({index,name:x.name||null,type:x.type,components:x.components?.map(abiField)??null,arrayChildren:x.arrayChildren?abiField(x.arrayChildren,0):null});
const same=(a,b)=>assert.equal(a.toLowerCase(),b.toLowerCase());
const plain=x=>Array.isArray(x)?Array.from(x,plain):x;
const equalData=(a,b)=>assert.deepEqual(plain(a),plain(b));
const roleNames={core:'LocalFuturesCore',funding:'LocalFuturesFundingV11',ledger:'LocalFuturesExposureLedger',release:'LocalFuturesReleaseVerifier',linked:'LocalFuturesLinkedExposureVerifier',partial:'LocalFuturesPartialV11',withdrawal:'LocalFuturesWithdrawalVerifier',attr:'LocalFuturesAttribution',coord:'LocalFuturesSettlementCoordinator',executor:'LocalFuturesCollectionExecutor',token:'LocalVNextToken',market:'LocalVNextOracle',collateral:'LocalVNextOracle'};
function fixedABI(bytes){
 assert.equal(hash(bytes),FIXED_ABI_SHA256,'FIXED_ABI_BYTES');const fixed=JSON.parse(bytes.toString('utf8'));assert.equal(fixed.schema,'LQC_STORED_CONSUMPTION_ABI_1');
 assert.equal(fixed.provenance['compiler-output.json'],'982211ef1cb30a28d9435f71df26f6d322611acf4057eccfe569cd7b9e389378');
 assert.equal(fixed.provenance['manifest.json'],'d404389d65ef14c85d35b37720d6adb5bcec1b2070e14b620f35434063499e2e');
 for(const item of Object.values(fixed.contracts))assert.equal(hash(Buffer.from(JSON.stringify(item.abi))),item.abiSHA256,'CONTRACT_ABI_HASH');return fixed;
}
function runtime(item,fixed){
 const contract=fixed.contracts[item.name];assert(contract,'FIXED_RUNTIME_CONTRACT');let template=contract.runtimeTemplate;const ranges=[];
 for(const immutable of contract.immutables){
  assert(Object.hasOwn(item.immutableValues,immutable.name),'IMMUTABLE_VALUE_REQUIRED');const value=item.immutableValues[immutable.name];
  const encoded=ethers.zeroPadValue(typeof value==='bigint'?ethers.toBeHex(value):value,32).slice(2);
  for(const span of immutable.ranges){assert.equal(span.length,32);assert(span.start>=0&&span.start+span.length<=template.length/2);ranges.push(span);assert(/^0+$/.test(contract.runtimeTemplate.slice(span.start*2,(span.start+span.length)*2)));template=template.slice(0,span.start*2)+encoded+template.slice((span.start+span.length)*2);}
 }
 ranges.sort((a,b)=>a.start-b.start);for(let i=1;i<ranges.length;i++)assert(ranges[i].start>=ranges[i-1].start+ranges[i-1].length,'IMMUTABLE_OVERLAP');
 same(item.runtimeCode,'0x'+template);assert.equal(ethers.keccak256(item.runtimeCode),item.runtimeHash);
}
export function verifyRepeatedStep(documentBytes,fixedABIBytes){
 const expected=independentExpectation();
 const fixed=fixedABI(fixedABIBytes),saved=decodeStored(JSON.parse(documentBytes.toString('utf8'))),coder=ethers.AbiCoder.defaultAbiCoder();
 assert.equal(saved.schema,'LQC_REPEATED_STEP_1');assert.equal(saved.status,'COLLECTED');assert.equal(saved.chainId,'0x7a69');
 assert.equal(saved.abiSHA256,FIXED_ABI_SHA256);assert.equal(saved.amount,null);assert.equal(saved.authority,false);assert.equal(saved.consumptionLink,'UNVERIFIED');assert.equal(saved.rightsLink,'UNVERIFIED');
 assert.equal(saved.failures.length,0);assert.equal(saved.primaryKind,undefined);
 assert(saved.domain>0n&&saved.pid>0n);assert([1n,2n].includes(saved.sequence),'REPEAT_SEQUENCE');
 const seq=saved.sequence, target=seq===1n?{budget:300010n,pnl:300000n,funding:10n,fee:0n}:{budget:600320n,pnl:600000n,funding:20n,fee:300n};
 const previous=seq===1n?{budget:0n,pnl:0n,funding:0n,fee:0n}:{budget:300010n,pnl:300000n,funding:10n,fee:0n};
 assert.equal(expected.total,600320n);assert.equal(300010n*600000n/600020n,300000n);assert.equal(300010n*20n/600020n,10n);assert.equal(300010n*600000n%600020n,0n);assert.equal(300010n*20n%600020n,0n);assert.equal(saved.sendCalls,1);assert.equal(saved.pendingUnderlying,0);
 const context=saved.context,addresses={},interfaces=new Map();assert.equal(Object.keys(context.roles).length,13);
 for(const [role,name]of Object.entries(roleNames)){const item=context.roles[role];assert.equal(item.name,name);assert.notEqual(ethers.getAddress(item.address),ethers.ZeroAddress);addresses[role]=item.address;interfaces.set(item.address.toLowerCase(),new ethers.Interface(fixed.contracts[name].abi));}
 assert.equal(new Set(Object.values(addresses).map(x=>x.toLowerCase())).size,13);ethers.getAddress(saved.account);ethers.getAddress(context.governance);ethers.getAddress(context.other);
 const iface=role=>interfaces.get(addresses[role].toLowerCase());
 const tuple=(role,method,values)=>{const fields=iface(role).getFunction(method).outputs;const parts=fields.length===1&&fields[0].baseType==='tuple'?fields[0].components:fields;assert.equal(values.length,parts.length);return Object.fromEntries(parts.map((field,index)=>[field.name,values[index]]));};
 const plan=tuple('coord','plan',context.plan),b=saved.before.snapshot,a=saved.after.snapshot,seal=tuple('coord','sealedPlan',b.sealed);
 assert.equal(plan.domain,saved.domain);assert.equal(plan.pid,saved.pid);assert.equal(plan.firstEpoch,1n);assert.equal(plan.lastEpoch,1n);assert.equal(plan.sequence,2n);
 assert.equal(saved.timing.open,saved.timing.origin+10n);assert.equal(saved.timing.exit,saved.timing.origin+50n);
 assert.equal(saved.transitions.length,4);
 for(const [index,role,pid,sequence,time,size,long_]of [[0,'SHORT',saved.pid,1n,saved.timing.open,3n*10n**18n,false],[1,'LONG',saved.longPid,1n,saved.timing.open,10n**18n,true],[2,'SHORT',saved.pid,2n,saved.timing.exit,3n*10n**18n,false],[3,'LONG',saved.longPid,2n,saved.timing.exit,10n**18n,true]]){
  const transition=saved.transitions[index];assert.equal(transition.role,role);assert.equal(transition.pid,pid);assert.equal(BigInt(transition.sequence),sequence);assert.equal(transition.time,time);assert.equal(BigInt(transition.block.timestamp),time);assert.equal(transition.receipt.blockHash,transition.block.hash);assert.equal(BigInt(transition.receipt.blockNumber),BigInt(transition.block.number));assert.equal(transition.receipt.status,'0x1');
  const txIndex=Number(BigInt(transition.receipt.transactionIndex));assert.equal(transition.block.transactions[txIndex].toLowerCase(),transition.receipt.transactionHash.toLowerCase());
  const method=sequence===1n?'openLinkedExposureResearch':'reduceExposureResearch',args=sequence===1n?[saved.domain,size,long_,100000000n]:[pid,size,2];
  assert.equal(transition.method,method);equalData(transition.args,args);same(transition.transaction.hash,transition.receipt.transactionHash);same(transition.transaction.blockHash,transition.block.hash);same(transition.transaction.to,addresses.core);same(transition.transaction.from,role==='SHORT'?saved.account:context.other);same(transition.transaction.input,iface('core').encodeFunctionData(method,args));
 }
 for(const [name,n]of [['pnlLossRaw',600000n],['fundingDebtRaw',20n],['feesRaw',300n],['fundingClaimRaw',0n],['pnlGainRaw',0n]]){assert(plan[name][1]>0n);assert.equal(plan[name][0],n*plan[name][1]);}
 for(const key of ['positionKey','accountKey','epochKey','coordinatorAccountKey','settlementId'])assert(saved.keys[key].value&&saved.keys[key].meaning);
 const key=(types,values)=>ethers.keccak256(coder.encode(types,values));
 assert.equal(seal.planHash,key([iface('coord').getFunction('plan').outputs[0]],[context.plan]));
 assert.equal(seal.settlementId,key(['string','bytes32','bytes32','bytes32','uint256'],['REPEATING_SEALED_SPEC_ONLY',plan.id,seal.planHash,seal.epochRoot,seal.limit]));
 assert.equal(saved.keys.settlementId.value,seal.settlementId);assert.equal(saved.keys.coordinatorAccountKey.value,plan.accountKey);
 assert.equal(saved.keys.positionKey.value,key(['address','address','address','address','bytes32'],[addresses.core,addresses.funding,addresses.partial,addresses.coord,seal.settlementId]));
 assert.equal(saved.keys.accountKey.value,key(['bytes32','uint256'],[plan.accountKey,plan.firstEpoch]));
 const series=b.exposure[1][1];assert.equal(series,1n);
 assert.equal(saved.keys.epochKey.value,key(['address','uint256','uint256','uint256','bytes32'],[addresses.coord,saved.domain,series,plan.firstEpoch,context.policyBasisHash]));
 assert.equal(plan.accountKey,key(['address','address','address','address','address','uint256','uint256','bytes32','address','bytes32'],[addresses.coord,addresses.core,addresses.funding,addresses.partial,addresses.attr,saved.domain,series,b.exposure[2],saved.account,context.policyBasisHash]));
 assert.equal(saved.controlBlock.hash,saved.before.startBlock.hash);assert.equal(saved.controlBlock.number,saved.before.startBlock.number);
 const poolFields=['cash','lp','locked','free','pnl','funding','refund','fees','oi','active','base','shorts'];assert.equal(saved.fieldMeanings.poolItems.length,12);
 for(let i=0;i<12;i++){const x=saved.fieldMeanings.poolItems[i];assert.equal(x.index,i);assert.equal(x.name,poolFields[i]);assert.equal(x.type,'uint256');}
 assert.equal(saved.contracts.length,13);assert.equal(new Set(saved.contracts.map(x=>x.address.toLowerCase())).size,13);
 const runtimeByAddress=new Map(saved.contracts.map(x=>[x.address.toLowerCase(),x]));
 const immutableLinks={governance:context.governance,core:addresses.core,funding:addresses.funding,partialSettlement:addresses.partial,coordinator:addresses.coord,attribution:addresses.attr,exposureLedger:addresses.ledger,releaseVerifier:addresses.release,linkedExposureVerifier:addresses.linked,withdrawalVerifier:addresses.withdrawal,legacyDomainCutoff:0n,decimals:6n,contextHash:key(['address','address','address','address'],[addresses.core,addresses.funding,addresses.partial,addresses.coord])};
 for(const [field,role]of [['releaseVerifierCodeHash','release'],['linkedExposureVerifierCodeHash','linked'],['withdrawalVerifierCodeHash','withdrawal']]){const observed=runtimeByAddress.get(addresses[role].toLowerCase());assert(observed);immutableLinks[field]=observed.runtimeHash;}
 const checkRuntime=item=>{runtime(item,fixed);for(const immutable of fixed.contracts[item.name].immutables){assert(Object.hasOwn(immutableLinks,immutable.name));const value=item.immutableValues[immutable.name],expected=immutableLinks[immutable.name];if(typeof expected==='string')same(value,expected);else assert.equal(value,expected);}};
 for(const [role,name]of Object.entries(roleNames)){const item=runtimeByAddress.get(addresses[role].toLowerCase());assert(item);assert.equal(item.name,name);checkRuntime(item);}
 same(addresses.ledger,ethers.getCreateAddress({from:addresses.funding,nonce:1n}));same(addresses.withdrawal,ethers.getCreateAddress({from:addresses.partial,nonce:1n}));
 equalData(saved.contracts,saved.before.contracts);
 // Fixed specification roster: one for step 1 and both for step 2; one execute per record.
 // Neither the specification roster nor getter definitions come from queries.
 assert.match(saved.specification,/^0x[0-9a-fA-F]{64}$/);
 equalData(iface('executor').decodeFunctionData('execute',saved.transaction.input),[saved.pid,saved.specification,saved.sequence]);
 const specificationIds=(seq===1n?[saved.specification]:[saved.previousSpecification,saved.specification]).sort();
 if(seq===1n)assert.equal(saved.previousSpecification,ethers.ZeroHash);else {assert.match(saved.previousSpecification,/^0x[0-9a-fA-F]{64}$/);assert.notEqual(saved.previousSpecification,saved.specification);}
 assert(saved.longPid>0n&&saved.longPid!==saved.pid);assert.notEqual(saved.account.toLowerCase(),context.other.toLowerCase());
 const definitions=[
  ['domain','core','domain',[saved.domain]],
  ['longBasis','partial','linkedBasis',[saved.longPid]],['longExit','partial','linkedExit',[saved.longPid,2n,true]],['longConsumed','partial','linkedConsumed',[saved.longPid]],['longExposure','core','coreExposureContext',[saved.longPid]],['longMember','funding','fundingSeriesMember',[saved.domain,1n,1n,context.other]],['longAttributed','attr','accountEpoch',[saved.domain,context.other,1n]],['longShares','partial','lpShares',[saved.domain,context.other]],['ownerShares','partial','lpShares',[saved.domain,saved.account]],['longOwnerAllowance','token','allowance',[context.other,addresses.partial]],['longLatest','coord','latestIntegerSpecification',[saved.longPid]],['longReturn','partial','releasedReturnAvailable',[saved.domain,context.other]],
  ['pool','partial','partialPool',[saved.domain]],['held','partial','linkedHeld',[saved.domain]],
  ['basis','partial','linkedBasis',[saved.pid]],['exit','partial','linkedExit',[saved.pid,2n,true]],
  ['consumed','partial','linkedConsumed',[saved.pid]],['pending','partial','linkedPending',[saved.domain]],
  ['reserved','partial','linkedFinalReserved',[saved.domain]],['shares','partial','lpShares',[saved.domain,context.governance]],
  ['totalShares','partial','lpTotalShares',[saved.domain]],['accounted','partial','tokenAccounted',[addresses.token]],
  ['releases','partial','releases',[saved.pid]],['returnAvailable','partial','releasedReturnAvailable',[saved.domain,saved.account]],
  ['receiptState','partial','repeatReceiptState',[saved.domain,ethers.ZeroHash,ethers.ZeroHash]],
  ['fundingPayout','funding','repeatPayoutState',[saved.domain,ethers.ZeroHash,ethers.ZeroHash]],
  ['cash','funding','repeatCash',[saved.keys.epochKey.value]],['collected','funding','repeatAccountCollected',[saved.keys.accountKey.value]],
  ['custody','funding','repeatCustody',[addresses.token]],['partialAllowance','token','allowance',[addresses.partial,addresses.funding]],
  ['ownerAllowance','token','allowance',[saved.account,addresses.partial]],['executor','executor','executions',[saved.keys.positionKey.value]],
  ['sealed','coord','sealedPlan',[saved.pid]],['latest','coord','latestIntegerSpecification',[saved.pid]],
  ['modeled','coord','modeledAccountFunding',[plan.accountKey,1n]],['partialAuth','executor','partialAuthorization',[]],
  ['fundingAuth','executor','fundingAuthorization',[]],['exposure','core','coreExposureContext',[saved.pid]],
  ['epoch','funding','fundingSeriesEpoch',[saved.domain,1n,1n]],['member','funding','fundingSeriesMember',[saved.domain,1n,1n,saved.account]],
  ['attributed','attr','accountEpoch',[saved.domain,saved.account,1n]]
 ];
 for(const [sideName,side]of [['before',saved.before],['after',saved.after]]){
  assert(side.startBlock.hash);assert.equal(side.startBlock.hash,side.endBlock.hash);assert.equal(side.startBlock.number,side.endBlock.number);
  const roles=[['governance',context.governance],['position-owner',saved.account],['other-wallet',context.other],['Core',addresses.core],['Partial',addresses.partial],['Funding',addresses.funding]];
  assert.equal(side.balanceItems.length,6);assert.equal(side.allowanceItems.length,6);assert.equal(side.snapshot.balances.length,6);assert.equal(side.snapshot.allowances.length,6);
  for(let i=0;i<6;i++){const x=side.balanceItems[i],y=side.allowanceItems[i];assert.equal(x.index,i);assert.equal(y.index,i);assert.equal(x.role,roles[i][0]);assert.equal(y.role,roles[i][0]);same(x.address,roles[i][1]);same(y.owner,roles[i][1]);same(y.spender,addresses.funding);same(x.token,addresses.token);same(y.token,addresses.token);const bq=side.queries['balances/'+i],aq=side.queries['allowances/'+i];same(bq.args[0],x.address);same(aq.args[0],y.owner);same(aq.args[1],y.spender);}
  const expected=[...definitions];
  for(let n=0;n<roles.length;n++){expected.push(['balances/'+n,'token','balanceOf',[roles[n][1]]],['allowances/'+n,'token','allowance',[roles[n][1],addresses.funding]]);}
  equalData(side.snapshot.specifications.map(x=>x[0]),specificationIds);
  for(const entry of side.snapshot.specifications)assert.equal(entry.length,3,'SPECIFICATION_RECORD_SHAPE');
  assert.equal(side.snapshot.latest,saved.specification,'SPECIFICATION_LATEST');
  for(const id of specificationIds)expected.push(['specifications/'+id+'/used','executor','consumedSpecifications',[id]],['specifications/'+id+'/integer','coord','integerSpecification',[id]]);
  assert.equal(expected.length,seq===1n?55:57,'REPEAT_FIXED_QUERY_COUNT');
  const labels=expected.map(x=>x[0]);assert.equal(new Set(labels).size,labels.length);
  assert.deepEqual(Object.keys(side.queries).sort(),[...labels].sort(),'QUERY_REQUIRED_LABELS:'+sideName);
  const semantic=saved.queryObservations.filter(x=>x.request.kind==='contract'&&x.request.blockTag===side.startBlock.number);
  for(const [label,role,method,args]of expected){
   const q=side.queries[label],i=iface(role),fragment=i.getFunction(method),input=i.encodeFunctionData(fragment,args);
   const checkRequest=request=>{
    assert.equal(request.kind,'contract');assert.equal(request.label,label);assert.equal(request.address.toLowerCase(),addresses[role].toLowerCase(),'QUERY_ROLE_ADDRESS:'+sideName+':'+label);
    assert.equal(request.method,fragment.format('sighash'),'QUERY_METHOD:'+sideName+':'+label);assert.equal(request.args.length,args.length);
    // ABI round-trip accepts the capture's small numeric literals, but not a different argument value.
    assert.deepEqual(plain(i.decodeFunctionData(fragment,i.encodeFunctionData(fragment,request.args))),plain(i.decodeFunctionData(fragment,input)),'QUERY_ARGUMENTS:'+sideName+':'+label);
    assert.equal(request.blockTag,side.startBlock.number,'QUERY_BLOCK_TAG:'+sideName+':'+label);assert.equal(request.blockHash,side.startBlock.hash);
    assert.equal(JSON.stringify(request.outputs),JSON.stringify(fragment.outputs.map(abiField)));
   };
   checkRequest(q);
   const parts=label.split('/');let value=side.snapshot[label];
   if(parts[0]==='balances'||parts[0]==='allowances')value=side.snapshot[parts[0]][Number(parts[1])];
   if(parts[0]==='specifications'){const entry=side.snapshot.specifications.find(x=>x[0]===parts[1]);assert(entry);value=entry[parts[2]==='used'?1:2];}
   const events=semantic.filter(x=>x.request.label===label),started=events.find(x=>x.state==='REQUESTED'),completed=events.find(x=>x.state==='SUCCESS');
   assert(started&&completed,'SEMANTIC_REPLY_REQUIRED:'+label);assert.equal(started.id,completed.id);checkRequest(started.request);checkRequest(completed.request);
   const begin=saved.queryObservations.indexOf(started),end=saved.queryObservations.indexOf(completed);assert(begin<end);
   // Bind the raw pair inside this call, rather than accepting an unrelated matching reply.
   const raw=saved.queryObservations.slice(begin+1,end).filter(x=>x.request.kind==='rpc'&&x.request.request.method==='eth_call');
   assert.equal(raw.length,2,'STORED_RAW_PAIR_REQUIRED:'+label);assert.equal(raw[0].state,'REQUESTED');assert.equal(raw[1].state,'SUCCESS');assert.equal(raw[0].id,raw[1].id);
   for(const reply of raw){const request=reply.request.request;assert.equal(request.params.length,2);assert.equal(request.params[1],side.startBlock.number);assert.equal(reply.request.blockTag,side.startBlock.number);same(request.params[0].to,addresses[role]);same(request.params[0].data,input);}
   const decoded=i.decodeFunctionResult(fragment,raw[1].value);
   assert.equal(i.encodeFunctionResult(fragment,decoded).toLowerCase(),raw[1].value.toLowerCase(),'RAW_RESPONSE_CANONICAL:'+sideName+':'+label); // Reject trailing bytes.
   assert.deepEqual(plain(value),plain(fragment.outputs.length===1?decoded[0]:decoded),'QUERY_STORED_VALUE:'+sideName+':'+label);
   equalData(completed.value,value);
  }
  equalData(semantic.filter(x=>x.state==='REQUESTED').map(x=>x.request.label).sort(),[...labels].sort());
  equalData(semantic.filter(x=>x.state==='SUCCESS').map(x=>x.request.label).sort(),[...labels].sort());
  assert.equal(semantic.length,labels.length*2,'QUERY_TERMINAL_ROSTER');
  assert.equal(new Set(semantic.filter(x=>x.state==='REQUESTED').map(x=>x.id)).size,labels.length,'QUERY_ID_REUSE');
  for(const name of Object.keys(side.snapshot))if(!['balances','allowances','specifications'].includes(name))assert(side.queries[name],'QUERY_REQUIRED:'+name);
  for(const [name,owner,spender]of [['partialAllowance',addresses.partial,addresses.funding],['ownerAllowance',saved.account,addresses.partial]]){const x=side.specialAllowances[name];same(x.owner,owner);same(x.spender,spender);same(x.token,addresses.token);}
  assert.equal(side.contracts.length,13);assert.equal(new Set(side.contracts.map(x=>x.address.toLowerCase())).size,13);
  for(const x of side.contracts){const role=Object.values(context.roles).find(y=>y.address.toLowerCase()===x.address.toLowerCase());assert(role);assert.equal(x.name,role.name);assert.equal(x.blockTag,side.startBlock.number);assert.equal(x.blockHash,side.startBlock.hash);checkRuntime(x);}
  same(side.snapshot.longExposure[0],context.other);assert.equal(side.snapshot.longExposure[1][0],saved.domain);assert.equal(side.snapshot.longExposure[1][2],2n);
  same(side.snapshot.exposure[0],saved.account);assert.equal(side.snapshot.exposure[1][0],saved.domain);
 }
 equalData(a.domain,b.domain);
 const domain=tuple('core','domain',b.domain);
 const configFields=iface('core').getFunction('domain').outputs[0].components.find(x=>x.name==='cfg').components;
 const cfg=Object.fromEntries(configFields.map((field,index)=>[field.name,domain.cfg[index]]));
 assert.equal(cfg.feeBps,1n,'G01_POLICY_FEE_BPS');assert.equal(cfg.policyDigest,ethers.id('POSITIVE_FEE_TWO_ACCOUNTS'),'G01_POLICY_DIGEST');
 same(domain.token,addresses.token);assert.equal(domain.decimals_,6n);
 const integerEntry=b.specifications.find(x=>x[0]===saved.specification);assert(integerEntry,'INTEGER_SPEC_REQUIRED');
 const spec=tuple('coord','integerSpecification',integerEntry[2]);assert.equal(spec.id,saved.specification);assert.equal(spec.sealedId,seal.settlementId);assert.equal(spec.planHash,seal.planHash);assert.equal(spec.accountKey,plan.accountKey);assert.equal(spec.epoch,plan.firstEpoch);assert.equal(spec.calculationStep,seal.step);assert.equal(spec.specificationSequence,seq);assert.equal(spec.calculationStep,seq);assert.equal(spec.expectedActualExecutionSequence,0n);assert.equal(spec.actualReceiptConfirmed,false);
 assert.equal(spec.budget,target.budget);assert.equal(spec.pnlTarget,target.pnl);assert.equal(spec.fundingTarget,target.funding);assert.equal(spec.accountDebtLimit,20n);assert.equal(spec.positionDebtLimit,20n);assert.equal(spec.feeTarget,target.fee);assert.equal(spec.fundingDelta,10n);assert.equal(b.modeled,target.funding);assert.equal(a.executor[1],spec.budget);assert.equal(a.executor[2],spec.pnlTarget);assert.equal(a.executor[3],spec.fundingTarget);assert.equal(a.executor[4],spec.feeTarget);
 assert.equal(spec.id,key(['string',...Array(4).fill('bytes32'),...Array(10).fill('uint256')],['INTEGER_SPECIFICATION_NOT_RECEIPT',seal.settlementId,seal.planHash,seal.epochRoot,plan.accountKey,plan.firstEpoch,seal.step,spec.specificationSequence,spec.budget,spec.pnlTarget,spec.fundingTarget,spec.feeTarget,spec.accountDebtLimit,spec.positionDebtLimit,b.modeled-spec.fundingDelta]));
 const values={pnl:a.executor[2]-b.executor[2],funding:a.executor[3]-b.executor[3],fee:a.executor[4]-b.executor[4],linkedConsumed:a.consumed-b.consumed,heldDecrease:b.held-a.held,lpIncrease:a.pool[1]-b.pool[1]};
 assert.equal(values.pnl,300000n);assert.equal(values.funding,10n);assert.equal(values.fee,target.fee-previous.fee);assert.equal(values.linkedConsumed,target.budget-previous.budget);assert.equal(values.heldDecrease,values.linkedConsumed);assert.equal(values.lpIncrease,300000n);assert.equal(a.pool[7]-b.pool[7],values.fee,'REPEAT_FEE_BUCKET_INCREASE');
 for(const name of ['pending','reserved','shares','totalShares','basis','exit','releases','returnAvailable','receiptState','fundingPayout','allowances','partialAllowance','ownerAllowance','sealed','latest','modeled','exposure','epoch','member','attributed'])equalData(a[name],b[name]);
 for(const j of [2,3,4,5,6,8,9,10,11])assert.equal(a.pool[j],b.pool[j]);
 equalData(a.executor,[seq,target.budget,target.pnl,target.funding,target.fee,saved.specification]);
 equalData(b.executor,[seq-1n,previous.budget,previous.pnl,previous.funding,previous.fee,saved.previousSpecification]);assert.equal(b.consumed,previous.budget);assert.equal(a.consumed,target.budget);
 if(seq===2n){const old=b.specifications.find(x=>x[0]===saved.previousSpecification);assert(old);assert.equal(old[1],true);const prior=tuple('coord','integerSpecification',old[2]);equalData([prior.specificationSequence,prior.calculationStep,prior.budget,prior.pnlTarget,prior.fundingTarget,prior.feeTarget],[1n,1n,300010n,300000n,10n,0n]);assert.equal(prior.sealedId,seal.settlementId);assert.equal(prior.planHash,seal.planHash);}
 for(const name of ['cash','collected','custody']){assert.equal(a[name]-b[name],10n,'FUNDING_INCREASE:'+name);assert.equal(b[name],10n*(seq-1n));assert.equal(a[name],10n*seq);}
 assert.equal(b.accounted-a.accounted,10n);assert.equal(b.pool[0]-a.pool[0],10n);
 for(let index=0;index<6;index++)assert.equal(a.balances[index]-b.balances[index],index===4?-10n:index===5?10n:0n,'BALANCE_DELTA:'+index);
 assert.equal(a.partialAllowance,0n);assert.equal(b.partialAllowance,0n);
 for(const name of ['longBasis','longExit','longConsumed','longExposure','longMember','longAttributed','longShares','ownerShares','longOwnerAllowance','longLatest','longReturn'])equalData(a[name],b[name]);
 assert.equal(a.longConsumed,0n);assert.equal(a.longLatest,ethers.ZeroHash);
 const ep=b.epoch[0];assert.equal(ep[0],saved.timing.origin);assert.equal(ep[1],saved.timing.origin+100n);assert.equal(ep[2],ep[1]);equalData([ep[3],ep[4],ep[5],ep[6],ep[7],ep[8],ep[9],ep[10]],[expected.le,expected.se,expected.matched,2n,2n,expected.le,expected.se,3n]);
 assert.equal(b.epoch[1]*expected.usd.d,expected.usd.n*b.epoch[2]);
 for(const [member,le,se,debt,claim]of [[b.member,0n,expected.se,expected.usd.n,0n],[b.longMember,expected.le,0n,0n,expected.usd.n]]){equalData(member.slice(0,4),[le,se,1n,1n]);assert(member[5]>0n&&member[7]>0n);assert.equal(member[4],debt*member[5]);assert.equal(member[6],claim*member[7]);}
 for(const [value,le,se,debt,claim]of [[b.attributed,0n,expected.se,expected.usd.n,0n],[b.longAttributed,expected.le,0n,0n,expected.usd.n]]){equalData(value.slice(0,2),[le,se]);assert.equal(value[4],true);assert.equal(value[2][0],debt*value[2][1]);assert.equal(value[3][0],claim*value[3][1]);}assert.equal(a.specifications.find(x=>x[0]===saved.specification)[1],true);assert.equal(integerEntry[1],false);
 for(const [id,used,integer]of b.specifications){const actual=a.specifications.find(x=>x[0]===id);assert(actual);assert.equal(actual[1],id===saved.specification?true:used);equalData(actual[2],integer);}
 assert.equal(b.partialAuth,ethers.ZeroHash);assert.equal(b.fundingAuth,ethers.ZeroHash);assert.equal(a.partialAuth,ethers.ZeroHash);assert.equal(a.fundingAuth,ethers.ZeroHash);assert.equal(a.pool[0],a.pool.slice(1,8).reduce((x,y)=>x+y,0n)+a.held);
 assert.equal(saved.transactionState,'RECEIPT_RETURNED');same(saved.transactionHash,saved.transaction.hash);
 const decoded=iface('executor').decodeFunctionData('execute',saved.transaction.input);equalData(decoded,[saved.pid,saved.specification,saved.sequence]);
 same(saved.transaction.from,saved.account);same(saved.transaction.to,addresses.executor);same(saved.transaction.hash,saved.receipt.transactionHash);same(saved.receipt.blockHash,saved.block.hash);same(saved.transaction.blockHash,saved.block.hash);same(saved.after.endBlock.hash,saved.block.hash);
 assert.equal(saved.receipt.blockNumber,saved.block.number);assert.equal(saved.transaction.blockNumber,saved.block.number);assert.equal(BigInt(saved.before.endBlock.number)+1n,BigInt(saved.block.number));same(saved.block.parentHash,saved.before.endBlock.hash);assert(saved.block.timestamp);assert.equal(saved.receipt.status,'0x1');same(saved.receipt.from,saved.account);same(saved.receipt.to,addresses.executor);
 assert.equal(saved.block.transactions.length,1,'REPEAT_SINGLE_EXECUTION_BLOCK');const index=BigInt(saved.receipt.transactionIndex);assert(index>=0n&&index<BigInt(saved.block.transactions.length));same(saved.block.transactions[Number(index)],saved.transaction.hash);
 for(const log of saved.receipt.logs){same(log.transactionHash,saved.transaction.hash);same(log.blockHash,saved.block.hash);assert.equal(log.blockNumber,saved.block.number);assert.equal(log.removed,false);}
 const logs=saved.receipt.logs.filter(x=>x.address.toLowerCase()===addresses.executor.toLowerCase());assert.equal(logs.length,1);const event=iface('executor').parseLog(logs[0]);assert.equal(event.name,'Collected');equalData(event.args,[saved.keys.positionKey.value,saved.specification,seq,10n]);
 values.collectedAmount=event.args.amount;assert.equal(values.collectedAmount,10n);assert.equal(saved.collected.amount,values.collectedAmount);assert.equal(values.collectedAmount,values.funding);assert.equal(saved.collected.meaning,'Funding cumulative increase; not total consumption');
 return {values,scope:'STORED_LOCAL_CONSISTENCY_ONLY',amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
}

// Takes stored bytes and fixed ABI only. No live fixture or filesystem lookup.
export function verifyRepeatedConsumption(firstBytes,secondBytes,fixedABIBytes){
 const first=verifyRepeatedStep(firstBytes,fixedABIBytes),second=verifyRepeatedStep(secondBytes,fixedABIBytes);
 const x=decodeStored(JSON.parse(firstBytes.toString('utf8'))),y=decodeStored(JSON.parse(secondBytes.toString('utf8')));
 assert.equal(x.sequence,1n);assert.equal(y.sequence,2n);assert.notEqual(x.transactionHash,y.transactionHash);assert.notEqual(x.specification,y.specification);assert.equal(y.previousSpecification,x.specification);
 for(const k of ['chainId','domain','account','pid','longPid'])assert.equal(x[k],y[k],'REPEAT_SCOPE:'+k);
 equalData(x.context,y.context);equalData(x.keys,y.keys);equalData(x.timing,y.timing);equalData(x.transitions,y.transitions);
 // Only budget/specification creation is permitted between the two consumes.
 for(const k of Object.keys(x.after.snapshot))if(!['sealed','latest','modeled','specifications'].includes(k))equalData(x.after.snapshot[k],y.before.snapshot[k]);
 assert(BigInt(y.before.startBlock.number)>BigInt(x.after.endBlock.number));
 const fixed=fixedABI(fixedABIBytes),ci=new ethers.Interface(fixed.contracts.LocalFuturesSettlementCoordinator.abi);
 assert.equal(y.intermediateTransactions.length,2);
 let parent=x.block.hash,number=BigInt(x.block.number);
 for(const [i,method,args]of [[0,'specifyCumulativeBudget',[x.pid,x.keys.settlementId.value,2n,600320n]],[1,'recordIntegerSpecification',[x.pid,x.keys.settlementId.value,2n,10n]]]){
  const entry=y.intermediateTransactions[i],t=entry.transaction,r=entry.receipt,b=entry.block;
  same(t.to,x.context.roles.coord.address);same(t.from,x.account);same(t.input,ci.encodeFunctionData(method,args));same(t.hash,r.transactionHash);same(t.blockHash,b.hash);same(r.blockHash,b.hash);assert.equal(r.status,'0x1');assert.equal(t.blockNumber,b.number);assert.equal(r.blockNumber,b.number);
  assert.equal(b.transactions.length,1);same(r.from,x.account);same(r.to,x.context.roles.coord.address);
  assert.equal(BigInt(b.number),number+1n);same(b.parentHash,parent);same(b.transactions[Number(BigInt(r.transactionIndex))],t.hash);parent=b.hash;number=BigInt(b.number);
 }
 same(y.before.startBlock.hash,parent);assert.equal(BigInt(y.before.startBlock.number),number);
 assert.equal(x.before.snapshot.held-y.after.snapshot.held,600320n);assert.equal(y.after.snapshot.consumed-x.before.snapshot.consumed,600320n);
 assert.equal(y.after.snapshot.pool[1]-x.before.snapshot.pool[1],600000n);assert.equal(y.after.snapshot.pool[7]-x.before.snapshot.pool[7],300n);
 for(const k of ['cash','collected','custody'])assert.equal(y.after.snapshot[k]-x.before.snapshot[k],20n);
 return {steps:[first,second],total:{pnl:600000n,funding:20n,fee:300n,consumed:600320n},scope:'TWO_STORED_LOCAL_EXECUTIONS_ONLY',amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
}
