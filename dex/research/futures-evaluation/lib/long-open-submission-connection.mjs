import {assert,eq,record,freeze,NO_AUTHORITY} from './policy-v1-common.mjs';
import {loadSharedReconciliationCase,sharedReconciliationSource,epochKey} from './shared-reconciliation-source.mjs';
import {diagnoseSharedReconciliation} from './shared-obligation-reconciliation.mjs';
import {loadVerifiedRawIntervalReference,inspectRawIntervalReference,bindRawSubmittedIntervals,deriveRawIntervalMetadata} from './raw-submission-interval-reference.mjs';
const contexts=new WeakMap(),copy=x=>structuredClone(x);
const safety=()=>({actualCandidateStatus:'UNVERIFIED',overallReconciliation:'PARTIAL',evaluationStatus:'NOT_EVALUATED',confirmedAmount:null,payableAmount:null,returnAmount:null,lpRecoveryAmount:null,settlementComplete:false,...NO_AUTHORITY});
// Test-only pinned synthetic source, not a chain authenticator or source registration API.
export function loadLongOpenSubmission(){
 const shared=loadSharedReconciliationCase('open-gap'),ref=loadVerifiedRawIntervalReference('long-open'),raw=inspectRawIntervalReference(ref),original=sharedReconciliationSource(shared.context);
 assert.equal(original.originEvidence.sourceCommitment,raw.sourceCommitment,'LONG_OPEN_PRIVATE_HISTORY_BINDING');
 eq(original.request.scope.queryBlock,{number:raw.query.number,hash:raw.query.hash},'LONG_OPEN_PRIVATE_QUERY_BINDING');
 const binding={historyCommitment:raw.sourceCommitment,query:{number:raw.query.number,hash:raw.query.hash,timestamp:raw.query.timestamp}},context=Object.freeze({kind:'PINNED_SYNTHETIC_LONG_OPEN_SUBMISSION'});
 contexts.set(context,freeze({sharedContext:shared.context,ref,raw,binding}));return {context,request:copy(shared.request),binding:copy(binding)};
}
function exactSet(actual,expected,code){assert(Array.isArray(actual),code);eq(actual.map(x=>x.id).sort(),[...expected].sort(),code);}
export function diagnoseLongOpenSubmission(context,request,binding){
 assert(arguments.length===3,'LONG_OPEN_ARGUMENTS');const source=contexts.get(context);assert(source,'LONG_OPEN_PRIVATE_CONTEXT_REQUIRED');
 record(binding,['historyCommitment','query']);record(binding.query,['number','hash','timestamp']);
 assert.equal(binding.historyCommitment,source.binding.historyCommitment,'LONG_OPEN_HISTORY_COMMITMENT');
 for(const k of ['number','hash','timestamp'])assert.equal(binding.query[k],source.binding.query[k],'LONG_OPEN_QUERY_'+k.toUpperCase());
 // Bind the original query to the actual submitted scope, not just an auxiliary caller label.
 eq(request.scope.queryBlock,{number:source.binding.query.number,hash:source.binding.query.hash},'LONG_OPEN_SUBMITTED_QUERY_SCOPE');
 for(const f of ['positions','transitions','lots'])assert(Array.isArray(request.inventory?.[f]),'LONG_OPEN_REQUIRED_INVENTORY_'+f.toUpperCase());
 for(const f of ['position','lot','positionEpoch','accountEpoch'])assert(Array.isArray(request.postings?.[f]),'LONG_OPEN_REQUIRED_POSTINGS_'+f.toUpperCase());
 const bound=bindRawSubmittedIntervals('long-open',request,source.ref,source.sharedContext),positionGroups=new Set(),accountGroups=new Set();
 for(const interval of source.raw.intervals)for(const participant of interval.participants){const identity={phase:interval.kind,epoch:interval.epoch,period:interval.period};positionGroups.add(epochKey({...identity,account:participant.pid}));accountGroups.add(epochKey({...identity,account:participant.account}));}
 exactSet(request.postings.positionEpoch,positionGroups,'LONG_OPEN_POSITION_EPOCH_GROUP_SET');exactSet(request.postings.accountEpoch,accountGroups,'LONG_OPEN_ACCOUNT_EPOCH_GROUP_SET');
 const diagnosis=diagnoseSharedReconciliation(source.sharedContext,request),periods=[...new Set(source.raw.intervals.filter(i=>i.kind==='GAP').map(i=>i.period))];
 return freeze({schema:'LQC_LONG_OPEN_SUBMISSION_METADATA_DIAGNOSIS_1',...safety(),overallReconciliation:diagnosis.overallReconciliation==='MISMATCH'?'MISMATCH':'PARTIAL',metadataStatus:'MATCH_PINNED_SYNTHETIC_LONG_OPEN_METADATA',binding:copy(source.binding),sourceEvidence:'PINNED_SYNTHETIC_ONLY_NOT_CHAIN_AUTHENTICATION',checkedSubmissionFields:['scope.queryBlock','inventory.transitions','postings.position.id','postings.position.segmentId','postings.position.phase','postings.position.epoch','postings.position.period','postings.lot.lotId','postings.lot.segmentId','postings.lot.phase','postings.lot.epoch','postings.lot.period','postings.positionEpoch.id','postings.accountEpoch.id'],auxiliaryOnly:['config','from','to','query.timestamp','pendingTail','observedIntegrals','remaining'],submittedBoundaryFieldsPresent:false,submittedQTimestampVerified:false,counts:{intervals:source.raw.intervals.length,positionRows:request.postings.position.length,lotRows:request.postings.lot.length,positionEpochGroups:positionGroups.size,accountEpochGroups:accountGroups.size},gapPeriods:periods,rawObservation:copy({query:source.raw.query,remaining:source.raw.remaining,pendingTail:source.raw.pendingTail,observedIntegrals:source.raw.observedIntegrals}),rawBinding:bound.diagnostic,sharedDiagnosis:diagnosis,blockers:[...new Set([...diagnosis.blockers,'SUBMITTED_BOUNDARIES_CONFIG_Q_TIMESTAMP_AND_TAIL_ABSENT','METADATA_MATCH_NOT_FINANCIAL_COMPLETION'])]});
}
// No private reference is registered. Altered Q helper inputs are not authenticated evidence.
export function compareUntrustedLongOpenObservation(config,history,observation){
 const raw=deriveRawIntervalMetadata(config,history);
 assert(observation!==null&&typeof observation==='object'&&Object.hasOwn(observation,'pendingTail'),'LONG_OPEN_HELPER_PENDING_TAIL');
 eq(observation.pendingTail,raw.pendingTail,'LONG_OPEN_HELPER_PENDING_TAIL');eq(observation.intervals,raw.intervals,'LONG_OPEN_HELPER_SEALED_INTERVALS');eq(observation.observed,raw.observed,'LONG_OPEN_HELPER_OBSERVED_WINDOWS');
 return {status:'UNAUTHENTICATED_HELPER_MATCH_ONLY',...safety(),blockers:['HELPER_INPUT_AND_QUERY_UNAUTHENTICATED','NOT_ACTUAL_LONG_OPEN_SUBMISSION_BINDING']};
}
