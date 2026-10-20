import {loadVerifiedRawIntervalReference,bindRawSubmittedIntervals} from './raw-submission-interval-reference.mjs';
// Test-only projections of existing branded loaders. No source registration or caller success flags.
import {loadPolicyV1ResearchCase} from './policy-v1-source.mjs';
import {evaluatePolicyV1} from './policy-v1-evaluator.mjs';
import {loadSharedReconciliationCase,aggregateRights} from './shared-reconciliation-source.mjs';
import {diagnoseSharedReconciliation} from './shared-obligation-reconciliation.mjs';
import {createPolicyV1Ledger,advancePolicyV1Ledger,recalculatePolicyV1Ledger} from './policy-v1-ledger.mjs';
import {assert,hash,add,wire,fraction,zero} from './policy-v1-common.mjs';
import {buildSyntheticCashEventViews,validateSyntheticCashEventLinks} from './fixed-independent-cash-events.mjs';
import {compareFixedObligations,compareFixedCash,compareFixedSubmission,fixedGroupKey} from './fixed-independent-comparator.mjs';
const W=1000000000000000000n,usd=x=>({n:x.n,d:(BigInt(x.d)*W).toString()}),quantity=x=>({n:x,d:W.toString()}),accounts={A:'0x0000000000000000000000000000000000000065',B:'0x0000000000000000000000000000000000000066',C:'0x0000000000000000000000000000000000000067',D:'0x0000000000000000000000000000000000000068'};
function view(request,result,owners){
 const h=request.history,c=request.config,s=result.history,owner=pid=>owners.get(pid),byId=new Map(s.segments.map(x=>[x.id,x]));
 const positions=h.inventory.map(p=>({id:p.pid,account:owner(p.pid),side:p.side,quantity:quantity(p.initialQuantity18)}));
 const transitions=h.records.map(r=>({id:r.index,timestamp:r.timestamp,pid:r.pid,account:owner(r.pid),side:r.side,sequence:r.sequence,old:quantity(r.oldQty),next:quantity(r.nextQty)}));
 const segments=s.segments.map(x=>({id:x.from+':'+x.to,from:x.from,to:x.to,kind:x.kind,epoch:x.epoch,period:x.period,long:quantity(x.long18),short:quantity(x.short18),direction:x.direction,funding:usd(x.fundingUsd18)}));
 const lots=[],seen=new Set();for(const a of s.attributions){const id=a.pid+':'+(a.sequence??'OPEN');if(seen.has(id))continue;seen.add(id);const r=h.records.find(r=>r.pid===a.pid&&r.sequence===a.sequence);const q=a.kind==='OPEN_REMAINDER'?h.finalPositions.find(p=>p.pid===a.pid).remainingQuantity18:(BigInt(r.oldQty)-BigInt(r.nextQty)).toString();lots.push({id,pid:a.pid,account:owner(a.pid),sequence:a.sequence,kind:a.kind,quantity:quantity(q)});}
 const obligations=s.segments.flatMap(x=>x.positions.map(p=>({id:x.from+':'+x.to+':'+p.pid,pid:p.pid,account:owner(p.pid),phase:x.kind,epoch:x.epoch,period:x.period,from:x.from,to:x.to,debt:usd(p.debtUsd18),claim:usd(p.claimUsd18)})));
 const lotAmounts=s.attributions.map(a=>{const seg=byId.get(a.segmentId);return {id:seg.from+':'+seg.to+':'+a.pid+':'+(a.sequence??'OPEN'),pid:a.pid,account:owner(a.pid),sequence:a.sequence,kind:a.kind,from:seg.from,to:seg.to,debt:usd(a.debtUsd18),claim:usd(a.claimUsd18)};});
 const positionTotals=s.positionEpochTotals.map(x=>({id:fixedGroupKey(x.pid,x.kind,x.epoch,x.period),pid:x.pid,account:owner(x.pid),phase:x.kind,epoch:x.epoch,period:x.period,debt:usd(x.debtUsd18),claim:usd(x.claimUsd18)}));
 const aggregate=aggregateRights(positionTotals,x=>fixedGroupKey(x.account,x.phase,x.epoch,x.period)),accountTotals=aggregate.map(x=>{const p=positionTotals.find(p=>fixedGroupKey(p.account,p.phase,p.epoch,p.period)===x.id);return {id:x.id,account:p.account,phase:p.phase,epoch:p.epoch,period:p.period,debt:x.debt,claim:x.claim};});
 const totals={officialLong:0n,officialShort:0n,gapLong:0n,gapShort:0n};for(const x of s.segments){const k=x.kind==='OFFICIAL'?'official':'gap',dt=BigInt(x.to)-BigInt(x.from);totals[k+'Long']+=BigInt(x.long18)*dt;totals[k+'Short']+=BigInt(x.short18)*dt;}
 return {scope:c.scope,policyMode:'NEW_POLICY_V1_SYNTHETIC',units:{quantity:'USD_NOTIONAL_EXACT',money:'USD_EXACT',integral:'USD_NOTIONAL_SECONDS'},O:c.origin,E:c.end,D:c.D,rBps:c.rBps,Q:h.query.timestamp,positions,transitions,segments,lots,obligations,lotAmounts,positionTotals,accountTotals,integrals:Object.fromEntries(Object.entries(totals).map(([k,n])=>[k,quantity(n.toString())])),openPositions:s.openPositions,pendingTail:s.pendingTail};
}
export function loadFixedObligationObservation(name){
 const base={sequential:'flip50',partial:'partial','open-gap':'shortOpen'}[name];if(!base)throw Error('UNSUPPORTED_FIXED_CASE');
 const pair=loadPolicyV1ResearchCase(base),result=evaluatePolicyV1(pair.context,pair.request),owners=new Map(pair.request.history.inventory.map(p=>[p.pid,p.account]));
 if(name==='sequential'){owners.set('3',accounts.A);owners.set('4',accounts.B);}
 const calculated=view(pair.request,result,owners);
 return {calculated,result,request:pair.request,comparison:compareFixedObligations(name,calculated,structuredClone(calculated)),projection:name==='sequential'?'EXPLICIT_SYNTHETIC_ACCOUNT_PROJECTION':'NONE'};
}
function epochIdentity(id,accountGroup){
 const parts=id.split('|');assert.equal(parts.length,4,'SUBMITTED_EPOCH_KEY_SCHEMA');const [owner,phase,epoch,period]=parts;
 const e=phase==='OFFICIAL'?epoch:epoch==='GAP'?null:epoch,p=phase==='GAP'?period:null;assert(phase==='GAP'||period==='','SUBMITTED_OFFICIAL_PERIOD');fixedGroupKey(owner,phase,e,p);return {owner,phase,epoch:e,period:p};
}
export function projectActualSharedSubmission(name,r,rawReference,sharedContext){
 assert(['sequential','partial'].includes(name),'UNSUPPORTED_SHARED_CONNECTION');assert.equal(r.policyMode,'NEW_POLICY_V1_SYNTHETIC','SUBMITTED_POLICY_MODE');
 const unlinked=[],fields={scope:Object.fromEntries(['chainId','domain','series','token','decimals','core','funding','partial'].map(k=>[k,r.scope[k]])),policyMode:r.policyMode,units:null,Q:null,accounts:r.inventory.accounts,positions:null,transitions:null,lots:null,obligations:null,lotAmounts:null,positionTotals:null,accountTotals:null};
 const unavailable=(field,reason)=>unlinked.push({field,reason}),binding=bindRawSubmittedIntervals(name,r,rawReference,sharedContext),segment=binding.resolve;
 if(r.inventory.positions!==null)fields.positions=r.inventory.positions.map(p=>({id:p.pid,account:p.account,side:p.side,quantity:quantity(p.initialQuantity18)}));
 if(r.inventory.transitions!==null)fields.transitions=r.inventory.transitions.map(t=>({id:t.index,timestamp:t.timestamp,pid:t.pid,account:t.account,side:t.side,sequence:t.sequence,old:quantity(t.oldQty),next:quantity(t.nextQty)}));
 if(r.inventory.lots!==null)fields.lots=r.inventory.lots.map(l=>({id:l.pid+':'+(l.sequence??'OPEN'),pid:l.pid,account:l.account,sequence:l.sequence,kind:l.kind,quantity:quantity(l.quantity18)}));
 if(r.postings!==null){assert.equal(r.postings.unit,'USD18_EXACT','SUBMITTED_POSTING_UNIT');fields.units={quantity:'USD_NOTIONAL_EXACT',money:'USD_EXACT',integral:'USD_NOTIONAL_SECONDS'};
  if(r.postings.position!==null)fields.obligations=r.postings.position.map(p=>{const s=segment(p.segmentId);return {id:s.from+':'+s.to+':'+p.pid,pid:p.pid,account:p.account,phase:p.phase,epoch:p.epoch,period:p.period,from:s.from,to:s.to,debt:usd(p.debt),claim:usd(p.claim)};});
  if(r.postings.lot!==null)fields.lotAmounts=r.postings.lot.map(p=>{const s=segment(p.segmentId),lot=r.inventory.lots?.find(l=>l.id===p.lotId);assert(lot,'SUBMITTED_LOT_LOOKUP_MISSING');assert.equal(lot.pid,p.pid,'SUBMITTED_LOT_POSITION');return {id:s.from+':'+s.to+':'+p.pid+':'+(lot.sequence??'OPEN'),pid:p.pid,account:p.account,sequence:lot.sequence,kind:lot.kind,from:s.from,to:s.to,debt:usd(p.debt),claim:usd(p.claim)};});
  if(r.postings.positionEpoch!==null)fields.positionTotals=r.postings.positionEpoch.map(t=>{const a=epochIdentity(t.id,false),p=r.inventory.positions?.find(p=>p.pid===a.owner);assert(p,'SUBMITTED_POSITION_EPOCH_OWNER_MISSING');return {id:fixedGroupKey(p.pid,a.phase,a.epoch,a.period),pid:p.pid,account:p.account,phase:a.phase,epoch:a.epoch,period:a.period,debt:usd(t.debt),claim:usd(t.claim)};});
  if(r.postings.accountEpoch!==null)fields.accountTotals=r.postings.accountEpoch.map(t=>{const a=epochIdentity(t.id,true);return {id:fixedGroupKey(a.owner,a.phase,a.epoch,a.period),account:a.owner,phase:a.phase,epoch:a.epoch,period:a.period,debt:usd(t.debt),claim:usd(t.claim)};});
 }
 for(const [field,value]of Object.entries(fields))if(value===null)unavailable(field,field==='Q'?'SUBMISSION_QUERY_BLOCK_HAS_NUMBER_HASH_BUT_NO_TIMESTAMP':'SUBMITTED_TABLE_OR_UNIT_EVIDENCE_MISSING');
 for(const field of ['O','E','D','rBps','segments','integrals','openPositions','pendingTail'])unavailable(field,'NO_INDEPENDENT_FIELD_IN_SHARED_SUBMISSION');
 unavailable('segmentBoundaries','RAW_SOURCE_BOUNDARIES_BOUND_BUT_NOT_FIELDS_IN_SUBMITTED_SCHEMA');
 return {fields,unlinked};
}
export function checkExistingSharedConnection(name,submittedRequest=null){
 assert(['sequential','partial'].includes(name),'UNSUPPORTED_SHARED_CONNECTION');const pair=loadSharedReconciliationCase(name),r=submittedRequest===null?pair.request:submittedRequest,observed=loadFixedObligationObservation(name);
 const projection=projectActualSharedSubmission(name,r,loadVerifiedRawIntervalReference(name),pair.context),submissionComparison=compareFixedSubmission(name,projection);
 const diagnosis=diagnoseSharedReconciliation(pair.context,r);
 return {rawIntervalBinding:bindRawSubmittedIntervals(name,r,loadVerifiedRawIntervalReference(name),pair.context).diagnostic,comparison:observed.comparison,submissionComparison,projection,diagnosis,queryBlockObservation:r.scope.queryBlock,scopeEvidence:'EXISTING_PINNED_SYNTHETIC_CONTEXT_ONLY_NOT_CHAIN_AUTHENTICATION'};
}
function fixedCashSource(){
 const token='0x000000000000000000000000000000000000000d',spec={schema:'LQC_POLICY_V1_LEDGER_MODEL',scope:{chainId:'31337',domain:'101',series:'201',token,decimals:'6'},policyVersion:'LQC_SETTLEMENT_POLICY_V1',calculationVersion:'LQC_POLICY_V1_RESEARCH_CALCULATOR_1',policyCommitment:hash({synthetic:'cash-reference-policy'}),obligationId:hash({synthetic:'arithmetic-not-funding'}),obligationKind:'FUNDING',debtors:[{account:accounts.A,amount:{n:'7',d:'5'}},{account:accounts.B,amount:{n:'3',d:'5'}}],creditors:[{account:accounts.C,amount:{n:'8',d:'5'}},{account:accounts.D,amount:{n:'2',d:'5'}}]};
 let model=createPolicyV1Ledger(spec);const eventViews=buildSyntheticCashEventViews(model.binding),eventLink=validateSyntheticCashEventLinks(eventViews.ledgerEvents,eventViews.bookEvents,eventViews.terminals,model.binding);model=advancePolicyV1Ledger(model,spec,eventViews.ledgerEvents);return {spec,model,eventLink,eventViews};
}
function projectFixedCashLedger(model,spec,eventViews){
 const token=spec.scope.token,bookEvents=eventViews.bookEvents,terminals=eventViews.terminals;
 const principalRows=[...spec.debtors.map(x=>({x,kind:'DEBT'})),...spec.creditors.map(x=>({x,kind:'CLAIM'}))];const principals=principalRows.map(({x,kind})=>{const a=Object.keys(accounts).find(a=>accounts[a]===x.account),pid={A:'1',B:'2',C:'3',D:'4'}[a];return {id:a,account:a,pid,obligation:a+(kind==='DEBT'?'-debt':'-claim'),kind,amount:x.amount};});
 const rights=principals.map(p=>({id:p.id,account:p.account,pid:p.pid,obligation:p.obligation,token,kind:p.kind==='DEBT'?'OVERPAYMENT_REFUND':'FUNDED_CLAIMS',amount:p.kind==='DEBT'?model.debtors.find(d=>d.account===accounts[p.id]).refundOutstanding:model.creditors.find(c=>c.account===accounts[p.id]).remaining}));
 let cursor=zero();const reservations=rights.map(r=>{const from=wire(cursor);cursor=add(cursor,fraction(r.amount));const {amount,...identity}=r;return {...identity,from,to:wire(cursor)};});
 const projected={scope:{chainId:'31337',domain:'101',series:'201',token,epoch:'1',phase:'OFFICIAL'},unit:'RAW_TOKEN_EXACT',basis:'FUNDING_ONLY_ZERO_INITIAL',principals,events:bookEvents,terminals,initialCash:'0',collected:model.debtors.reduce((n,d)=>n+BigInt(d.collectedCash),0n).toString(),paid:model.creditors.reduce((n,c)=>n+BigInt(c.paidCash),0n).toString(),endingCash:model.cash,uncollected:model.uncollectedDebt,unpaid:model.creditorRemaining,overpayment:model.refundOutstanding,bucketCash:model.cash,reserved:model.aggregateCashReservation,rights,reservations};
 return projected;
}
export function observeFixedCashLedger(){
 const {model,spec,eventLink,eventViews}=fixedCashSource(),projected=projectFixedCashLedger(model,spec,eventViews);
 return {model,projected,eventLink,eventViews,comparison:compareFixedCash(projected,structuredClone(projected)),coverage:'EXISTING_LEDGER_AMOUNTS_SYNTHETIC_EVENT_AND_RESERVATION_PROJECTION_NOT_FULL_LOADER'};
}

// Same fixed private ledger only; never a registered evaluation-to-evaluation rights bridge.
export function diagnoseFixedCashRecalculation(submittedAfter){
 assert(arguments.length<=1,'FIXED_RECALCULATION_ARGUMENTS');
 const {model,spec,eventViews,eventLink}=fixedCashSource(),recalculated=recalculatePolicyV1Ledger(model);
 assert.equal(recalculated.binding,model.binding,'FIXED_RECALCULATION_BINDING');assert.equal(recalculated.sequence,model.sequence,'FIXED_RECALCULATION_SEQUENCE');
 const before=projectFixedCashLedger(model,spec,eventViews),after=projectFixedCashLedger(recalculated,spec,eventViews),modelComparison=compareFixedCash(before,after),supplied=arguments.length===1;
 // The validated book events are source projections, not independent reads of private ledger receipts.
 const missing=!supplied?[]:submittedAfter===null||submittedAfter===undefined?['snapshot']:Object.keys(after).filter(k=>!Object.hasOwn(submittedAfter,k)||submittedAfter[k]===null||submittedAfter[k]===undefined);
 const completeSubmission=supplied&&missing.length===0;
 const submittedComparison=completeSubmission?compareFixedCash(after,submittedAfter):null;
 return {...modelComparison,schema:'LQC_FIXED_CASH_RECALCULATION_DIAGNOSIS_1',comparison:missing.length?'UNVERIFIED':completeSubmission?'MATCH_FIXED_RECALCULATION_AND_SUBMITTED_VIEW':'MATCH_FIXED_RECALCULATION_ONLY',modelRecalculationState:'MATCH_FIXED_PRIVATE_LEDGER',modelRightsPreserved:true,submittedEvidenceState:missing.length?'MISSING':supplied?'COMPLETE_FIXED_VIEW_MATCH':'NOT_REQUESTED',missingFields:missing,submittedComparison,diagnosticSubmittedRights:completeSubmission?structuredClone(submittedAfter.rights):null,observations:{before:{ledgerBinding:model.binding,ledgerSequence:model.sequence,book:before},recalculated:{ledgerBinding:recalculated.binding,ledgerSequence:recalculated.sequence,book:after}},eventLink,receiptEvidence:'SOURCE_EVENT_PROJECTION_AND_PRIVATE_RECALCULATION_NOT_LEDGER_RECEIPT_AUTHENTICATION',actualEvaluationRightsLinkage:'UNVERIFIED',ledgerKeyMigrationImplemented:false,refundSupported:false,persistentLedgerAuthenticated:false,currentLedgerAuthenticated:false,blockers:[...modelComparison.blockers,'SAME_LEDGER_RECALCULATION_NOT_VERSION_RIGHTS_TRANSFER',...(missing.length?['SUBMITTED_RECALCULATION_EVIDENCE_MISSING']:[])]};
}
