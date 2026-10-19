
import {assert,eq,hash,uint,rational,zero,add,multiply,divide,wire,NO_AUTHORITY} from './policy-v1-common.mjs';
import {verifyPolicyV1History} from './policy-v1-source.mjs';
export function buildPolicyV1Segments(context,request){
 const verified=verifyPolicyV1History(context,request),c=request.config,h=request.history,O=uint(c.origin),E=uint(c.end),D=uint(c.D),Q=uint(h.query.timestamp);
 const times=new Set([c.origin]);
 for(const r of h.records)times.add(r.timestamp);
 for(const e of c.epochs)if(uint(e.to)<=Q)times.add(e.to);
 assert((Q-O)/D<=4096n,'PERIOD_BOUND_EXCEEDED');
 for(let b=O+D;b<=Q;b+=D)times.add(b.toString());
 const boundaries=[...times].map(BigInt).filter(t=>t>=O&&t<=Q).sort((a,b)=>a<b?-1:a>b?1:0);
 const state=new Map(h.inventory.map(p=>[p.pid,0n])),byPid=new Map(h.inventory.map(p=>[p.pid,p])),segments=[];let cursor=0;
 for(let i=0;i+1<boundaries.length;i++){
  const a=boundaries[i],b=boundaries[i+1];
  while(cursor<h.records.length&&uint(h.records[cursor].timestamp)<=a){const r=h.records[cursor++];state.set(r.pid,uint(r.nextQty));}
  assert(b>a,'ZERO_LENGTH_SEGMENT');
  const participants=h.inventory.filter(p=>state.get(p.pid)>0n).map(p=>({pid:p.pid,account:p.account,side:p.side,quantity18:state.get(p.pid).toString()}));
  let L=0n,S=0n;for(const p of participants){if(p.side==='LONG')L+=uint(p.quantity18);else S+=uint(p.quantity18);}
  const matched=L<S?L:S,difference=L>S?L-S:S-L,side=L>S?'LONG':S>L?'SHORT':'NONE';
  const rate=rational(uint(c.rBps.n),uint(c.rBps.d));
  const total=L+S===0n?zero():multiply(rational(matched*difference*(b-a),D*(L+S)*10000n),rate);
  const prefix=h.records.filter(r=>uint(r.timestamp)<=b);
  const epoch=a<E?c.epochs.find(e=>uint(e.from)<=a&&b<=uint(e.to)).id:null;
  const base={scope:c.scope,policyCommitment:verified.config.policyCommitment,from:a.toString(),to:b.toString(),kind:a<E?'OFFICIAL':'GAP',epoch,period:((a-O)/D).toString(),prefixCommitment:hash(prefix),participants};
  const segment={...base,id:hash(base),long18:L.toString(),short18:S.toString(),direction:side,fundingUsd18:wire(total),positions:[]};
  let debts=zero(),claims=zero();
  for(const p of participants){
   const payer=side!=='NONE'&&p.side===side;
   const amount=side==='NONE'?zero():multiply(total,rational(uint(p.quantity18),payer?(side==='LONG'?L:S):(side==='LONG'?S:L)));
   const debt=payer?amount:zero(),claim=payer?zero():amount;
   debts=add(debts,debt);claims=add(claims,claim);
   segment.positions.push({pid:p.pid,account:p.account,debtUsd18:wire(debt),claimUsd18:wire(claim)});
  }
  eq(wire(debts),wire(claims),'SEGMENT_DEBT_CLAIM_CONSERVATION');eq(wire(debts),wire(total),'SEGMENT_FUNDING_TOTAL');segments.push(segment);
 }
 const lots=[];
 for(const p of h.inventory){
  const records=h.records.filter(r=>r.pid===p.pid),opening=uint(records[0].timestamp);
  for(const r of records.slice(1))lots.push({pid:p.pid,sequence:r.sequence,quantity18:(uint(r.oldQty)-uint(r.nextQty)).toString(),opened:opening.toString(),closedAt:r.timestamp,kind:'CLOSED_LOT'});
  const final=records.at(-1);if(uint(final.nextQty)>0n)lots.push({pid:p.pid,sequence:null,quantity18:final.nextQty,opened:opening.toString(),closedAt:null,kind:'OPEN_REMAINDER'});
 }
 const attributions=[];
 for(const s of segments)for(const p of s.positions){
  const q=s.participants.find(x=>x.pid===p.pid),eligible=lots.filter(l=>l.pid===p.pid&&uint(l.opened)<=uint(s.from)&&(l.closedAt===null||uint(l.closedAt)>=uint(s.to)));
  assert.equal(eligible.reduce((n,l)=>n+uint(l.quantity18),0n),uint(q.quantity18),'LOT_QUANTITY_CONSERVATION');
  let debt=zero(),claim=zero();
  for(const l of eligible){
   const ratio=rational(uint(l.quantity18),uint(q.quantity18)),d=multiply(rational(BigInt(p.debtUsd18.n),BigInt(p.debtUsd18.d)),ratio),cl=multiply(rational(BigInt(p.claimUsd18.n),BigInt(p.claimUsd18.d)),ratio);
   const row={segmentId:s.id,pid:p.pid,sequence:l.sequence,kind:l.kind,epoch:s.epoch,period:s.period,debtUsd18:wire(d),claimUsd18:wire(cl)};row.id=hash(row);attributions.push(row);debt=add(debt,d);claim=add(claim,cl);
  }
  eq(wire(debt),p.debtUsd18,'LOT_DEBT_CONSERVATION');eq(wire(claim),p.claimUsd18,'LOT_CLAIM_CONSERVATION');
 }
 if(request.attributions!==undefined){
  assert(new Set(request.attributions.map(x=>x.id)).size===request.attributions.length,'DUPLICATE_ATTRIBUTION');
  eq(request.attributions,attributions,'ATTRIBUTION_RECONCILIATION');
 }
 const totals=new Map();
 for(const s of segments)for(const p of s.positions){
  const key=p.pid+':'+s.kind+':'+(s.epoch??s.period),v=totals.get(key)??{pid:p.pid,kind:s.kind,epoch:s.epoch,period:s.kind==='GAP'?s.period:null,debt:zero(),claim:zero()};
  v.debt=add(v.debt,rational(BigInt(p.debtUsd18.n),BigInt(p.debtUsd18.d)));v.claim=add(v.claim,rational(BigInt(p.claimUsd18.n),BigInt(p.claimUsd18.d)));totals.set(key,v);
 }
 const last=boundaries.at(-1);
 return {historySeal:'SEALED_SYNTHETIC_RESEARCH_ONLY',independentChainProof:false,sourceCommitment:verified.historyCommitment,policyCommitment:verified.config.policyCommitment,segments,attributions,positionEpochTotals:[...totals.values()].map(({debt,claim,...x})=>({...x,debtUsd18:wire(debt),claimUsd18:wire(claim)})),pendingTail:last<Q?{from:last.toString(),to:Q.toString(),state:'NOT_A_POLICY_BOUNDARY'}:null,openPositions:h.finalPositions.filter(p=>uint(p.remainingQuantity18)>0n).map(p=>p.pid),...NO_AUTHORITY};
}
