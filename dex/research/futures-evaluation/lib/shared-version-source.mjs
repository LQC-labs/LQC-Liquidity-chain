import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadPolicyV1ResearchCase,loadPolicyV1EvidenceVariation} from './policy-v1-source.mjs';
import {evaluateWithBoundOrigin} from './shared-evaluation-origin.mjs';
import {loadSharedReconciliationCase,sharedReconciliationSource} from './shared-reconciliation-source.mjs';
import {validateSharedActivity} from './shared-obligation-reconciliation.mjs';
import {entriesState} from './settlement-link-diagnosis.mjs';
import {stableFundingKey,consumerGroup} from './shared-version-correspondence.mjs';
import {SHARED_VERSION_REFERENCE_SHA256} from './shared-version-reference.mjs';
import {assert,record,hash,freeze,fraction,uint,POLICY_CALCULATION_VERSION} from './policy-v1-common.mjs';
const contexts=new WeakMap(),cache=new Map();
const blockers=['COMMON_CALCULATION_REFERENCE_NOT_INDEPENDENT_PROOF','SYNTHETIC_VERSION_RULES_NOT_AUTHENTICATED_REEVALUATION','RUNTIME_PINS_SYNTHETIC_ONLY_UNAPPROVED','PERSISTENT_LEDGER_AUTHENTICATION_MISSING','CURRENT_CONSUMPTION_NOT_AUTHENTICATED'];
function baseCase(name,variation=null){const id=name+'|'+(variation??'BASE');if(!cache.has(id)){const pair=variation===null?loadPolicyV1ResearchCase(name):loadPolicyV1EvidenceVariation(variation);cache.set(id,{...pair,...evaluateWithBoundOrigin(pair.context,pair.request)});}return cache.get(id);}
function terminals(entries){const groups=new Map();for(const row of entries){const k=consumerGroup(row);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);}return [...groups].map(([id,rows])=>({id,...entriesState(rows.map(({sequence,receipt,amount,cumulative})=>({sequence,receipt,amount,cumulative})))}));}
function unsupported(reason,level='SYNTHETIC_REFERENCE'){return {request:{schema:'LQC_VERSION_CORRESPONDENCE_INPUT_V1',previous:null,successor:null,relation:null},reference:null,level,blockers:[...blockers,reason]};}
function catalogFromExistingResult(result,owners,scope,policy){const catalog=[];for(const s of result.history.segments){const converted=result.diagnosticAmounts.funding.find(f=>f.segmentId===s.id);for(const p of converted.positions){if(fraction(p.debtRaw).n===0n&&fraction(p.claimRaw).n===0n)continue;const account=owners.get(p.pid),attribution={phase:s.kind,epoch:s.epoch,from:s.from,to:s.to},binding=stableFundingKey({...scope,account,pid:p.pid},policy,scope.token,attribution);catalog.push({...binding,pid:p.pid,account,token:scope.token,kind:'FUNDING',...attribution,debtRaw:p.debtRaw,claimRaw:p.claimRaw});}}return catalog;}
function synthetic(definition,bundle){
 const base=baseCase(definition.baseCase),{request,result}=base;assert(result.diagnosticAmounts,'VERSION_CONVERTED_SOURCE_MISSING');
 const projection=definition.projection===null?null:loadSharedReconciliationCase(definition.projection);
 const inventory=projection?projection.request.inventory:{positions:request.history.inventory,transitions:request.history.records};validateSharedActivity(inventory);
 const owners=new Map(inventory.positions.map(p=>[p.pid,p.account]));
 const contracts=Object.entries(bundle.syntheticRuntimeLabels).map(([role,runtimeHash])=>({role,address:request.config.scope[role.toLowerCase()],runtimeHash}));
 const policy={mode:'NEW_POLICY_V1_SYNTHETIC',commitment:result.configuration.policyCommitment};
 const scope={...request.config.scope,contracts,queryBlock:{number:request.history.query.number,hash:request.history.query.hash}};
 // Reuse actual verified segment/converted outputs. No new Funding, price or rounding formula.
 const catalog=catalogFromExistingResult(result,owners,scope,policy);
 const historyCommitment=hash({originalHistory:result.history.sourceCommitment,positions:inventory.positions,transitions:inventory.transitions});
 const receiptScope={chainId:scope.chainId,contracts,domain:scope.domain,series:scope.series,token:scope.token,policyCommitment:policy.commitment};
 const previousEntries=[],groupState=new Map();
 const append=(entries,o,operation,amount,blockNumber)=>{const grouping=consumerGroup({...o,operation}),end=groupState.get(grouping)??{sequence:0n,cumulative:0n};end.sequence++;end.cumulative+=uint(amount);groupState.set(grouping,end);const receipt=hash({syntheticHistory:historyCommitment,event:entries.length.toString(),key:o.key,operation,blockNumber});const row={id:receipt,obligationKey:o.key,pid:o.pid,account:o.account,phase:o.phase,epoch:o.epoch,from:o.from,to:o.to,operation,amount,sequence:end.sequence.toString(),cumulative:end.cumulative.toString(),receipt,blockNumber,consumptionIdentity:{scopeCommitment:hash(receiptScope),transactionHash:hash({testOnlyBatch:historyCommitment,blockNumber}),logIndex:entries.length.toString(),itemIndex:'0',businessReceipt:receipt,receiptSequence:end.sequence.toString()}};entries.push(row);};
 for(const o of catalog)for(const operation of ['COLLECT','PAY']){const amount=fraction(operation==='COLLECT'?o.debtRaw:o.claimRaw);if(amount.n===0n)continue;assert.equal(amount.d,1n,'UNSUPPORTED_FRACTIONAL_VERSION_FIXTURE');assert(amount.n>=uint(bundle.consumptionAmounts.initialRaw)+uint(bundle.consumptionAmounts.additionalRaw),'SYNTHETIC_CONSUMPTION_EXCEEDS_EXISTING_CAP');append(previousEntries,o,operation,bundle.consumptionAmounts.initialRaw,scope.queryBlock.number);}
 const nextBase=definition.evidenceVariation?baseCase(definition.baseCase,definition.evidenceVariation):base;assert.equal(nextBase.result.history.sourceCommitment,result.history.sourceCommitment,'EVIDENCE_VARIATION_HISTORY_CHANGED');assert.equal(nextBase.result.configuration.policyCommitment,policy.commitment,'EVIDENCE_VARIATION_POLICY_MIX');const nextCatalog=catalogFromExistingResult(nextBase.result,owners,scope,policy);
 const nextScope=structuredClone(scope);if(definition.laterQ)nextScope.queryBlock={number:request.history.query.successorNumber,hash:request.history.query.successorHash};
 const nextEntries=structuredClone(previousEntries);if(definition.laterQ){const o=catalog.find(o=>fraction(o.debtRaw).n>0n);append(nextEntries,o,'COLLECT',bundle.consumptionAmounts.additionalRaw,nextScope.queryBlock.number);}
 const evaluation=(calculationVersion,s,entries,underlying,catalogue)=>{const data={calculationVersion,underlyingCalculationVersion:POLICY_CALCULATION_VERSION,origin:structuredClone(underlying.origin),sourceHistoryCommitment:historyCommitment,scope:s,policy:structuredClone(policy),catalog:structuredClone(catalogue)};return {evaluationId:hash({namespace:'SYNTHETIC_REGISTERED_EVALUATION_RECORD',...data}),...data,consumption:{observedAt:s.queryBlock,entries,terminals:terminals(entries)}};};
 const previous=evaluation(bundle.versions.previous,scope,previousEntries,base,catalog),successor=evaluation(bundle.versions.successor,nextScope,nextEntries,nextBase,nextCatalog);
 const relation={kind:'PINNED_SYNTHETIC_REPLACEMENT_ONLY',predecessorId:previous.evaluationId,successorId:successor.evaluationId,historyCommitment,originPairCommitment:hash({previous:previous.origin,successor:successor.origin}),referenceSHA256:SHARED_VERSION_REFERENCE_SHA256,consumptionReferenceCommitment:hash({previous:previous.consumption,successor:successor.consumption})};
 const input={schema:'LQC_VERSION_CORRESPONDENCE_INPUT_V1',previous,successor,relation};return {request:input,reference:structuredClone(input),receiptScope,level:'SYNTHETIC_REFERENCE_ONLY',blockers};
}
export function loadVersionCorrespondenceCase(name){
 let data;
 if(name==='recorded-legacy'){const pair=loadSharedReconciliationCase('recorded-legacy'),source=sharedReconciliationSource(pair.context);data=unsupported('EXISTING_SERIES_MULTI_POSITION_VERSION_BINDING_UNAVAILABLE','LOCAL_RECORDED');data.blockers.push(...source.blockers);}
 else if(name==='ambiguous-partial'){loadSharedReconciliationCase('partial');data=unsupported('AGGREGATE_CONSUMPTION_DETAILED_INTERVAL_ALLOCATION_UNPROVEN');}
 else{const bytes=fs.readFileSync(new URL('../shared-version-references.json',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),SHARED_VERSION_REFERENCE_SHA256,'VERSION_REFERENCE_HASH_MISMATCH');const bundle=JSON.parse(bytes);assert.equal(bundle.purpose,'SYNTHETIC_RULE_TEST_ONLY_NOT_REAL_REEVALUATION_OR_RUNTIME_PROOF','VERSION_REFERENCE_PURPOSE');assert(Object.hasOwn(bundle.cases,name),'UNKNOWN_VERSION_CASE');const d=bundle.cases[name];record(d,['baseCase','projection','laterQ'],['evidenceVariation']);data=synthetic(d,bundle);}
 const context=freeze({caseId:name,level:data.level});contexts.set(context,freeze(data));return {context,request:structuredClone(data.request)};
}
export function versionSource(context){assert(contexts.has(context),'PINNED_VERSION_CONTEXT_REQUIRED');return contexts.get(context);}
