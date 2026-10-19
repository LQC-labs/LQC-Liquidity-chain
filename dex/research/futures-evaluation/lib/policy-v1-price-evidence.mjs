
import {integer} from './exact-rational.mjs';
import {assert,record,dense,uint,address,eq,hash32} from './policy-v1-common.mjs';
import {policyV1Source} from './policy-v1-source.mjs';
function validateReport(r,p,asset,boundary,reference,scope){
 record(r,['id','kind','scope','asset','feed','price18','observedAt','committedBlock','committedTransactionIndex','roundId','pythId','rawPrice','expo','confidence']);
 assert.equal(r.kind,'SYNTHETIC_TEST_ONLY','UNSUPPORTED_PRICE_PROOF');
 eq(r.scope,scope,'PRICE_SCOPE_MIX');assert.equal(r.asset,p.asset,'PRICE_ASSET');assert.equal(address(r.feed),address(reference?p.referenceFeed:p.primaryFeed),'PRICE_FEED');
 const t=uint(r.observedAt),end=uint(boundary.timestamp);
 assert(t<=end,'PRICE_AFTER_BOUNDARY');assert(end-t<=uint(p.maxAge),'PRICE_STALE');
 const cb=uint(r.committedBlock),bn=uint(boundary.header.number);
 assert(cb<=bn,'PRICE_POST_BOUNDARY_COMMITMENT');
 if(boundary.kind==='EVENT'&&cb===bn)assert(uint(r.committedTransactionIndex)<uint(boundary.event.transactionIndex),'PRICE_POST_TRANSACTION_COMMITMENT');
 uint(r.roundId);const raw=uint(r.rawPrice),expo=integer(r.expo);assert(raw>0n,'PRICE_ZERO');assert(expo>=-36n&&expo<=18n,'PRICE_EXPONENT');
 if(reference)assert(raw<=(1n<<63n)-1n&&uint(r.confidence)<=(1n<<64n)-1n,'PRICE_ABI_RANGE');else assert(raw<=(1n<<255n)-1n,'PRICE_ABI_RANGE');
 const shift=expo+18n;let normalized;
 if(shift>=0n)normalized=raw*10n**shift;
 else{const divisor=10n**(-shift);assert(raw%divisor===0n,'PRICE_NORMALIZATION_LOSS');normalized=raw/divisor;}
 assert.equal(normalized,uint(r.price18),'PRICE_NORMALIZATION_MISMATCH');assert(normalized>0n,'PRICE_ZERO');assert(normalized<=(1n<<255n)-1n,'PRICE_NORMALIZED_RANGE');
 if(reference){assert.equal(r.pythId,p.pythId,'PYTH_PRICE_ID');assert(uint(r.confidence)*10000n<=raw*uint(p.maxConfidenceBps),'PRICE_CONFIDENCE');}
 else{assert.equal(r.pythId,null,'PRIMARY_PYTH_FIELD');assert.equal(r.confidence,'0','PRIMARY_CONFIDENCE_FIELD');}
 return normalized;
}
export function verifyPolicyV1Prices(context,request,requiredKeys){
 const source=policyV1Source(context),selected=new Map(),valid=new Map(),blockers=[];
 dense(request.priceSelections,4096);
 for(const p of request.priceSelections){
  record(p,['key','anchorId','primaryMarket','referenceMarket','primaryCollateral','referenceCollateral']);
  assert(!selected.has(p.key),'DUPLICATE_PRICE_SELECTION');assert(requiredKeys.includes(p.key),'UNEXPECTED_PRICE_SELECTION');selected.set(p.key,p);
 }
 for(const key of requiredKeys){
  try{
   const selection=selected.get(key);assert(selection,'PRICE_EVIDENCE_MISSING');
   const boundary=source.boundaries[key];assert(boundary,'BOUNDARY_EVIDENCE_MISSING');
   assert.equal(selection.anchorId,boundary.id,'BOUNDARY_ANCHOR_MISMATCH');

if(key.startsWith('BOUNDARY:')){
 assert.equal(boundary.timestamp,key.slice('BOUNDARY:'.length),'BOUNDARY_TIMESTAMP_BINDING');
 const first=request.history.records.find(r=>r.timestamp===boundary.timestamp);
 if(first){assert.equal(boundary.kind,'EVENT','BOUNDARY_EVENT_SELECTION');assert.equal(boundary.event.index,first.index,'BOUNDARY_FIRST_EVENT_REQUIRED');}
}else{
 const parts=key.split(':'),event=request.history.records.find(r=>r.pid===parts[1]&&(parts[0]==='ENTRY'?r.sequence==='1':r.sequence===parts[2]));
 assert(event&&boundary.kind==='EVENT'&&event.index===boundary.event.index,'POSITION_PRICE_EVENT_BINDING');
}
const h=boundary.header;record(h,['number','hash','timestamp']);uint(h.number);hash32(h.hash);
   if(boundary.kind==='SCHEDULED'){
    const next=boundary.successor;assert(next,'BOUNDARY_SUCCESSOR_MISSING');
    assert(uint(h.timestamp)<=uint(boundary.timestamp)&&uint(next.timestamp)>uint(boundary.timestamp),'BOUNDARY_BLOCK_SELECTION');
    assert.equal(uint(next.number),uint(h.number)+1n,'BOUNDARY_BLOCK_SEQUENCE');assert.equal(next.parentHash,h.hash,'BOUNDARY_BLOCK_PARENT');hash32(next.hash);
   }else{
    assert.equal(h.timestamp,boundary.timestamp,'EVENT_BLOCK_TIME');
    const r=request.history.records.find(r=>r.index===boundary.event.index);assert(r,'EVENT_RECORD_MISSING');assert.equal(r.blockHash,h.hash,'EVENT_BLOCK_HASH');assert.equal(r.transactionHash,boundary.event.transactionHash,'EVENT_TRANSACTION_BINDING');
   }
   assert(uint(request.history.query.number)>=uint(h.number)+uint(request.config.proof.finalityDepth),'FINALITY_DEPTH_INSUFFICIENT');
   assert(boundary.stateCommitment,'PAST_STATE_EVIDENCE_MISSING');hash32(boundary.stateCommitment);
   const values={};
   for(const asset of ['market','collateral']){
    const p=request.config.prices[asset],suffix=asset==='market'?'Market':'Collateral';
    const primary=source.reports[selection['primary'+suffix]],reference=source.reports[selection['reference'+suffix]];
    assert(primary&&reference,'PRICE_REPORT_MISSING');
    const v=validateReport(primary,p,asset,boundary,false,request.config.scope),ref=validateReport(reference,p,asset,boundary,true,request.config.scope);
    const difference=v>ref?v-ref:ref-v;
    assert(difference*10000n<=ref*uint(p.maxDeviationBps),'PRICE_DEVIATION');
    const timeDiff=uint(primary.observedAt)>uint(reference.observedAt)?uint(primary.observedAt)-uint(reference.observedAt):uint(reference.observedAt)-uint(primary.observedAt);
    assert(timeDiff<=uint(p.maxSkew),'PRICE_OBSERVATION_SKEW');values[asset]=v.toString();
   }
   // Deterministic pinned selection; another otherwise-valid round cannot replace it.
   eq(selection,source.request.priceSelections.find(p=>p.key===key),'PRICE_SELECTION_REPLACEMENT');
   valid.set(key,{...values,anchorId:boundary.id,provenance:'SYNTHETIC_TEST_ONLY_NOT_APPROVED'});
  }catch(e){blockers.push(e.message.split('\n')[0]+':'+key);}
 }
 return {valid,blockers,independentChainProof:false,proofBlockers:['INDEPENDENT_CHAIN_PROOF_UNAVAILABLE','OPERATIONAL_PRICE_APPROVAL_UNPROVEN']};
}
