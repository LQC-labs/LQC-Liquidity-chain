
import assert from 'node:assert/strict';
import {getAddress,ZeroAddress} from 'ethers';
import {canonical,argsFor,uint} from './candidate-schema-v3.mjs';
// Written from adapter consumers + ABI getters, never generated from candidate requests/views.
// Values supplied by bindings identify this local fixture; they are NOT independent approval pins.
export const SPEC_VERSION='LQC_CONSUMER_QUERY_REQUIREMENTS_V1';
export const LINK_TARGETS={core:'LocalFuturesTradingCore',localFunding:'LocalFuturesFundingV11',funding:'LocalFuturesFundingV11',localPartial:'LocalFuturesPartialV11',partialSettlement:'LocalFuturesPartialV11',exposureLedger:'LocalFuturesExposureLedger',attribution:'LocalFuturesAttribution',coordinator:'LocalFuturesSettlementCoordinator',collectionCoordinator:'LocalFuturesSettlementCoordinator',collectionExecutor:'LocalFuturesCollectionExecutor',payoutSpecification:'LocalFuturesPayoutSpecification',payoutExecutor:'LocalFuturesPayoutExecutor',withdrawalVerifier:'LocalFuturesWithdrawalVerifier',releaseVerifier:'LocalFuturesReleaseVerifier',linkedExposureVerifier:'LocalFuturesLinkedExposureVerifier',registry:'Registry',domainRegistry:'Registry',preparedStateVerifier:'PreparedStateVerifier',operationPolicy:'OperationPolicy',tradingPreflight:'TradingPreflightVerifier'};
export const HASH_LINKS=[
 ['Registry','preparedStateVerifierCodeHash','PreparedStateVerifier'],['Registry','operationPolicyCodeHash','OperationPolicy'],
 ['LocalFuturesTradingCore','tradingPreflightCodeHash','TradingPreflightVerifier'],
 ['TradingPreflightVerifier','registryCodeHash','Registry'],['TradingPreflightVerifier','coreCodeHash','LocalFuturesTradingCore'],['TradingPreflightVerifier','attributionCodeHash','LocalFuturesAttribution'],
 ['LocalFuturesPartialV11','withdrawalVerifierCodeHash','LocalFuturesWithdrawalVerifier'],['LocalFuturesPartialV11','releaseVerifierCodeHash','LocalFuturesReleaseVerifier'],['LocalFuturesPartialV11','linkedExposureVerifierCodeHash','LocalFuturesLinkedExposureVerifier']
];
export function independentRequirements(scope,bindings,interfaces){
 const byRole=new Map(bindings.map(c=>[c.role,c])),requirements=[];
 const iface=role=>interfaces.get(getAddress(byRole.get(role).address).toLowerCase());
 const read=(role,method,args=[])=>{
  const normalized=argsFor(iface(role),method,args),rows=scope.finalViews.filter(v=>v.role===role&&v.method===method&&canonical(argsFor(iface(role),method,v.args))===canonical(normalized));
  assert(rows.length,'INDEPENDENT_CONTEXT_MISSING:'+role+'.'+method);return rows[0].result;
 };
 const need=(role,method,args,reason,caller=ZeroAddress)=>{const c=byRole.get(role);assert(c,'INDEPENDENT_ROLE_MISSING');requirements.push({rpc:'eth_call',role,target:getAddress(c.address),artifact:c.name,method,args:argsFor(iface(role),method,args),caller:getAddress(caller),blockTag:scope.queryBlock.blockTag,queryBlockHash:scope.queryBlock.hash,reason});};
 assert.equal(scope.history.length,1,'INDEPENDENT_SINGLE_POSITION_ONLY');
 const h=scope.history[0],pid=h.pid,ctx=read('LocalFuturesTradingCore','coreExposureContext',[pid]),[domain,series,sequence]=ctx[1];
 const basis=read('LocalFuturesPartialV11','linkedBasis',[pid])[0],key=basis[0];
 const accountKey=read('LocalFuturesAttribution','accountKey',[domain,h.account])[0],log=read('LocalFuturesAttribution','logs',[accountKey]),count=uint(log[0]);
 assert(count>=2n&&count<=256n,'INDEPENDENT_HISTORY_BOUNDS');assert.equal(uint(sequence),count,'INDEPENDENT_HISTORY_SEQUENCE');
 for(const c of bindings){
  requirements.push({rpc:'eth_getCode',role:c.role,target:getAddress(c.address),blockTag:scope.queryBlock.blockTag,queryBlockHash:scope.queryBlock.hash,reason:'runtime bytes for every bound contract role'});
  // Restrict ABI traversal to named connection getters actually consumed by verifyContracts.
  for(const f of iface(c.role).fragments)if(f.type==='function'&&['view','pure'].includes(f.stateMutability)&&f.inputs.length===0&&LINK_TARGETS[f.name])need(c.role,f.name,[],'verifyContracts: role connection');
 }
 for(const [role,method]of HASH_LINKS)need(role,method,[],'verifyContracts: verifier runtime pin');
 for(let i=0;i<12;i++){need('Registry','peers',[i],'12 peer slot addresses');need('Registry','approvedCodeHashes',[i],'12 peer slot code pins');}
 const entries=[
 ['LocalFuturesTradingCore','domain',[domain],'token/oracle/unit binding'],
 ['Registry','registration',[domain],'registered Profile and Phase'],
 ['LocalFuturesTradingCore','coreExposureContext',[pid],'position owner/domain/series/sequence'],
 ['LocalFuturesTradingCore','exposurePositions',[pid],'closed position state'],
 ['LocalFuturesFundingV11','fundingSeries',[domain,series],'cutoff from source configuration'],
 ['LocalFuturesFundingV11','coreExposureSequences',[key],'Ledger final Sequence'],
 ['LocalFuturesPartialV11','linkedBasis',[pid],'initial and cumulative closed quantity'],
 ['LocalFuturesAttribution','traces',[pid],'source owner/domain/series/last time'],
 ['LocalFuturesAttribution','finalOrdinal',[pid],'final history consumption'],
 ['LocalFuturesAttribution','accountKey',[domain,h.account],'source account history binding'],
 ['LocalFuturesAttribution','logs',[accountKey],'source count/reserved/live position/last time']
 ];
 for(const q of entries)need(...q);
 for(let ordinal=1n;ordinal<=count;ordinal++)need('LocalFuturesAttribution','transition',[domain,h.account,ordinal.toString()],'every ordinal required by original account count');
 for(let seq=0n;seq<=uint(sequence);seq++)for(const final of [false,true])need('LocalFuturesPartialV11','linkedExit',[pid,seq.toString(),final],'partial and repeated final Receipt consistency');
 return requirements;
}
export function assertIndependentQueries(scope,journalState,bindings,interfaces){
 try{
  const requirements=independentRequirements(scope,bindings,interfaces);
  for(const need of requirements){
   const matches=[...journalState.requests].filter(([,q])=>{
    if(q.rpc!==need.rpc||q.target?.toLowerCase()!==need.target.toLowerCase()||q.blockTag!==need.blockTag||q.queryBlockHash!==need.queryBlockHash)return false;
    if(need.rpc==='eth_getCode')return true;
    return q.method===need.method&&getAddress(q.caller)===need.caller&&canonical(argsFor(interfaces.get(need.target.toLowerCase()),q.method,q.args))===canonical(need.args);
   });
   assert(matches.length&&matches.every(([id])=>journalState.responses.has(id)&&journalState.responses.get(id)!==null),'INDEPENDENT_REQUIRED_QUERY_MISSING:'+need.role+'.'+(need.method??'runtime'));
  }
  return {version:SPEC_VERSION,requiredConcreteQueries:requirements.length,source:'consumer logic and ABI, not candidate query inventory'};
 }catch(error){error.verificationStage='INDEPENDENT_SPEC';throw error;}
}
