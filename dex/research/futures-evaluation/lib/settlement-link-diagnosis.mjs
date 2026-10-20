import {diagnoseRecordedEvidenceForPolicyV1} from './policy-v1-recorded-evidence.mjs';
import {readCandidateRecordsForUnitTests,inspectCandidateRecordsForUnitTests} from './candidate-adapter-v3.mjs';
import {integrateHistory} from './exit-diagnostic-evaluator.mjs';
import {assert,record,dense,uint,hash32,canonical,hash,NO_AUTHORITY,freeze,address} from './policy-v1-common.mjs';
export const LINK_VERSION='LQC_SETTLEMENT_LINK_DIAGNOSIS_2';
const contexts=new WeakMap();
const same=(a,b,code)=>assert.equal(canonical(a),canonical(b),code);
const missing=reason=>({status:'UNVERIFIED',reason,...NO_AUTHORITY});
function identity(scope){
 record(scope,['chainId','domain','series','account','pid','contracts','queryBlock']);
 for(const k of ['chainId','domain','series','pid'])uint(scope[k]);address(scope.account);
 dense(scope.contracts,32);assert(scope.contracts.length>0,'CONTRACTS_REQUIRED');
 const seen=new Set(),contracts=scope.contracts.map(c=>{
  record(c,['role','address','runtimeHash'],['name','expectedHash','rpc','blockTag','queryBlockHash']);
  assert(typeof c.role==='string'&&c.role.length>0&&!seen.has(c.role),'CONTRACT_ROLE_INVALID_OR_DUPLICATE');seen.add(c.role);
  return {role:c.role,address:address(c.address).toLowerCase(),runtimeHash:hash32(c.runtimeHash)};
 }).sort((a,b)=>a.role<b.role?-1:a.role>b.role?1:0);
 record(scope.queryBlock,['number','hash'],['blockTag','timestamp']);uint(scope.queryBlock.number);hash32(scope.queryBlock.hash);
 return {chainId:scope.chainId,domain:scope.domain,series:scope.series,account:address(scope.account).toLowerCase(),pid:scope.pid,contracts};
}
export function positionAggregateKey(scope,kind){
 assert(['FUNDING','PNL','FEES'].includes(kind),'UNSUPPORTED_OBLIGATION_KIND');
 return hash({namespace:'LQC_EXISTING_POSITION_AGGREGATE_V2',identity:identity(scope),kind});
}
// Shared identity primitive: preserves the existing V2 key bytes; Q is validated but excluded.
export function detailedFundingIntervalKey(scope,attribution){
 record(attribution,['phase','epoch','from','to']);assert(['OFFICIAL','GAP'].includes(attribution.phase),'UNSUPPORTED_INTERVAL_KIND');
 uint(attribution.from);assert(uint(attribution.to)>uint(attribution.from),'INVALID_ATTRIBUTION_INTERVAL');
 if(attribution.phase==='OFFICIAL')uint(attribution.epoch);else assert.equal(attribution.epoch,null,'GAP_EPOCH_MUST_BE_NULL');
 return hash({namespace:'LQC_EXISTING_FUNDING_INTERVAL_V2',aggregateKey:positionAggregateKey(scope,'FUNDING'),attribution});
}
// Pure input validation/calculation is not source authentication. Production-facing diagnosis uses branded local context below.
export function deriveDiagnosticObligations(input,scope){
 assert(['LONG','SHORT'].includes(input.position.side),'UNSUPPORTED_POSITION_SIDE');
 identity(scope);same(input.source.scope,Object.fromEntries(['chainId','account','domain','series','pid'].map(k=>[k,scope[k]])),'HISTORY_SCOPE_MISMATCH');
 const history=integrateHistory(input),aggregateKey=positionAggregateKey(scope,'FUNDING');
 const obligations=history.intervals.map(interval=>{
  assert(interval.kind==='OFFICIAL'||interval.kind==='GAP','UNSUPPORTED_INTERVAL_KIND');
  if(interval.kind==='OFFICIAL')assert(interval.epoch!==null,'OFFICIAL_EPOCH_REQUIRED');else assert.equal(interval.epoch,null,'GAP_EPOCH_MUST_BE_NULL');
  const attribution={phase:interval.kind,epoch:interval.epoch,from:interval.from,to:interval.to};
  return {aggregateKey,kind:'FUNDING',...attribution,key:detailedFundingIntervalKey(scope,attribution),quantityLong18:interval.long18,quantityShort18:interval.short18};
 });
 assert(obligations.length>0,'NO_SUPPORTED_ATTRIBUTION_INTERVAL');
 assert.equal(new Set(obligations.map(x=>x.key)).size,obligations.length,'DUPLICATE_ATTRIBUTION_INTERVAL');
 return {aggregateKey,obligations,history,provenance:'DIAGNOSTIC_ONLY_SOURCE_AUTHENTICATION_SEPARATE',...NO_AUTHORITY};
}
export function selectDetailedObligation(catalog,requested){
 record(requested,['phase','epoch','from','to']);assert(['OFFICIAL','GAP'].includes(requested.phase),'UNSUPPORTED_INTERVAL_KIND');
 uint(requested.from);uint(requested.to);assert(uint(requested.to)>uint(requested.from),'INVALID_ATTRIBUTION_INTERVAL');
 if(requested.phase==='OFFICIAL')uint(requested.epoch);else assert.equal(requested.epoch,null,'GAP_EPOCH_MUST_BE_NULL');
 const found=catalog.obligations.filter(x=>['phase','epoch','from','to'].every(k=>x[k]===requested[k]));
 assert.equal(found.length,1,'ATTRIBUTION_INTERVAL_NOT_IN_VALIDATED_HISTORY');return found[0];
}
export function compareMockConditions(input,mock){
 assert(['LONG','SHORT'].includes(input.position.side),'UNSUPPORTED_POSITION_SIDE');
 const history=integrateHistory(input);assert(history.exits.length>0,'EXIT_HISTORY_REQUIRED');
 dense(input.prices,256);assert.equal(input.prices.length,history.exits.length,'PRICE_HISTORY_INCOMPLETE_OR_EXTRA');
 assert.equal(input.units.marketPrice,'FIXED_18','PRICE_UNIT_MISMATCH');assert.equal(input.units.collateralPrice,'FIXED_18','PRICE_UNIT_MISMATCH');
 const seen=new Set(),prices=new Map();
 for(const p of input.prices){
  record(p,['sequence','market18','collateral18','marketTime','collateralTime','provenance','reference']);uint(p.sequence);hash32(p.reference);
  assert(!seen.has(p.sequence),'DUPLICATE_STORED_PRICE');seen.add(p.sequence);
  assert(uint(p.market18)>0n&&uint(p.collateral18)>0n,'ZERO_STORED_PRICE');uint(p.marketTime);uint(p.collateralTime);prices.set(p.sequence,p);
 }
 const rows=history.exits.map(e=>{const p=prices.get(e.sequence);assert(p,'STORED_PRICE_MISSING');assert(uint(p.marketTime)<=uint(e.timestamp)&&uint(p.collateralTime)<=uint(e.timestamp),'PRICE_AFTER_EXIT');return {e,p};});
 if(mock===null)return missing('COORDINATOR_MOCK_EVIDENCE_MISSING');
 record(mock,['exitTime','exitMarket18','exitCollateral18']);uint(mock.exitTime);assert(uint(mock.exitMarket18)>0n&&uint(mock.exitCollateral18)>0n,'ZERO_MOCK_PRICE');
 const comparisons=rows.map(({e,p})=>{const conflicts=[];if(e.timestamp!==mock.exitTime)conflicts.push('EXIT_TIME_MISMATCH');if(p.market18!==mock.exitMarket18)conflicts.push('MARKET_PRICE_MISMATCH');if(p.collateral18!==mock.exitCollateral18)conflicts.push('COLLATERAL_PRICE_MISMATCH');return {sequence:e.sequence,receipt:e.receipt,timestamp:e.timestamp,conflicts};});
 return {status:comparisons.some(r=>r.conflicts.length)?'CONFLICT':'STORED_VALUES_MATCH_ONLY',provenance:'CALLER_COMPARISON_NOT_COORDINATOR_OR_PRICE_AUTHENTICATION',fullCompatibilityEstablished:false,rows:comparisons,...NO_AUTHORITY};
}
export function entriesState(entries){
 dense(entries,4096);let sequence=0n,subtotal=0n,receipt=null;const seen=new Set();
 for(const row of entries){
  record(row,['sequence','receipt','amount','cumulative']);const h=hash32(row.receipt);assert.notEqual(h,'0x'+'0'.repeat(64),'ZERO_CONSUMPTION_RECEIPT');assert(!seen.has(h),'DUPLICATE_CONSUMPTION_RECEIPT');seen.add(h);
  assert.equal(uint(row.sequence),sequence+1n,'CONSUMPTION_SEQUENCE_MISMATCH');sequence++;subtotal+=uint(row.amount);assert.equal(uint(row.cumulative),subtotal,'CONSUMPTION_CUMULATIVE_MISMATCH');receipt=h;
 }
 return {sequence:sequence.toString(),receipt,cumulative:subtotal.toString()};
}
function finalState(x){record(x,['sequence','receipt','cumulative']);uint(x.sequence);uint(x.cumulative);if(x.receipt!==null)hash32(x.receipt);}
// reference is a pure helper comparison fixture, NOT an authentication interface. The actual loader has no supported ledger terminal proof.
export function compareArchivedConsumption(scope,key,evidence,reference=null){
 identity(scope);hash32(key);
 const base={internalConsistency:'UNVERIFIED',historyCompleteness:'UNVERIFIED',originalLedgerComparison:'UNVERIFIED',referenceAuthentication:'UNVERIFIED',persistentLedgerAuthenticated:false,paymentApproved:false,submittedLimit:null,submittedSubtotal:null,diagnosticRemaining:null,authoritativeLimit:null,authoritativeRemaining:null,recordedConsumption:null,submittedFinal:null,blockers:[],...NO_AUTHORITY};
 let refState=null;
 if(reference!==null){
  record(reference,['schema','scope','obligationKey','entries','final','sourceCommitment']);assert.equal(reference.schema,'LQC_LOCAL_LEDGER_REFERENCE_ONLY_V1','LEDGER_REFERENCE_SCHEMA');same(reference.scope,scope,'LEDGER_REFERENCE_SCOPE_MISMATCH');assert.equal(hash32(reference.obligationKey),key,'LEDGER_REFERENCE_KEY_MISMATCH');hash32(reference.sourceCommitment);
  refState=entriesState(reference.entries);finalState(reference.final);same(refState,reference.final,'LEDGER_REFERENCE_TERMINAL_MISMATCH');
 }
 if(evidence===null)return {...base,evidencePresence:'MISSING',blockers:['CONSUMPTION_EVIDENCE_MISSING']};
 record(evidence,['schema','scope','obligationKey','submittedLimit','entries','final']);assert.equal(evidence.schema,'LQC_SUBMITTED_CONSUMPTION_V2','CONSUMPTION_SCHEMA');same(evidence.scope,scope,'CONSUMPTION_SCOPE_MISMATCH');assert.equal(hash32(evidence.obligationKey),key,'CONSUMPTION_OBLIGATION_MISMATCH');
 const end=entriesState(evidence.entries);finalState(evidence.final);same(end,evidence.final,'CONSUMPTION_FINAL_MISMATCH');
 const limit=evidence.submittedLimit===null?null:uint(evidence.submittedLimit);const subtotal=uint(end.cumulative);if(limit!==null)assert(subtotal<=limit,'SUBMITTED_LIMIT_EXCEEDED');
 const out={...base,evidencePresence:evidence.entries.length?'NONEMPTY':'EMPTY_SUBMISSION',internalConsistency:'MATCH',historyCompleteness:evidence.entries.length?'PARTIAL':'UNVERIFIED',submittedLimit:evidence.submittedLimit,submittedSubtotal:end.cumulative,diagnosticRemaining:limit===null?null:(limit-subtotal).toString(),submittedFinal:end,submissionCommitment:hash(evidence),blockers:['PERSISTENT_LEDGER_AUTHENTICATION_MISSING','AUTHORITATIVE_LIMIT_MISSING']};
 if(reference===null){out.blockers.push('ORIGINAL_TERMINAL_SEQUENCE_RECEIPT_CUMULATIVE_MISSING');return out;}
 assert(evidence.entries.length<=reference.entries.length,'SUBMISSION_LONGER_THAN_REFERENCE');
 same(evidence.entries,reference.entries.slice(0,evidence.entries.length),'ORIGINAL_LEDGER_PREFIX_MISMATCH');
 if(evidence.entries.length<reference.entries.length){out.originalLedgerComparison='PREFIX_MATCH_ONLY';out.historyCompleteness='PARTIAL';out.blockers.push('CONSUMPTION_SUFFIX_MISSING');return out;}
 same(end,refState,'ORIGINAL_TERMINAL_MISMATCH');out.originalLedgerComparison='FULL_LOCAL_REFERENCE_MATCH';out.historyCompleteness='COMPLETE_AT_LOCAL_REFERENCE';out.recordedConsumption=refState.cumulative;
 out.referenceCommitment=hash(reference);out.referenceLimit='LOCAL_COMPARISON_ONLY_NOT_INDEPENDENT_OR_CURRENT';return out;
}
export function loadSettlementLinkContext(){
 const prior=diagnoseRecordedEvidenceForPolicyV1(),records=readCandidateRecordsForUnitTests(),source=prior.prior.input.source;
 assert.equal(inspectCandidateRecordsForUnitTests(records).semanticCommitment,source.semanticCommitment,'INPUT_CHANGED_AFTER_VERIFICATION');
 const scope={...source.scope,contracts:records.scope.contracts,queryBlock:records.scope.queryBlock};
 const input=structuredClone(prior.prior.input),catalog=deriveDiagnosticObligations(input,scope);
 const view=freeze({scope:structuredClone(scope),input:structuredClone(input),catalog:structuredClone(catalog),sourceCommitment:source.semanticCommitment});
 contexts.set(view,freeze({prior,records,scope,input,catalog}));return view;
}
export function diagnoseSettlementLinkWithContext(context,options={}){
 assert(arguments.length<=2,'LINK_ARGUMENTS');const state=contexts.get(context);assert(state,'LOCAL_LOADER_CONTEXT_REQUIRED');
 record(options,[],['expectedSourceCommitment','seriesMode','calculationVersion','mock','consumption','attribution']);
 if(Object.hasOwn(options,'seriesMode'))assert.equal(options.seriesMode,'EXISTING_SERIES_DIAGNOSTIC','EXISTING_SERIES_V1_MIX_FORBIDDEN');
 const {prior,records,scope,input,catalog}=state,source=prior.prior.input.source;
 if(Object.hasOwn(options,'expectedSourceCommitment'))assert.equal(hash32(options.expectedSourceCommitment),source.semanticCommitment,'RECORDED_SOURCE_COMMITMENT_MISMATCH');
 const version=options.calculationVersion??LINK_VERSION;assert(typeof version==='string'&&version.length>0&&version.length<=128,'CALCULATION_VERSION');
 const selected=options.attribution===undefined?null:selectDetailedObligation(catalog,options.attribution),key=selected?.key??catalog.aggregateKey;
 const mock=compareMockConditions(input,options.mock??null),consumption=compareArchivedConsumption(scope,key,options.consumption??null);
 const observations=records.scope.finalViews.filter(v=>['linkedConsumed','lpObligationStatus','policyGapConfiguration','policyGap'].includes(v.method)).map(v=>({role:v.role,method:v.method,args:v.args,result:v.result,queryBlock:scope.queryBlock,status:'LOCAL_RECORDED_ONLY_NOT_CURRENT_OR_INDEPENDENT'}));
 const blockers={funding:['OFFICIAL_OBLIGATIONS_REQUIRE_FINALIZATION','GAP_OBLIGATIONS_NOT_EVALUATED'],price:['STORED_PRICE_NOT_APPROVED_ORACLE_EVIDENCE'],shared:['SHARED_OBLIGATIONS_NOT_RECONCILED'],unresolved:['CURRENT_UNRESOLVED_STATE_UNVERIFIED'],held:['HELD_COMPLETION_AND_RESERVES_UNVERIFIED'],lp:['LP_OBLIGATIONS_AND_RECOVERY_UNVERIFIED'],consumption:[...consumption.blockers],coordinator:mock.status==='CONFLICT'?['COORDINATOR_MOCK_CONFLICT']:mock.status==='UNVERIFIED'?['COORDINATOR_MOCK_EVIDENCE_MISSING']:['COORDINATOR_COMPARISON_NOT_AUTHENTICATED']};
 return {schema:'LQC_SETTLEMENT_LINK_DIAGNOSIS_V2',calculationVersion:version,seriesMode:'EXISTING_SERIES_DIAGNOSTIC',sourceBinding:prior.sourceBinding,scope,positionAggregateKeys:Object.fromEntries(['FUNDING','PNL','FEES'].map(k=>[k,positionAggregateKey(scope,k)])),detailedFundingObligations:catalog.obligations,selectedObligationKey:key,evaluationId:hash({namespace:'LQC_LINK_EVALUATION_V2',version,source:source.semanticCommitment,selectedObligation:key,mock:options.mock??null,consumption:options.consumption??null}),mock,consumption,archivedObservations:observations,aggregateConsumedInterpretation:'ALL_COMPONENTS_ONLY_NOT_FUNDING_PROOF',blockers,sourceBlockers:prior.blockers,evidenceLevels:prior.evidenceLevels,evaluationStatus:'NOT_EVALUATED',confirmedAmount:null,returnAmount:null,monetaryResult:null,activationAllowed:false,settlementComplete:false,...NO_AUTHORITY};
}
export function diagnoseSettlementLink(options={}){
 assert(arguments.length<=1,'LINK_ARGUMENTS');return diagnoseSettlementLinkWithContext(loadSettlementLinkContext(),options);
}
