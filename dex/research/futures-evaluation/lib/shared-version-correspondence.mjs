import {detailedFundingIntervalKey,entriesState} from './settlement-link-diagnosis.mjs';
import {validateConsumptionIdentity} from './shared-reconciliation-identities.mjs';
import {assert,record,dense,uint,hash32,hash,canonical,address,fraction,cmp,freeze,NO_AUTHORITY} from './policy-v1-common.mjs';
import {versionSource} from './shared-version-source.mjs';
const same=(a,b,code)=>assert.equal(canonical(a),canonical(b),code);
export function stableFundingKey(scope,policy,token,attribution){
 record(policy,['mode','commitment']);assert.equal(policy.mode,'NEW_POLICY_V1_SYNTHETIC','UNSUPPORTED_VERSION_SERIES_MODE');hash32(policy.commitment);
 const originalDetailedKey=detailedFundingIntervalKey(Object.fromEntries(['chainId','domain','series','account','pid','contracts','queryBlock'].map(k=>[k,scope[k]])),attribution);
 return {originalDetailedKey,key:hash({namespace:'LQC_LOCAL_MULTI_FUNDING_BINDING_V1',originalDetailedKey,policy,token:address(token).toLowerCase()})};
}
export function consumerGroup(row){return [row.account.toLowerCase(),row.phase,row.epoch??'GAP',row.operation].join('|');}
export function validateCatalog(catalog,scope,policy){
 dense(catalog,4096);const rows=new Map();
 for(const row of catalog){record(row,['key','originalDetailedKey','pid','account','token','kind','phase','epoch','from','to','debtRaw','claimRaw']);
  assert.equal(row.kind,'FUNDING','UNSUPPORTED_OBLIGATION_KIND');const calculated=stableFundingKey({...scope,account:row.account,pid:row.pid},policy,row.token,{phase:row.phase,epoch:row.epoch,from:row.from,to:row.to});
  assert.equal(calculated.key,row.key,'DETAILED_OBLIGATION_KEY_MISMATCH');assert.equal(calculated.originalDetailedKey,row.originalDetailedKey,'REUSED_INTERVAL_KEY_MISMATCH');
  assert.equal(address(row.token).toLowerCase(),address(scope.token).toLowerCase(),'OBLIGATION_TOKEN_MISMATCH');assert(!rows.has(row.key),'DUPLICATE_DETAILED_OBLIGATION');rows.set(row.key,row);fraction(row.debtRaw);fraction(row.claimRaw);
 }return rows;
}
function snapshot(reference,submission,evaluation,catalog,receiptScope){
 const unknown={status:'UNVERIFIED',historyCompleteness:'UNVERIFIED',originalLedgerComparison:'UNVERIFIED',persistentLedgerAuthenticated:false,currentLedgerAuthenticated:false,submittedSubtotalsByOperation:null,authoritativeConsumed:null,blockers:['PERSISTENT_LEDGER_AUTHENTICATION_MISSING'],rows:[]};
 if(submission===null)return {...unknown,blockers:[...unknown.blockers,'CONSUMPTION_SNAPSHOT_MISSING']};
 record(submission,['observedAt','entries','terminals']);same(submission.observedAt,evaluation.scope.queryBlock,'SNAPSHOT_OBSERVATION_Q_MISMATCH');dense(submission.entries,4096);if(submission.terminals!==null)dense(submission.terminals,4096);
 const ids=new Set(),units=new Set(),groups=new Map(),totals=new Map();
 for(const row of submission.entries){
  record(row,['id','obligationKey','pid','account','phase','epoch','from','to','operation','amount','sequence','cumulative','receipt','consumptionIdentity','blockNumber']);hash32(row.id);assert(!ids.has(row.id),'DUPLICATE_VERSION_CONSUMPTION_ID');ids.add(row.id);
  assert(['COLLECT','PAY'].includes(row.operation),'UNSUPPORTED_VERSION_CONSUMPTION_KIND');const obligation=catalog.get(row.obligationKey);assert(obligation,'CONSUMPTION_OBLIGATION_NOT_IN_EVALUATION');
  same(Object.fromEntries(['pid','account','phase','epoch','from','to'].map(k=>[k,row[k]])),Object.fromEntries(['pid','account','phase','epoch','from','to'].map(k=>[k,obligation[k]])),'CONSUMPTION_DETAILED_ATTRIBUTION_MISMATCH');
  assert(uint(row.blockNumber)<=uint(evaluation.scope.queryBlock.number),'CONSUMPTION_AFTER_QUERY');
  const unit=validateConsumptionIdentity(row.consumptionIdentity,row,receiptScope);assert(!units.has(unit),'REUSED_VERSION_CONSUMPTION_UNIT');units.add(unit);
  const group=consumerGroup(row);if(!groups.has(group))groups.set(group,[]);groups.get(group).push(row);
  const key=row.obligationKey+'|'+row.operation;totals.set(key,(totals.get(key)??0n)+uint(row.amount));
 }
 for(const [key,n]of totals){const cut=key.lastIndexOf('|'),obligation=catalog.get(key.slice(0,cut)),operation=key.slice(cut+1),limit=fraction(operation==='COLLECT'?obligation.debtRaw:obligation.claimRaw);assert.equal(limit.d,1n,'UNSUPPORTED_FRACTIONAL_DETAILED_CONSUMPTION_LIMIT');assert(n<=limit.n,'CONSUMPTION_EXCEEDS_DETAILED_OBLIGATION');}
 const ends=[...groups].map(([id,rows])=>({id,...entriesState(rows.map(({sequence,receipt,amount,cumulative})=>({sequence,receipt,amount,cumulative})))}));
 let declaredComplete=submission.terminals!==null;
 if(submission.terminals!==null){const seen=new Set();for(const t of submission.terminals){record(t,['id','sequence','receipt','cumulative']);assert(!seen.has(t.id),'DUPLICATE_VERSION_TERMINAL');seen.add(t.id);uint(t.sequence);uint(t.cumulative);if(t.receipt!==null)hash32(t.receipt);const end=ends.find(e=>e.id===t.id);if(!end||uint(t.sequence)>uint(end.sequence)){declaredComplete=false;continue;}same(t,end,'ACCOUNT_EPOCH_TERMINAL_MISMATCH');}for(const end of ends)if(!seen.has(end.id))declaredComplete=false;}
 if(reference!==null){assert(submission.entries.length<=reference.entries.length,'CONSUMPTION_LONGER_THAN_REFERENCE');same(submission.entries,reference.entries.slice(0,submission.entries.length),'VERSION_CONSUMPTION_REFERENCE_PREFIX');if(submission.terminals!==null)for(const t of submission.terminals)same(t,reference.terminals.find(x=>x.id===t.id)??null,'ORIGINAL_VERSION_TERMINAL_MISMATCH');}
 const complete=reference!==null&&declaredComplete&&submission.entries.length===reference.entries.length&&submission.terminals.length===reference.terminals.length;
 return {...unknown,status:complete?'COMPLETE_LOCAL_REFERENCE':submission.entries.length?'PARTIAL':'UNVERIFIED',internalConsistency:declaredComplete?'MATCH':'PARTIAL',historyCompleteness:complete?'COMPLETE_AT_LOCAL_REFERENCE':submission.entries.length?'PARTIAL':'UNVERIFIED',originalLedgerComparison:reference?(complete?'LOCAL_SYNTHETIC_TERMINAL_MATCH':'PREFIX_OR_TERMINAL_MISSING'):'UNVERIFIED',submittedSubtotalsByOperation:Object.fromEntries(['COLLECT','PAY'].map(operation=>[operation,submission.entries.filter(r=>r.operation===operation).reduce((n,r)=>n+uint(r.amount),0n).toString()])),rows:submission.entries,positionOperationTotals:[...totals].map(([id,n])=>({id,amount:n.toString()})),accountEpochTerminals:ends,blockers:[...unknown.blockers,...(!complete?['VERSION_CONSUMPTION_COMPLETENESS_UNVERIFIED']:[])]};
}
function carryPrior(previousRows,nextCatalog){
 const totals=new Map();for(const row of previousRows){assert(nextCatalog.has(row.obligationKey),'SUCCESSOR_OMITS_CONSUMED_OBLIGATION');const key=row.obligationKey+'|'+row.operation;totals.set(key,(totals.get(key)??0n)+uint(row.amount));}
 for(const [id,n]of totals){const cut=id.lastIndexOf('|'),o=nextCatalog.get(id.slice(0,cut)),limit=fraction(id.slice(cut+1)==='COLLECT'?o.debtRaw:o.claimRaw);assert.equal(limit.d,1n,'UNSUPPORTED_FRACTIONAL_DETAILED_CONSUMPTION_LIMIT');assert(n<=limit.n,'SUCCESSOR_AMOUNT_BELOW_PRIOR_CONSUMPTION');}return totals;
}
function core(source,request){
 record(request,['schema','previous','successor','relation']);assert.equal(request.schema,'LQC_VERSION_CORRESPONDENCE_INPUT_V1','VERSION_INPUT_SCHEMA');
 if(source.reference===null){same(request,source.request,'UNSUPPORTED_EVIDENCE_CANNOT_BE_FILLED_BY_CALLER');return {status:'UNVERIFIED',blockers:source.blockers};}
 const {previous,successor,relation}=request,expected=source.reference;
 for(const evaluation of [previous,successor])record(evaluation,['evaluationId','calculationVersion','underlyingCalculationVersion','origin','sourceHistoryCommitment','scope','policy','catalog','consumption']);
 same(previous.policy,successor.policy,'VERSION_POLICY_MIX');
 for(const [tag,evaluation]of [['previous',previous],['successor',successor]]){
  record(evaluation,['evaluationId','calculationVersion','underlyingCalculationVersion','origin','sourceHistoryCommitment','scope','policy','catalog','consumption']);const {catalog,consumption,...header}=evaluation,{catalog:ignored,consumption:ignored2,...fixed}=expected[tag];same(header,fixed,'REGISTERED_EVALUATION_HEADER_MISMATCH');
 }
 same(relation,expected.relation,'REGISTERED_REPLACEMENT_RELATION_MISMATCH');assert.equal(relation.predecessorId,previous.evaluationId,'PREDECESSOR_ID_MISMATCH');assert.equal(relation.successorId,successor.evaluationId,'SUCCESSOR_ID_MISMATCH');
 assert.equal(previous.sourceHistoryCommitment,successor.sourceHistoryCommitment,'EVALUATION_HISTORY_REPLACEMENT_UNPROVEN');same(previous.policy,successor.policy,'VERSION_POLICY_MIX');assert(uint(successor.scope.queryBlock.number)>=uint(previous.scope.queryBlock.number),'BACKWARD_OBSERVATION_Q');
 const prevCatalog=validateCatalog(previous.catalog,previous.scope,previous.policy),nextCatalog=validateCatalog(successor.catalog,successor.scope,successor.policy);
 // Preserve pinned prior rows even when a caller submits only a prefix or a later catalog omits an obligation.
 const carried=carryPrior(expected.previous.consumption.entries,nextCatalog);
 const previousState=snapshot(expected.previous.consumption,previous.consumption,previous,prevCatalog,source.receiptScope);
 const successorState=snapshot(expected.successor.consumption,successor.consumption,successor,nextCatalog,source.receiptScope);
 same(previous.catalog,expected.previous.catalog,'PREVIOUS_CATALOG_SOURCE_BINDING');same(successor.catalog,expected.successor.catalog,'SUCCESSOR_CATALOG_SOURCE_BINDING');
 const priorById=new Map(expected.previous.consumption.entries.map(e=>[e.id,e])),nextById=new Map(successorState.rows.map(e=>[e.id,e]));
 for(const [id,e]of priorById)if(nextById.has(id))same(e,nextById.get(id),'PRIOR_CONSUMPTION_CHANGED');
 const preserved=[...priorById.keys()].filter(id=>nextById.has(id)),additional=successorState.rows.filter(e=>!priorById.has(e.id));
 const complete=previousState.status==='COMPLETE_LOCAL_REFERENCE'&&successorState.status==='COMPLETE_LOCAL_REFERENCE'&&preserved.length===priorById.size;
 return {status:complete?'LOCAL_SYNTHETIC_CORRESPONDENCE_MATCH':'PARTIAL',evaluationRelation:'REGISTERED_SYNTHETIC_PAIR_ONLY',reassessmentAuthenticated:false,previousState,successorState,retainedPriorOperationTotals:[...carried].map(([id,n])=>({id,amount:n.toString()})),preservedCount:preserved.length,additionalCount:additional.length,additionalConsumption:additional,blockers:[...source.blockers,...previousState.blockers,...successorState.blockers,...(!complete?['PRIOR_CONSUMPTION_OR_TERMINAL_INCOMPLETE']:[])]};
}
export function unsupportedRightsStatus(){
 const missing=blocker=>({supported:false,evidenceState:'UNVERIFIED',amount:null,blockers:[blocker]});
 return {overpaymentRefundRight:missing('OVERPAYMENT_REFUND_RIGHTS_LINKAGE_MISSING'),fractionalResidualRight:missing('FRACTIONAL_RESIDUAL_RIGHTS_LINKAGE_MISSING'),refundConsumption:missing('REFUND_CONSUMPTION_UNSUPPORTED'),evidenceState:'UNVERIFIED',complete:false};
}
export function diagnoseVersionCorrespondence(context,request){
 const source=versionSource(context);let result;
 try{result=core(source,request);}catch(error){result={status:'MISMATCH',differences:[{code:error.message.split('\n')[0],stage:'versionCorrespondence'}],blockers:['VERSION_CORRESPONDENCE_MISMATCH',...source.blockers]};}
 const rightsStatus=unsupportedRightsStatus(),rightsBlockers=Object.values(rightsStatus).filter(x=>x&&typeof x==='object'&&Array.isArray(x.blockers)).flatMap(x=>x.blockers);
 return freeze(structuredClone({schema:'LQC_VERSION_CORRESPONDENCE_DIAGNOSIS_V1',...result,blockers:[...new Set([...result.blockers,...rightsBlockers,'FULL_RIGHTS_TRANSITION_UNVERIFIED'])],rightsStatus,rightsTransitionComplete:false,evaluationOrigins:{previous:source.reference?.previous.origin??null,successor:source.reference?.successor.origin??null,evidenceState:source.reference?'BOUND_LOCAL_SYNTHETIC_ONLY':'UNVERIFIED'},keyRepresentation:{originalDetailedKey:'PRESERVED_EXISTING_V2_OFFCHAIN_KEY_BYTES',key:'NEW_TOKEN_POLICY_WRAPPED_DIAGNOSTIC_KEY',newKeyByteIdenticalToOriginal:false,ledgerMigrationImplemented:false,contractIdentifierMappingImplemented:false},retainedPreviousConsumption:source.reference?.previous.consumption.entries??null,evidenceLevel:source.level,reassessmentAuthenticated:false,independentChainAuthenticated:false,runtimePinsApproved:false,persistentLedgerAuthenticated:false,currentLedgerAuthenticated:false,evaluationStatus:'NOT_EVALUATED',confirmedAmount:null,payableAmount:null,returnAmount:null,lpRecoveryAmount:null,settlementComplete:false,activationAllowed:false,...NO_AUTHORITY}));
}
