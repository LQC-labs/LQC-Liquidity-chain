import {validateConsumptionIdentity,consumptionUnit,ledgerEventRows,checkReservationOwners} from './shared-reconciliation-identities.mjs';
import {sharedReconciliationSource,aggregateRights,epochKey} from './shared-reconciliation-source.mjs';
import {entriesState} from './settlement-link-diagnosis.mjs';
import {advancePolicyV1Ledger} from './policy-v1-ledger.mjs';
import {assert,record,dense,uint,hash32,canonical,hash,fraction,zero,add,subtract,wire,cmp,NO_AUTHORITY,freeze} from './policy-v1-common.mjs';
const same=(a,b,code)=>assert.equal(canonical(a),canonical(b),code);
const unknown=code=>({status:'UNVERIFIED',differences:[],blockers:[code]});
function byId(rows,key,label){dense(rows,4096);const m=new Map();for(const row of rows){record(row,[],Object.keys(row));const id=key(row);assert(typeof id==='string'&&id.length>0,'INVALID_'+label+'_ID');assert(!m.has(id),'DUPLICATE_'+label);m.set(id,row);}return m;}
function setDifference(expected,rows,key,label){
 const actual=byId(rows,key,label);if(expected===null)return unknown('INDEPENDENT_'+label+'_REFERENCE_MISSING');const original=byId(expected,key,label),differences=[];
 for(const [id,row]of original){if(!actual.has(id))differences.push({code:'MISSING_'+label,id});else if(canonical(row)!==canonical(actual.get(id)))differences.push({code:'REPLACED_'+label,id});}
 for(const id of actual.keys())if(!original.has(id))differences.push({code:'UNEXPECTED_'+label,id});
 return {status:differences.length?'MISMATCH':'COMPLETE_LOCAL_REFERENCE',differences,blockers:[]};
}
export function validateSharedActivity(inventory){
 const positions=byId(inventory.positions,p=>p.pid,'POSITION'),states=new Map(),live=new Map();dense(inventory.transitions,4096);let ordinal=1n,lastTime=0n,lastBlock=0n,lastTx=0n,lastLog=0n;
 for(const t of inventory.transitions){
  const p=positions.get(t.pid);assert(p,'UNDECLARED_TRANSITION_POSITION');assert.equal(t.account,p.account,'TRANSITION_OWNER_MISMATCH');assert(['LONG','SHORT'].includes(p.side),'UNSUPPORTED_POSITION_DIRECTION');assert.equal(t.side,p.side,'TRANSITION_DIRECTION_MISMATCH');
  assert.equal(uint(t.index),ordinal++,'GLOBAL_TRANSITION_ORDER');const time=uint(t.timestamp),block=uint(t.blockNumber),tx=uint(t.transactionIndex),log=uint(t.logIndex);assert(time>=lastTime&&block>=lastBlock,'TRANSITION_TIME_ORDER');if(block===lastBlock)assert(tx>lastTx||(tx===lastTx&&log>lastLog),'TRANSACTION_LOG_ORDER');hash32(t.receipt);
  let state=states.get(t.pid);if(!state){state={sequence:0n,quantity:0n,opened:false};states.set(t.pid,state);}
  assert.equal(uint(t.sequence),state.sequence+1n,'POSITION_SEQUENCE');assert.equal(uint(t.oldQty),state.quantity,'POSITION_OLD_QUANTITY');const next=uint(t.nextQty);
  if(!state.opened){assert(!live.has(p.account),'UNSUPPORTED_CONCURRENT_ACCOUNT_POSITION');assert.equal(next,uint(p.initialQuantity18),'OPEN_QUANTITY_MISMATCH');assert(next>0n,'ZERO_POSITION');live.set(p.account,t.pid);state.opened=true;}
  else{assert(state.quantity>0n&&next<state.quantity,'INVALID_REDUCTION_OR_REOPEN');assert.equal(live.get(p.account),t.pid,'ACCOUNT_ACTIVE_POSITION_MISMATCH');}
  if(next===0n)live.delete(p.account);state.quantity=next;state.sequence++;lastTime=time;lastBlock=block;lastTx=tx;lastLog=log;
 }
 assert.equal(states.size,positions.size,'POSITION_HISTORY_MISSING');return {status:'INTERNAL_ACTIVITY_MATCH',openPositions:[...states].filter(([,s])=>s.quantity>0n).map(([pid])=>pid)};
}
function inventoryCheck(source,inventory){
 record(inventory,['accounts','positions','transitions','lots']);const keys={accounts:r=>r.id,positions:r=>r.pid,transitions:r=>r.pid+'|'+r.sequence,lots:r=>r.id},labels={accounts:'ACCOUNT',positions:'POSITION',transitions:'TRANSITION',lots:'LOT'},checks={};
 for(const name of Object.keys(keys))checks[name]=inventory[name]===null?unknown(name.toUpperCase()+'_EVIDENCE_MISSING'):setDifference(source.reference?.inventory[name]??null,inventory[name],keys[name],labels[name]);
 if(Object.values(checks).some(x=>x.status==='MISMATCH'))return {status:'MISMATCH',checks,differences:Object.values(checks).flatMap(x=>x.differences),blockers:['INVENTORY_REFERENCE_MISMATCH']};
 if(inventory.transitions!==null&&inventory.positions!==null)validateSharedActivity(inventory);
 if(inventory.lots!==null&&inventory.positions!==null){for(const p of inventory.positions){const qty=inventory.lots.filter(l=>l.pid===p.pid).reduce((n,l)=>n+uint(l.quantity18),0n);assert.equal(qty,uint(p.initialQuantity18),'LOT_POSITION_QUANTITY_MISMATCH');}}
 const complete=Object.values(checks).every(x=>x.status==='COMPLETE_LOCAL_REFERENCE');return {status:complete?'COMPLETE_LOCAL_REFERENCE':'UNVERIFIED',checks,differences:[],blockers:complete?[]:['DOMAIN_SERIES_INVENTORY_COMPLETENESS_UNVERIFIED']};
}
function amountRows(rows,key){return rows.map(r=>({id:key(r),debt:wire(fraction(r.debt)),claim:wire(fraction(r.claim))})).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);}
function assertAmounts(a,b,code){same(amountRows(a,x=>x.id),amountRows(b,x=>x.id),code);}
function postingsCheck(source,input){
 if(input===null||!source.reference?.postings)return unknown('OBLIGATION_POSTINGS_MISSING');record(input,['unit','lot','position','positionEpoch','accountEpoch','domainSegment']);assert.equal(input.unit,'USD18_EXACT','POSTING_UNIT_MISMATCH');
 for(const field of ['lot','position','positionEpoch','accountEpoch','domainSegment']){
  const actual=byId(input[field],r=>r.id,'POSTING_'+field.toUpperCase()),expected=byId(source.reference.postings[field],r=>r.id,'REFERENCE_POSTING');same([...actual.keys()].sort(),[...expected.keys()].sort(),'POSTING_COVERAGE_MISMATCH_'+field);
  for(const [id,row]of actual){const ref=expected.get(id);record(row,Object.keys(ref));same(Object.fromEntries(Object.entries(row).filter(([k])=>!['debt','claim'].includes(k))),Object.fromEntries(Object.entries(ref).filter(([k])=>!['debt','claim'].includes(k))),'POSTING_METADATA_MISMATCH');fraction(row.debt);fraction(row.claim);}
 }
 assertAmounts(aggregateRights(input.lot,r=>r.segmentId+'|'+r.pid),input.position,'LOT_TO_POSITION_OBLIGATION_MISMATCH');
 assertAmounts(aggregateRights(input.position,r=>[r.pid,r.phase,r.epoch??'GAP',r.phase==='GAP'?r.period:''].join('|')),input.positionEpoch,'POSITION_EPOCH_OBLIGATION_MISMATCH');
 assertAmounts(aggregateRights(input.position,epochKey),input.accountEpoch,'ACCOUNT_EPOCH_OBLIGATION_MISMATCH');
 assertAmounts(aggregateRights(input.position,r=>r.segmentId),input.domainSegment,'DOMAIN_SEGMENT_OBLIGATION_MISMATCH');
 for(const row of input.domainSegment)assert.equal(cmp(fraction(row.debt),fraction(row.claim)),0n,'GROSS_DEBT_CLAIM_MISMATCH');
 for(const field of ['lot','position','positionEpoch','accountEpoch','domainSegment'])assertAmounts(input[field],source.reference.postings[field],'ORIGINAL_OBLIGATION_AMOUNT_MISMATCH');
 const total=aggregateRights(input.domainSegment,()=> 'DOMAIN_SERIES')[0];return {status:'LOCAL_REFERENCE_MATCH_ONLY',unit:input.unit,diagnosticSubmittedTotals:total??null,differences:[],blockers:['AMOUNTS_NOT_FINANCIALLY_CONFIRMED']};
}
const consumerKey=e=>epochKey(e)+'|'+e.operation;
export function reconcileSharedConsumption(source,submission){
 if(submission===null)return {...unknown('CONSUMPTION_EVIDENCE_MISSING'),internalConsistency:'UNVERIFIED',historyCompleteness:'UNVERIFIED',originalLedgerComparison:'UNVERIFIED',submittedSubtotal:null,recordedConsumption:null};
 record(submission,['scope','entries','terminals']);same(submission.scope,source.request.scope,'CONSUMPTION_SCOPE_MISMATCH');const rows=byId(submission.entries,e=>e.id,'CONSUMPTION_EVENT'),terminals=byId(submission.terminals,t=>t.id,'CONSUMPTION_TERMINAL'),groups=new Map(),units=new Set(),positions=new Map(source.request.inventory.positions.map(p=>[p.pid,p]));let global=1n;
 for(const row of rows.values()){
  record(row,['id','receipt','globalSequence','account','pid','phase','epoch','period','operation','sequence','amount','cumulative','consumptionIdentity']);hash32(row.id);hash32(row.receipt);const unit=validateConsumptionIdentity(row.consumptionIdentity,row,submission.scope);assert(!units.has(unit),'REUSED_CONSUMPTION_UNIT');units.add(unit);assert.equal(uint(row.globalSequence),global++,'CONSUMPTION_GLOBAL_ORDER');assert(['COLLECT','PAY','REFUND'].includes(row.operation),'CONSUMPTION_OPERATION');assert.equal(positions.get(row.pid)?.account,row.account,'CONSUMPTION_POSITION_OWNER');const k=consumerKey(row);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(row);
 }
 for(const t of terminals.values()){record(t,['id','account','phase','epoch','period','operation','sequence','receipt','cumulative']);assert.equal(t.id,consumerKey(t),'TERMINAL_GROUP_KEY');uint(t.sequence);uint(t.cumulative);if(t.receipt!==null)hash32(t.receipt);}
 let completeDeclared=true;const details=[];
 for(const [id,entries]of groups){const end=entriesState(entries.map(({sequence,receipt,amount,cumulative})=>({sequence,receipt,amount,cumulative}))),t=terminals.get(id);if(!t||uint(t.sequence)>uint(end.sequence)){completeDeclared=false;}else{assert.equal(t.sequence,end.sequence,'CONSUMPTION_TERMINAL_SEQUENCE');assert.equal(t.receipt,end.receipt,'CONSUMPTION_TERMINAL_RECEIPT');assert.equal(t.cumulative,end.cumulative,'CONSUMPTION_TERMINAL_CUMULATIVE');}details.push({id,submittedFinal:end});}
 const reference=source.cash?.consumption??null;let completeReference=false;
 if(reference){const originals=new Map(reference.entries.map(e=>[e.id,e]));for(const e of rows.values())same(e,originals.get(e.id)??null,'ORIGINAL_CONSUMPTION_ROW_MISMATCH');for(const t of terminals.values())same(t,reference.terminals.find(x=>x.id===t.id)??null,'ORIGINAL_ACCOUNT_EPOCH_TERMINAL_MISMATCH');completeReference=rows.size===reference.entries.length&&terminals.size===reference.terminals.length&&completeDeclared;}
 const sum=submission.entries.filter(e=>e.operation==='COLLECT').reduce((n,e)=>n+uint(e.amount),0n).toString();
 return {status:completeReference?'LOCAL_REFERENCE_MATCH_ONLY':submission.entries.length?'PARTIAL':'UNVERIFIED',internalConsistency:completeDeclared?'MATCH':'PARTIAL',historyCompleteness:completeReference?'COMPLETE_AT_LOCAL_REFERENCE':submission.entries.length?'PARTIAL':'UNVERIFIED',originalLedgerComparison:reference?(completeReference?'LOCAL_SYNTHETIC_TERMINAL_MATCH':'PREFIX_OR_TERMINAL_MISSING'):'UNVERIFIED',submittedSubtotal:sum,recordedConsumption:completeReference?sum:null,details,persistentLedgerAuthenticated:false,differences:[],blockers:['PERSISTENT_LEDGER_AUTHENTICATION_MISSING',...(!completeReference?['COMPLETE_CONSUMPTION_TERMINAL_EVIDENCE_MISSING']:[])]};
}
export function reconcileSharedCash(source,book){
 if(book===null)return unknown('CASH_RIGHTS_RESERVATION_EVIDENCE_MISSING');record(book,['scope','basis','initialCash','events','endingCash','reportedAccounted','buckets','reservations','rights','otherObligations']);same(book.scope,source.request.scope,'CASH_SCOPE_MISMATCH');assert(['FUNDING_ONLY_ZERO_INITIAL','GENERAL_POOL_OBSERVED'].includes(book.basis),'UNSUPPORTED_CASH_BASIS');
 if(book.initialCash===null||book.endingCash===null||book.otherObligations===null)return unknown('INITIAL_CASH_OR_OTHER_OBLIGATIONS_MISSING');
 let cash=uint(book.initialCash);const ids=new Set();dense(book.events,4096);let sequence=1n;for(const e of book.events){record(e,['id','sequence','kind','account','amount','binding','provenance','consumptionIdentity']);consumptionUnit(e.consumptionIdentity,book.scope);hash32(e.id);assert(!ids.has(e.id),'DUPLICATE_CASH_EVENT');ids.add(e.id);assert.equal(uint(e.sequence),sequence++,'CASH_EVENT_SEQUENCE');const n=uint(e.amount);if(e.kind==='COLLECT')cash+=n;else if(['PAY','REFUND'].includes(e.kind)){assert(cash>=n,'NEGATIVE_CASH_FLOW');cash-=n;}else assert.fail('UNSUPPORTED_CASH_FLOW');}
 assert.equal(cash,uint(book.endingCash),'CASH_FLOW_CONSERVATION');
 byId(book.buckets,b=>b.id,'BUCKET');const bucketSum=book.buckets.reduce((n,b)=>{record(b,['id','amount']);return n+uint(b.amount);},0n);assert.equal(bucketSum,cash,'BUCKET_CASH_CONSERVATION');assert.equal(uint(book.reportedAccounted),bucketSum,'BUCKET_ACCOUNTED_DOUBLE_COUNT');
 const reservations=byId(book.reservations,v=>v.id,'RESERVATION');const sorted=[...reservations.values()].map(v=>{record(v,['id','resource','right','from','to','account','pid','obligationKey','token']);assert.equal(v.resource,'FUNDING_CASH','UNKNOWN_CASH_RESOURCE');assert(['FUNDED_CLAIMS','OVERPAYMENT_REFUND'].includes(v.right),'UNSUPPORTED_RESERVATION_RIGHT');const from=fraction(v.from),to=fraction(v.to);assert(cmp(to,from)>0n,'EMPTY_OR_REVERSED_RESERVATION');assert(cmp(to,{n:cash,d:1n})<=0n,'RESERVATION_EXCEEDS_CASH');return {v,from,to};}).sort((a,b)=>cmp(a.from,b.from)<0n?-1:cmp(a.from,b.from)>0n?1:0);
 for(let i=1;i<sorted.length;i++)assert(cmp(sorted[i-1].to,sorted[i].from)<=0n,'OVERLAPPING_CASH_RESERVATIONS');
 let reserved=zero();for(const v of sorted)reserved=add(reserved,subtract(v.to,v.from));
 const eligible=book.basis==='FUNDING_ONLY_ZERO_INITIAL'&&book.initialCash==='0'&&book.otherObligations==='EXPLICIT_SYNTHETIC_NONE'&&source.cash!==null;
 if(!eligible)return {status:'UNVERIFIED',cashFlow:'SUBMITTED_ARITHMETIC_MATCH_ONLY',fundingRightsEquation:'NOT_APPLIED_SCOPE_ASSUMPTIONS_UNPROVEN',diagnosticCash:cash.toString(),reservationSubtotal:wire(reserved),differences:[],blockers:['GENERAL_POOL_OR_EXTERNAL_OBLIGATIONS_NOT_A_FUNDING_ONLY_BOOK']};
 const refEvents=new Map(source.cash.cash.events.map(e=>[e.id,e]));for(const e of book.events)same(e,refEvents.get(e.id)??null,'ORIGINAL_CASH_RECEIPT_MISMATCH');
 same(book.buckets.map(b=>b.id),source.cash.cash.buckets.map(b=>b.id),'SOURCE_BUCKET_IDENTITY_MISMATCH');
 const result=advancePolicyV1Ledger(source.cash.initial,source.cash.spec,ledgerEventRows(book.events));assert.equal(result.cash,book.endingCash,'MODEL_CASH_MISMATCH');same(book.rights,{uncollectedDebt:result.uncollectedDebt,creditorRemaining:result.creditorRemaining,refundOutstanding:result.refundOutstanding,aggregateCashReservation:result.aggregateCashReservation},'RIGHTS_AND_FRACTION_RESIDUAL_MISMATCH');assert.equal(cmp(reserved,fraction(result.aggregateCashReservation)),0n,'CASH_RESERVATION_TOTAL_MISMATCH');
 const byRight=right=>sorted.filter(v=>v.v.right===right).reduce((n,v)=>add(n,subtract(v.to,v.from)),zero());
 assert.equal(cmp(byRight('OVERPAYMENT_REFUND'),fraction(result.refundOutstanding)),0n,'REFUND_RESERVATION_RIGHT_MISMATCH');
 assert.equal(cmp(byRight('FUNDED_CLAIMS'),subtract(fraction(result.aggregateCashReservation),fraction(result.refundOutstanding))),0n,'FUNDED_CLAIM_RESERVATION_MISMATCH');
 checkReservationOwners(book.reservations,source.cash.ownerRights,book.scope.token);
 const complete=book.events.length===source.cash.cash.events.length;
 return {status:complete?'LOCAL_SYNTHETIC_MODEL_MATCH':'PARTIAL',cashFlow:'SYNTHETIC_RECEIPTS_ONLY',fundingRightsEquation:'VERIFIED_BY_REUSED_V1_LEDGER_WITHIN_DECLARED_SCOPE',diagnosticCash:result.cash,rights:book.rights,reservationSubtotal:wire(reserved),sourceHistoryCompleteness:complete?'COMPLETE_LOCAL_REFERENCE':'PARTIAL',reportedReceiptsVerified:false,differences:[],blockers:['REAL_CASH_AND_POOL_AUTHENTICATION_MISSING',...(!complete?['CASH_RECEIPT_SUFFIX_MISSING']:[])]};
}
function inspect(name,fn){try{return fn();}catch(e){return {status:'MISMATCH',differences:[{code:e.message.split('\n')[0],stage:name}],blockers:[name.toUpperCase()+'_MISMATCH']};}}
export function diagnoseSharedReconciliation(context,request){
 assert(arguments.length===2,'SHARED_DIAGNOSIS_ARGUMENTS');const source=sharedReconciliationSource(context);record(request,['schema','policyMode','scope','inventory','postings','consumption','cash']);assert.equal(request.schema,'LQC_SHARED_RECONCILIATION_INPUT_V1','SHARED_INPUT_SCHEMA');assert.equal(request.policyMode,source.request.policyMode,'EXISTING_SERIES_V1_MIX_FORBIDDEN');same(request.scope,source.request.scope,'SHARED_SCOPE_MISMATCH');
 const items={inventory:inspect('inventory',()=>inventoryCheck(source,request.inventory))};
 items.postings=items.inventory.status==='MISMATCH'?unknown('BLOCKED_BY_INVENTORY_MISMATCH'):inspect('postings',()=>postingsCheck(source,request.postings));
 items.consumption=items.inventory.status==='MISMATCH'?unknown('BLOCKED_BY_INVENTORY_MISMATCH'):inspect('consumption',()=>reconcileSharedConsumption(source,request.consumption));
 items.cash=inspect('cash',()=>reconcileSharedCash(source,request.cash));
 if(request.consumption!==null&&request.cash!==null&&items.inventory.status!=='MISMATCH')items.cashConsumptionLink=inspect('cashConsumptionLink',()=>{const cash=new Map(request.cash.events.map(e=>[e.id,e]));for(const row of request.consumption.entries){const e=cash.get(row.id);assert(e,'CONSUMPTION_CASH_RECEIPT_MISSING');assert(e.account===row.account&&e.kind===row.operation&&e.amount===row.amount,'CONSUMPTION_CASH_AMOUNT_MISMATCH');same(e.consumptionIdentity,row.consumptionIdentity,'CONSUMPTION_CASH_IDENTITY_MISMATCH');}return {status:cash.size===request.consumption.entries.length?'LOCAL_REFERENCE_MATCH_ONLY':'PARTIAL',differences:[],blockers:['RECEIPT_MATCH_NOT_REAL_CASH_AUTHENTICATION']};});
 const differences=Object.values(items).flatMap(x=>x.differences),blockers=[...new Set([...source.blockers,...Object.values(items).flatMap(x=>x.blockers),'PRICE_POLICY_SHARED_INDEPENDENCE_AND_RETURN_NOT_AUTHENTICATED'])];
 return freeze(structuredClone({schema:'LQC_SHARED_RECONCILIATION_DIAGNOSIS_V1',scope:request.scope,policyMode:request.policyMode,evidenceLevels:{originalReference:source.originEvidence,independentChain:'UNVERIFIED',finality:'UNVERIFIED',persistentLedger:'UNVERIFIED',pricePolicyApproval:'UNVERIFIED',sharedCashIndependence:'UNVERIFIED'},items,differences,blockers,openPositions:source.openPositions,pendingGapTail:source.pendingTail,economicKeys:source.economicKeys,evaluationId:hash({version:'LQC_SHARED_RECONCILIATION_1',source:source.originEvidence,request}),overallReconciliation:differences.length?'MISMATCH':Object.values(items).some(x=>['UNVERIFIED','PARTIAL'].includes(x.status))?'PARTIAL':'LOCAL_REFERENCE_MATCH_ONLY',evaluationStatus:'NOT_EVALUATED',confirmedAmount:null,payableAmount:null,returnAmount:null,lpRecoveryAmount:null,activationAllowed:false,settlementComplete:false,...NO_AUTHORITY}));
}
