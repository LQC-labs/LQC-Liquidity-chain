import {rawTransitionIntegrals} from './independent-exposure-reference.mjs';
﻿// Metadata only. No Funding, price, rounding, settlement or cash calculation.
import {assert,eq,hash,uint,freeze,NO_AUTHORITY} from './policy-v1-common.mjs';
import {loadPolicyV1ResearchCase,verifyPolicyV1History} from './policy-v1-source.mjs';
import {validatePolicyV1Config} from './policy-v1-config.mjs';
import {sharedReconciliationSource} from './shared-reconciliation-source.mjs';
const references=new WeakMap();
const clone=x=>structuredClone(x);
// Public arithmetic helper is UNAUTHENTICATED; only the branded loader below binds a source.
export function deriveRawIntervalMetadata(config,history){
 const validated=validatePolicyV1Config(config),O=uint(config.origin),E=uint(config.end),D=uint(config.D),Q=uint(history.query.timestamp);
 assert.equal(validated.state,'CONFIGURED_NOT_APPROVED','RAW_CONFIG_INCOMPLETE');assert(Q>=E,'RAW_OBSERVATION_BEFORE_E_UNSUPPORTED');assert((Q-O)/D<=4096n,'RAW_PERIOD_BOUND');
 const states=new Map(history.inventory.map(p=>[p.pid,0n]));let time=O;
 for(let i=0;i<history.records.length;i++){const r=history.records[i],t=uint(r.timestamp);assert.equal(r.index,String(i+1),'RAW_TRANSITION_ORDER');assert(t>=time&&t<=Q,'RAW_TRANSITION_TIME');assert(states.has(r.pid),'RAW_POSITION_UNKNOWN');assert.equal(uint(r.oldQty),states.get(r.pid),'RAW_QUANTITY_CHAIN');states.set(r.pid,uint(r.nextQty));time=t;}
 const candidates=[O,...history.records.map(r=>uint(r.timestamp)),...config.epochs.map(e=>uint(e.to))];for(let t=O+D;t<=Q;t+=D)candidates.push(t);
 const cuts=[...new Set(candidates.filter(t=>t>=O&&t<=Q).map(String))].map(BigInt).sort((a,b)=>a<b?-1:a>b?1:0);
 const intervals=[];
 for(let i=0;i+1<cuts.length;i++){
  const a=cuts[i],b=cuts[i+1],participants=[];
  // Per-position replay, not calculator cursor/state or generated segments.
  for(const p of history.inventory){const prior=history.records.filter(r=>r.pid===p.pid&&uint(r.timestamp)<=a).at(-1);if(prior&&uint(prior.nextQty)>0n)participants.push({pid:p.pid,account:p.account,side:p.side,quantity18:prior.nextQty});}
  const epoch=a<E?config.epochs.find(e=>uint(e.from)<=a&&b<=uint(e.to))?.id:null;assert(a>=E||epoch!==undefined,'RAW_EPOCH_COVERAGE');
  const base={scope:config.scope,policyCommitment:validated.policyCommitment,from:String(a),to:String(b),kind:a<E?'OFFICIAL':'GAP',epoch,period:String((a-O)/D),prefixCommitment:hash(history.records.filter(r=>uint(r.timestamp)<=b)),participants};
  intervals.push({...base,id:hash(base)});
 }
 const last=cuts.at(-1),pendingTail=last<Q?{from:String(last),to:String(Q),state:'NOT_A_POLICY_BOUNDARY'}:null;
 const remaining=history.inventory.map(p=>({pid:p.pid,account:p.account,side:p.side,quantity18:String(states.get(p.pid))})).filter(p=>uint(p.quantity18)>0n);
 const observed=intervals.map(s=>({from:s.from,to:s.to,kind:'SEALED_INTERVAL',participants:clone(s.participants)}));
 if(pendingTail)observed.push({from:pendingTail.from,to:pendingTail.to,kind:'OBSERVATION_ONLY_PENDING_TAIL',participants:clone(remaining)});
 const independent={official:{long:0n,short:0n},gap:{long:0n,short:0n}};
 for(const p of history.inventory){const rows=history.records.filter(r=>r.pid===p.pid).map(r=>({timestamp:r.timestamp,oldL:p.side==='LONG'?r.oldQty:'0',nextL:p.side==='LONG'?r.nextQty:'0',oldS:p.side==='SHORT'?r.oldQty:'0',nextS:p.side==='SHORT'?r.nextQty:'0'})),parts=rawTransitionIntegrals({cutoff:config.end,officialEpochs:config.epochs,transitions:rows}),side=p.side==='LONG'?'long':'short',q=states.get(p.pid);
 for(const phase of ['official','gap'])for(const k of ['long','short'])independent[phase][k]+=BigInt(parts[phase][k]);independent.official[side]+=q*(E-O);independent.gap[side]+=q*(Q-E);}
 const forward={official:{long:0n,short:0n},gap:{long:0n,short:0n}};
 for(const row of observed){const phase=BigInt(row.from)<E?'official':'gap';for(const p of row.participants)forward[phase][p.side==='LONG'?'long':'short']+=uint(p.quantity18)*(uint(row.to)-uint(row.from));}
 const stringify=x=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,Object.fromEntries(Object.entries(v).map(([a,b])=>[a,String(b)]))]));eq(stringify(forward),stringify(independent),'RAW_OBSERVED_INTEGRAL_MISMATCH');
 return {observedIntegrals:stringify(forward),integralReference:'RAW_TRANSITIONS_WITH_TERMINAL_REMAINDER_NOT_VIRTUAL_CLOSE',evidence:'UNAUTHENTICATED_RAW_HELPER_ONLY',intervals,pendingTail,remaining,observed,query:clone(history.query),sourceOrder:history.records.map(r=>({index:r.index,pid:r.pid,sequence:r.sequence,timestamp:r.timestamp,receipt:r.receipt})),evaluationStatus:'NOT_EVALUATED',confirmedAmount:null,returnAmount:null,...NO_AUTHORITY};
}
export function loadVerifiedRawIntervalReference(name){
 const base={partial:'partial',sequential:'flip50','open-gap':'shortOpen','long-open':'longOpen'}[name];assert(base,'RAW_CASE_UNSUPPORTED');
 const pair=loadPolicyV1ResearchCase(base),verified=verifyPolicyV1History(pair.context,pair.request),raw=deriveRawIntervalMetadata(pair.request.config,pair.request.history),ref=Object.freeze({});
 references.set(ref,freeze({name,raw,history:clone(pair.request.history),config:clone(pair.request.config),commitment:verified.historyCommitment}));return ref;
}
function source(ref){const s=references.get(ref);assert(s,'RAW_PRIVATE_REFERENCE_REQUIRED');return s;}
export function inspectRawIntervalReference(ref){const s=source(ref);return {...clone(s.raw),evidence:'PINNED_SYNTHETIC_SOURCE_ONLY',sourceCommitment:s.commitment,auxiliaryConfig:clone(s.config),submittedConfigVerified:false,submittedQTimestampVerified:false};}
export function compareRawIntervalObservation(ref,observed){const s=source(ref),expected=s.raw;for(const field of ['sourceOrder','intervals','remaining','pendingTail','observed','query','observedIntegrals'])eq(observed[field],expected[field],'RAW_'+field.toUpperCase()+'_MISMATCH');return {status:'RAW_METADATA_MATCH_ONLY',evaluationStatus:'NOT_EVALUATED',confirmedAmount:null,...NO_AUTHORITY};}
export function bindRawSubmittedIntervals(name,request,ref,sharedContext){
 const s=source(ref);assert(['partial','sequential'].includes(name)&&s.name===name,'RAW_SUBMISSION_CASE_SCOPE');
 const shared=sharedReconciliationSource(sharedContext),original=shared.reference;
 assert.equal(shared.originEvidence.sourceCommitment,s.commitment,'RAW_SOURCE_COMMITMENT');
 eq(request.scope,original.scope,'RAW_SUBMISSION_SCOPE');eq(request.scope.queryBlock,{number:s.history.query.number,hash:s.history.query.hash},'RAW_QUERY_SCOPE');
 // Ownership projection is pinned separately; original identities remain in interval ID bytes.
 if(request.inventory.transitions!==null)eq(request.inventory.transitions,original.inventory.transitions,'RAW_SUBMITTED_TRANSITION_ORDER_OR_CONTENT');
 const map=new Map(s.raw.intervals.map(row=>[row.id,row]));
 if(request.postings?.position!==null&&request.postings?.position!==undefined){const expected=s.raw.intervals.flatMap(i=>i.participants.map(p=>i.id+'|'+p.pid)).sort();eq(request.postings.position.map(p=>p.id).sort(),expected,'RAW_ACTIVE_POSITION_SET');}

 if(request.postings?.lot!==null&&request.postings?.lot!==undefined){const expected=[];
 for(const i of s.raw.intervals)for(const p of i.participants){const records=s.history.records.filter(r=>r.pid===p.pid);for(const close of records.slice(1))if(uint(close.timestamp)>=uint(i.to))expected.push(i.id+'|'+p.pid+'|'+p.pid+'|'+close.sequence+'|CLOSED_LOT');if(uint(records.at(-1).nextQty)>0n)expected.push(i.id+'|'+p.pid+'|'+p.pid+'|OPEN|OPEN_REMAINDER');}
 eq(request.postings.lot.map(p=>p.segmentId+'|'+p.pid+'|'+p.lotId).sort(),expected.sort(),'RAW_ACTIVE_LOT_SET');}
 const resolve=id=>{assert(map.has(id),'RAW_SEGMENT_ID_UNKNOWN');return clone(map.get(id));};
 for(const table of ['position','lot'])for(const row of request.postings?.[table]??[]){const interval=resolve(row.segmentId);for(const [field,key] of [['phase','kind'],['epoch','epoch'],['period','period']])eq(row[field],interval[key],'RAW_SUBMITTED_'+table.toUpperCase()+'_'+field.toUpperCase());
  const participant=interval.participants.find(p=>p.pid===row.pid);assert(participant,'RAW_INACTIVE_POSITION');const owner=original.inventory.positions.find(p=>p.pid===row.pid);assert(owner&&owner.account===row.account,'RAW_PROJECTED_OWNER');
  if(table==='position')assert.equal(row.id,row.segmentId+'|'+row.pid,'RAW_POSITION_ID');
  else {const lot=request.inventory.lots?.find(l=>l.id===row.lotId);assert(lot&&lot.pid===row.pid,'RAW_LOT_ID');const records=s.history.records.filter(r=>r.pid===row.pid),close=lot.sequence===null?null:records.find(r=>r.sequence===lot.sequence);assert(uint(records[0].timestamp)<=uint(interval.from),'RAW_LOT_OPEN_TIME');assert(lot.kind==='OPEN_REMAINDER'?lot.sequence===null&&uint(records.at(-1).nextQty)>0n:close&&uint(close.timestamp)>=uint(interval.to)&&uint(close.oldQty)>uint(close.nextQty),'RAW_LOT_INTERVAL');}
 }
 return {resolve,diagnostic:{status:'RAW_METADATA_BOUND_SYNTHETIC_ONLY',sourceCommitment:s.commitment,originalParticipantsPreserved:true,ownershipProjection:'PINNED_SHARED_SYNTHETIC_REFERENCE',submittedFields:['segmentId','phase','epoch','period','position.id','lot.lotId','inventory.transitions'],auxiliaryOnly:['config','query.timestamp','from','to','participants'],submittedBoundaryFieldsPresent:false,evaluationStatus:'NOT_EVALUATED',confirmedAmount:null,returnAmount:null,...NO_AUTHORITY}};
}
