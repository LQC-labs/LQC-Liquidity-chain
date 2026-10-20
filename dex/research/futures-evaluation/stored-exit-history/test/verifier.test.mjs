import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ethers} from 'ethers';
import anvil from './anvil-compat.mjs';
import {deploy,mined,assertRuntime,expectedRuntime,rejects,errors,artifact} from './runtime-tools.mjs';
const abi=ethers.AbiCoder.defaultAbiCoder(),Z=ethers.ZeroHash,W=10n**18n,MAX=ethers.MaxUint256;
const result={actualLocal:[],mock:[],limits:'full account scan <=256; local stored-source consistency, not Oracle/policy/Funding authentication'};
let rpc,provider,gov,user;
before(async()=>{rpc=anvil.provider({wallet:{totalAccounts:4}});await rpc.request({method:'anvil_setBlockTimestampInterval',params:[0]});provider=new ethers.BrowserProvider(rpc,undefined,{cacheTimeout:-1,pollingInterval:20});gov=await provider.getSigner(0);user=await provider.getSigner(1);assert.equal((await provider.getNetwork()).chainId,31337n);});
after(async()=>{fs.writeFileSync((process.env.LQC108_RESULT_DIR??'results')+'/test-observations.json',JSON.stringify({result,errors},(_,v)=>typeof v==='bigint'?v.toString():v,2));provider?.destroy();await rpc?.disconnect();});
const receipt=(key,seq,t,oldL,oldS,nextL,nextS)=>ethers.keccak256(abi.encode(['bytes32',...Array(6).fill('uint256')],[key,seq,t,oldL,oldS,nextL,nextS]));
function safety(r){assert.equal(r.amountState,0n);assert.equal(r.blockers,15n);for(const k of ['priceAuthenticated','policyAuthenticated','fundingAuthenticated','chainIndependentlyAuthenticated','settlementAuthorized','createsClaim','consumesHistory','paymentAuthorized','returnAuthorized','heldUseAuthorized','lpRecoveryAuthorized','rightsTransferAuthorized'])assert.equal(r[k],false,k);}
describe('stored exit verifier adversarial mocks',function(){
 this.timeout(120000);let core,fund,partial,attr,v,peers,pins,key,trace,basis,rows,exits,snap;
 before(async()=>{
  core=await deploy('MockHistoryCore',gov);fund=await deploy('MockHistoryFunding',gov);partial=await deploy('MockHistoryPartial',gov);attr=await deploy('MockHistoryAttribution',gov);
  peers=[core.target,fund.target,partial.target,attr.target];pins=['MockHistoryCore','MockHistoryFunding','MockHistoryPartial','MockHistoryAttribution'].map(n=>ethers.keccak256(expectedRuntime(n)));
  const policy=ethers.id('MOCK_ONLY_POLICY');key=ethers.keccak256(abi.encode(['address','address','uint256','uint256','address','uint256','bytes32'],[core.target,fund.target,2,1,user.address,1,policy]));
  basis=[key,300,100,300,100,3,1,W];trace=[key,user.address,2,1,100,120,0,3,true];
  rows=[[100,1,1,0,0,300,0,receipt(key,1,100,0,0,300,0)],[110,1,2,300,0,200,0,receipt(key,2,110,300,0,200,0)],[120,1,3,200,0,0,0,receipt(key,3,120,200,0,0,0)]];
  exits=[[3,110,33,100,W,W,109,109,200,1,rows[1][7]],[2,120,67,300,2n*W,W,120,120,200,1,rows[2][7]]];
  await mined(core.setup(fund.target,partial.target,user.address,policy));await mined(fund.setup(core.target,policy));await mined(partial.setup(core.target,fund.target,attr.target,basis));await mined(attr.setup(core.target,fund.target,partial.target,user.address,trace,policy));
  for(let i=0;i<3;i++)await mined(attr.setTransition(i+1,rows[i]));for(let i=0;i<2;i++)await mined(partial.setExit(i+2,exits[i]));
  for(let i=0;i<4;i++)await assertRuntime(provider,{target:peers[i]},['MockHistoryCore','MockHistoryFunding','MockHistoryPartial','MockHistoryAttribution'][i]);
  v=await deploy('StoredExitHistoryVerifier',gov,[peers,pins]);
 });
 beforeEach(async()=>{snap=await provider.send('evm_snapshot',[]);});
 afterEach(async()=>{assert.equal(await provider.send('evm_revert',[snap]),true);});
 const inspect=(commit=Z,closed=true)=>v.inspect(1,key,3,commit,closed);
 it('mock valid stored history has explicit blockers and no amount fields',async()=>{const r=await inspect();assert(r.historyMatches&&r.completelyClosed);assert.equal(r.exitCount,2n);assert.equal(r.cumulativeClosed,300n);safety(r);result.mock.push({commitment:r.commitment,coverage:'MOCK_ONLY'});assert(!artifact('StoredExitHistoryVerifier').abi.find(x=>x.type==='function'&&x.name==='inspect').outputs[0].components.some(c=>['amount','confirmedAmount'].includes(c.name)));});
 it('mock caller commitment only constrains identical stored result',async()=>{const r=await inspect();assert.equal((await inspect(r.commitment)).commitment,r.commitment);await rejects(v,inspect(ethers.id('wrong')),'CommitmentMismatch','caller commitment');});
 it('mock missing target row reaches sequence check',async()=>{await mined(attr.setTransition(2,[...rows[1].slice(0,1),9,...rows[1].slice(2)]));await rejects(v,inspect(),'SequenceMismatch','missing target');});
 it('mock duplicated row reaches sequence check',async()=>{await mined(attr.setTransition(2,rows[0]));await rejects(v,inspect(),'SequenceMismatch','duplicate');});
 it('mock reversed rows reach sequence check',async()=>{await mined(attr.setTransition(1,rows[1]));await rejects(v,inspect(),'SequenceMismatch','reverse');});
 it('mock other position row cannot replace target final',async()=>{const a=[...rows[2]];a[1]=2;await mined(attr.setTransition(3,a));await rejects(v,inspect(),'TerminalMismatch','foreign position');});
 it('mock different Series core context reaches scope check',async()=>{await mined(core.context(user.address,[2,2,3,0,0],ethers.id('MOCK_ONLY_POLICY')));await rejects(v,inspect(),'ScopeMismatch','series');});
 it('mock foreign owner reaches scope check',async()=>{await mined(core.context(gov.address,[2,1,3,0,0],ethers.id('MOCK_ONLY_POLICY')));await rejects(v,inspect(),'ScopeMismatch','owner');});
 it('mock final Sequence disagreement reaches sequence check',async()=>{await mined(fund.setSequence(4));await rejects(v,inspect(),'SequenceMismatch','funding sequence');});
 it('mock wrong caller final Sequence is not accepted',async()=>{await rejects(v,v.inspect(1,key,2,Z,true),'SequenceMismatch','expected sequence');});
 it('mock quantity chain mismatch reaches transition check',async()=>{const r=[...rows[1]];r[3]=299;await mined(attr.setTransition(2,r));await rejects(v,inspect(),'TransitionMismatch','quantity');});
 it('mock wrong direction reaches transition check',async()=>{const r=[...rows[1]];r[3]=0;r[4]=300;await mined(attr.setTransition(2,r));await rejects(v,inspect(),'TransitionMismatch','direction');});
 it('mock corrupted source Receipt reaches Receipt check',async()=>{const r=[...rows[1]];r[7]=ethers.id('bad');await mined(attr.setTransition(2,r));await rejects(v,inspect(),'ReceiptMismatch','receipt');});
 it('mock LinkedExit timestamp mismatch reaches exit check',async()=>{const e=[...exits[0]];e[1]=111;await mined(partial.setExit(2,e));await rejects(v,inspect(),'ExitMismatch','exit time');});
 it('mock reverse original timestamp reaches account order check',async()=>{const r=[...rows[2]];r[0]=109;await mined(attr.setTransition(3,r));await rejects(v,inspect(),'TransitionMismatch','timestamp order');});
 it('mock cumulative quantity mismatch reaches terminal check',async()=>{const b=[...basis];b[3]=299;await mined(partial.setBasis(b));await rejects(v,inspect(),'TerminalMismatch','closed total');});
 it('mock final ordinal mismatch reaches terminal check',async()=>{await mined(attr.setFinal(2));await rejects(v,inspect(),'TerminalMismatch','final ordinal');});
 it('mock code hash mismatch is rejected before link acceptance',async()=>{const bad=[...pins];bad[0]=ethers.id('bad');await rejects(v,deploy('StoredExitHistoryVerifier',gov,[peers,bad]),'CodeHash','constructor pins');});
 it('mock linked address drift is rechecked on every view',async()=>{await mined(core.links(fund.target,gov.address));await rejects(v,inspect(),'LinkMismatch','runtime links');});
 it('mock runtime replacement reaches pinned bytecode check',async()=>{await provider.send('anvil_setCode',[core.target,'0x60006000f3']);await rejects(v,inspect(),'CodeHash','runtime drift');});
 it('mock source log exceeding full-scan bound is rejected',async()=>{await mined(attr.setLog([257,0,0,120]));await rejects(v,inspect(),'HistoryBound','history cap');});
 it('mock cap256 scans the entire normal account log and reports measured gas',async()=>{
  const policy=ethers.id('MOCK_ONLY_POLICY'),last=[120,1,2,300,0,0,0,receipt(key,2,120,300,0,0,0)];
  await mined(core.context(user.address,[2,1,2,0,0],policy));await mined(fund.setSequence(2));
  await mined(partial.setBasis([key,300,100,300,100,2,0,W]));await mined(attr.setTrace([key,user.address,2,1,100,120,0,2,true]));
  await mined(attr.setConfig([1,policy,100,100,1,256,4]));await mined(attr.setLog([256,0,0,120]));await mined(attr.setFinal(2));await mined(attr.setTransition(2,last));
  await mined(partial.setExit(3,[2,120,100,300,W,W,120,120,200,1,last[7]]));
  const rest=[];for(let p=2;p<=128;p++){const k=ethers.keccak256(abi.encode(['address','address','uint256','uint256','address','uint256','bytes32'],[core.target,fund.target,2,1,user.address,p,policy]));rest.push([120,p,1,0,0,1,0,receipt(k,1,120,0,0,1,0)],[120,p,2,1,0,0,0,receipt(k,2,120,1,0,0,0)]);}
  assert.equal(rest.length,254);for(let i=0;i<rest.length;i+=32)await mined(attr.setTransitions(i+3,rest.slice(i,i+32)));
  const r=await v.inspect(1,key,2,Z,true,{gasLimit:30000000});assert(r.historyMatches&&r.completelyClosed);assert.equal(r.accountRecordsScanned,256n);assert.equal(r.exitCount,1n);safety(r);
  const gas=await v.inspect.estimateGas(1,key,2,Z,true,{gasLimit:30000000});result.mock.push({case:'cap256',gas,scope:'MOCK target two rows plus 127 sequential other positions; not authentic chain or worst-case gas',rows:256});
 });
 it('mock cap256 rejects row257 before scanning',async()=>{await mined(attr.setConfig([1,ethers.id('MOCK_ONLY_POLICY'),100,100,1,256,4]));await mined(attr.setLog([257,0,0,120]));await rejects(v,inspect(),'HistoryBound','cap256 row257');});
 it('mock caller cannot supply a page or transition list',async()=>{const methods=v.interface.fragments.filter(x=>x.type==='function').map(x=>x.name);assert(!methods.includes('register'));assert(!methods.includes('submit'));const inspectAbi=artifact('StoredExitHistoryVerifier').abi.find(x=>x.name==='inspect');assert(inspectAbi.inputs.every(x=>!x.type.includes('[]')));assert(v.interface.fragments.filter(x=>x.type==='function').every(x=>['view','pure'].includes(x.stateMutability)));});
});

describe('stored exit verifier actual local V11 storage',function(){
 this.timeout(180000);let core,funding,partial,attr,token,market,oracle,v,start,pid,key,partialTime,finalTime;
 const cfg={minOrder:W,maxOrder:10n*W,maxPosition:10n*W,maxOI:100n*W,bufferUsd:W,liquidationCostUsd:W,maxPositions:10,maxBatch:4,marketAge:10000,collateralAge:10000,maxSkew:10000,initialMarginBps:5000,maintenanceBps:4000,stressBps:3000,feeBps:0,insuranceCoverageBps:0,fundingDeltaLimit:10n**25n,policyDigest:ethers.id('GAP_LOCAL_ONLY'),observationPolicyReady:true,fundingPolicyReady:true};
 const at=async t=>{await provider.send('evm_setNextBlockTimestamp',[ethers.toQuantity(t)]);await provider.send('evm_mine',[]);};
 const prices=async(t,pm,pc)=>{await mined(market.set(pm,t));await mined(oracle.set(pc,t));};
 async function reduce(p,q,s){const r=await mined(core.connect(user).reduceExposureResearch(p,q,s));return BigInt((await provider.getBlock(r.blockNumber)).timestamp);}
 async function state(){return {pool:[...await partial.partialPool(2)],held:await partial.linkedHeld(2),consumed:await partial.linkedConsumed(pid),cash:await token.balanceOf(partial.target),tokenAccounted:await partial.tokenAccounted(token.target),count:await core.exposurePositionCount()};}
 before(async()=>{
  core=await deploy('LocalFuturesCore',gov);funding=await deploy('LocalFuturesFundingV11',gov,[core.target]);await mined(core.bindFundingStudy(funding.target));
  token=await deploy('LocalVNextToken',gov,[6]);market=await deploy('LocalVNextOracle',gov);oracle=await deploy('LocalVNextOracle',gov);const now=BigInt((await provider.getBlock('latest')).timestamp);await prices(now,W,W);
  await mined(core.createDomain(token.target,market.target,oracle.target,token.target,gov.address,gov.address,cfg));
  const nonce=BigInt(await provider.send('eth_getTransactionCount',[gov.address,'pending'])),predicted=ethers.getCreateAddress({from:gov.address,nonce:nonce+2n});
  const release=await deploy('LocalFuturesReleaseVerifier',gov,[core.target,funding.target,predicted]);const releaseHash=await assertRuntime(provider,release,'LocalFuturesReleaseVerifier',{core:core.target,funding:funding.target,partialSettlement:predicted});
  const linked=await deploy('LocalFuturesLinkedExposureVerifier',gov,[core.target,funding.target,predicted]);const linkedHash=await assertRuntime(provider,linked,'LocalFuturesLinkedExposureVerifier',{core:core.target,funding:funding.target,partialSettlement:predicted});
  partial=await deploy('LocalFuturesPartialV11',gov,[core.target,funding.target,release.target,releaseHash,linked.target,linkedHash]);assert.equal(partial.target,predicted);await mined(core.bindPartialStudy(partial.target));
  attr=await deploy('LocalFuturesAttribution',gov,[partial.target]);await mined(partial.bindAttribution(attr.target));
  await mined(core.createDomain(token.target,market.target,oracle.target,token.target,gov.address,gov.address,cfg));start=BigInt((await provider.getBlock('latest')).timestamp)+100n;
  await mined(core.configureExposureResearch(2,1,start,100,1,4,8,0));await mined(funding.enablePolicyGapStudy(2,1));await mined(partial.configureLinkedResearch(2,3));await mined(attr.registerDomain(2,16,4));await mined(partial.enableResearchLP(2));
  await mined(token.mint(gov.address,2000n*10n**6n));await mined(token.approve(partial.target,MAX));await mined(partial.depositResearchLP(2,1000n*10n**6n,1));await mined(token.mint(user.address,1000n*10n**6n));await mined(token.connect(user).approve(partial.target,MAX));
  const ledger=ethers.getCreateAddress({from:funding.target,nonce:1});assert.equal(await funding.exposureLedger(),ledger);
  const withdrawal=ethers.getCreateAddress({from:partial.target,nonce:1});assert.equal(await partial.withdrawalVerifier(),withdrawal);
  const withdrawalHash=ethers.keccak256(expectedRuntime('LocalFuturesWithdrawalVerifier',{core:core.target,funding:funding.target,partialSettlement:partial.target}));assert.equal(await provider.getCode(withdrawal),expectedRuntime('LocalFuturesWithdrawalVerifier',{core:core.target,funding:funding.target,partialSettlement:partial.target}));
  const pins=[await assertRuntime(provider,core,'LocalFuturesCore',{governance:gov.address}),await assertRuntime(provider,funding,'LocalFuturesFundingV11',{core:core.target,exposureLedger:ledger}),await assertRuntime(provider,partial,'LocalFuturesPartialV11',{core:core.target,funding:funding.target,legacyDomainCutoff:1n,withdrawalVerifier:withdrawal,withdrawalVerifierCodeHash:withdrawalHash,releaseVerifier:release.target,releaseVerifierCodeHash:releaseHash,linkedExposureVerifier:linked.target,linkedExposureVerifierCodeHash:linkedHash}),await assertRuntime(provider,attr,'LocalFuturesAttribution',{core:core.target,funding:funding.target,partialSettlement:partial.target})];
  v=await deploy('StoredExitHistoryVerifier',gov,[[core.target,funding.target,partial.target,attr.target],pins]);await assertRuntime(provider,v,'StoredExitHistoryVerifier');
  result.actualLocal.push({peers:[core.target,funding.target,partial.target,attr.target],compilerDerivedRuntimeHashes:pins,registryConnected:false,oracle:'LocalVNextOracle MOCK',fundingRate:0,policy:'EXISTING_LOCAL_RESEARCH_NOT_NEW_V1_APPROVAL'});
  await at(start);await prices(start,W,W);await mined(core.connect(user).openLinkedExposureResearch(2,3n*W,true,100n*10n**6n));pid=await core.exposureAccountPosition(2,user.address);key=(await attr.traces(pid)).key;
  await at(start+10n);await prices(start+10n,11n*W/10n,9n*W/10n);partialTime=await reduce(pid,W,2);
  await at(start+20n);await prices(start+20n,12n*W/10n,8n*W/10n);finalTime=await reduce(pid,2n*W,3);
 });
 it('actual V11 different stored exit times and prices match full history',async()=>{assert.equal(partialTime,start+10n);assert.equal(finalTime,start+20n);const before=await state(),r=await v.inspect(pid,key,3,Z,true),after=await state();assert.deepEqual(after,before);assert(r.historyMatches&&r.completelyClosed);assert.equal(r.exitCount,2n);assert.equal(r.cumulativeClosed,3n*W);assert.equal(r.remaining,0n);safety(r);const first=await partial.linkedExit(pid,2,false),last=await partial.linkedExit(pid,3,true);assert.notEqual(first.market,last.market);assert.notEqual(first.collateral,last.collateral);result.actualLocal.push({pid,key,partialTime,finalTime,report:r.toObject(true),estimatedViewGas:await v.inspect.estimateGas(pid,key,3,Z,true)});});
 it('actual V11 identical input gives same commitment without consuming state',async()=>{const a=await v.inspect(pid,key,3,Z,true),b=await v.inspect(pid,key,3,a.commitment,true);assert.equal(a.commitment,b.commitment);assert.equal(await partial.linkedConsumed(pid),0n);safety(b);});
 it('actual V11 same timestamp preserves original partial and final Sequence',async()=>{
  await at(start+21n);await prices(start+21n,W,W);await mined(core.connect(user).openLinkedExposureResearch(2,3n*W,false,100n*10n**6n));const p=await core.exposureAccountPosition(2,user.address),k=(await attr.traces(p)).key;
  await at(start+30n);await prices(start+30n,W,W);const t1=await reduce(p,W,2),t2=await reduce(p,2n*W,3);assert.equal(t1,start+30n);assert.equal(t2,t1);const r=await v.inspect(p,k,3,Z,true);assert(r.completelyClosed);assert.equal(r.accountRecordsScanned,6n);safety(r);result.actualLocal.push({sameTimestamp:t1,pid:p,report:r.toObject(true)});
 });
 it('actual V11 open partial history cannot claim complete closure',async()=>{
  await at(start+31n);await prices(start+31n,W,W);await mined(core.connect(user).openLinkedExposureResearch(2,3n*W,true,100n*10n**6n));const p=await core.exposureAccountPosition(2,user.address),k=(await attr.traces(p)).key;
  await at(start+40n);await prices(start+40n,W,W);await reduce(p,W,2);await rejects(v,v.inspect(p,k,2,Z,true),'OpenPosition','real open completion');const r=await v.inspect(p,k,2,Z,false);assert(r.historyMatches&&!r.completelyClosed);assert.equal(r.remaining,2n*W);assert.equal(r.exitCount,1n);safety(r);result.actualLocal.push({openPosition:p,report:r.toObject(true)});
 });
 it('actual peers do not accept a constructor pin derived from an unrelated artifact',async()=>{const peers=[core.target,funding.target,partial.target,attr.target],pins=result.actualLocal[0].compilerDerivedRuntimeHashes.slice();pins[2]=ethers.keccak256(expectedRuntime('MockHistoryPartial'));await rejects(v,deploy('StoredExitHistoryVerifier',gov,[peers,pins]),'CodeHash','real wrong artifact');});
});
