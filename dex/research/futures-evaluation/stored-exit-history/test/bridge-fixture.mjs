import {ethers} from 'ethers';
import assert from 'node:assert/strict';
import {deploy,mined as minedBase,assertRuntime,expectedRuntime} from './runtime-tools.mjs';
const fixtures=new WeakMap();
export function fixtureInternals(x){assert(fixtures.has(x),"LOCAL_FIXTURE_CONTEXT_REQUIRED");return fixtures.get(x);}
export async function createBridgeFixture(provider,gov,user){
const W=10n**18n,MAX=ethers.MaxUint256;let core,funding,partial,attr,token,market,oracle,v,start,pid,key,partialTime,finalTime;const result={actualLocal:[]},transactions=[];const mined=async p=>{const r=await minedBase(p);transactions.push(r.hash);return r;};
 const cfg={minOrder:W,maxOrder:10n*W,maxPosition:10n*W,maxOI:100n*W,bufferUsd:W,liquidationCostUsd:W,maxPositions:10,maxBatch:4,marketAge:10000,collateralAge:10000,maxSkew:10000,initialMarginBps:5000,maintenanceBps:4000,stressBps:3000,feeBps:0,insuranceCoverageBps:0,fundingDeltaLimit:10n**25n,policyDigest:ethers.id('GAP_LOCAL_ONLY'),observationPolicyReady:true,fundingPolicyReady:true};
 const at=async t=>{await provider.send('evm_setNextBlockTimestamp',[ethers.toQuantity(t)]);await provider.send('evm_mine',[]);};
 const prices=async(t,pm,pc)=>{await mined(market.set(pm,t));await mined(oracle.set(pc,t));};
 async function reduce(p,q,s){const r=await mined(core.connect(user).reduceExposureResearch(p,q,s));return BigInt((await provider.getBlock(r.blockNumber)).timestamp);}
 async function state(){return {pool:[...await partial.partialPool(2)],held:await partial.linkedHeld(2),consumed:await partial.linkedConsumed(pid),cash:await token.balanceOf(partial.target),tokenAccounted:await partial.tokenAccounted(token.target),count:await core.exposurePositionCount()};}
 await (async()=>{
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
 result.expectedCodes=[expectedRuntime('LocalFuturesCore',{governance:gov.address}),expectedRuntime('LocalFuturesFundingV11',{core:core.target,exposureLedger:ledger}),expectedRuntime('LocalFuturesPartialV11',{core:core.target,funding:funding.target,legacyDomainCutoff:1n,withdrawalVerifier:withdrawal,withdrawalVerifierCodeHash:withdrawalHash,releaseVerifier:release.target,releaseVerifierCodeHash:releaseHash,linkedExposureVerifier:linked.target,linkedExposureVerifierCodeHash:linkedHash}),expectedRuntime('LocalFuturesAttribution',{core:core.target,funding:funding.target,partialSettlement:partial.target})];
  v=await deploy('StoredExitHistoryVerifier',gov,[[core.target,funding.target,partial.target,attr.target],pins]);await assertRuntime(provider,v,'StoredExitHistoryVerifier');
  result.actualLocal.push({peers:[core.target,funding.target,partial.target,attr.target],compilerDerivedRuntimeHashes:pins,registryConnected:false,oracle:'LocalVNextOracle MOCK',fundingRate:0,policy:'EXISTING_LOCAL_RESEARCH_NOT_NEW_V1_APPROVAL'});
  await at(start);await prices(start,W,W);await mined(core.connect(user).openLinkedExposureResearch(2,3n*W,true,100n*10n**6n));pid=await core.exposureAccountPosition(2,user.address);key=(await attr.traces(pid)).key;
  await at(start+10n);await prices(start+10n,11n*W/10n,9n*W/10n);partialTime=await reduce(pid,W,2);
  await at(start+20n);await prices(start+20n,12n*W/10n,8n*W/10n);finalTime=await reduce(pid,2n*W,3);
 })();
const internals={core,funding,partial,attr,token,market,oracle,v,start,pid,key,partialTime,finalTime,user,gov,transactions,pins:result.actualLocal[0].compilerDerivedRuntimeHashes,expectedCodes:result.expectedCodes};const context=Object.freeze({kind:"LOCAL_RESEARCH_FIXTURE_2_116"});Object.freeze(internals.transactions);Object.freeze(internals.pins);Object.freeze(internals.expectedCodes);Object.freeze(internals);fixtures.set(context,internals);return context;
}
