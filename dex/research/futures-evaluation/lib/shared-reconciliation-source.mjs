import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {loadPolicyV1ResearchCase} from './policy-v1-source.mjs';
import {evaluatePolicyV1} from './policy-v1-evaluator.mjs';
import {createPolicyV1Ledger,advancePolicyV1Ledger} from './policy-v1-ledger.mjs';
import {loadSettlementLinkContext,diagnoseSettlementLinkWithContext,positionAggregateKey} from './settlement-link-diagnosis.mjs';
import {SHARED_REFERENCE_SHA256} from './shared-reconciliation-reference.mjs';
import {assert,record,freeze,hash,fraction,zero,add,subtract,wire,ECONOMIC_POLICY_VERSION,POLICY_CALCULATION_VERSION} from './policy-v1-common.mjs';
import {validateSharedCashEpochs,validateSharedCashRouting,ledgerEventRows,reservationRights} from './shared-reconciliation-identities.mjs';
const contexts=new WeakMap();
const copy=x=>structuredClone(x);
export const epochKey=x=>[x.account,x.phase,x.epoch??'GAP',x.phase==='GAP'?x.period:''].join('|');
export function aggregateRights(rows,key){
 const totals=new Map();for(const row of rows){const k=key(row);let v=totals.get(k);if(!v){v={id:k,debt:zero(),claim:zero()};totals.set(k,v);}v.debt=add(v.debt,fraction(row.debt));v.claim=add(v.claim,fraction(row.claim));}
 return [...totals.values()].map(v=>({id:v.id,debt:wire(v.debt),claim:wire(v.claim)}));
}
function cashSource(scope,projected,result,postings){
 if(result.history.openPositions.length||result.history.pendingTail||!result.diagnosticAmounts)return null;
 const rawPositions=new Map(),accounts=new Map();for(const segment of result.diagnosticAmounts.funding)for(const p of segment.positions){const account=projected.get(p.pid);let v=accounts.get(account);if(!v){v={account,debt:zero(),claim:zero()};accounts.set(account,v);}v.debt=add(v.debt,fraction(p.debtRaw));v.claim=add(v.claim,fraction(p.claimRaw));let q=rawPositions.get(p.pid);if(!q){q={pid:p.pid,account,debt:zero(),claim:zero()};rawPositions.set(p.pid,q);}q.debt=add(q.debt,fraction(p.debtRaw));q.claim=add(q.claim,fraction(p.claimRaw));}
 const debtors=[...accounts.values()].filter(x=>x.debt.n>0n).map(x=>({account:x.account,amount:wire(x.debt)})),creditors=[...accounts.values()].filter(x=>x.claim.n>0n).map(x=>({account:x.account,amount:wire(x.claim)}));if(!debtors.length||!creditors.length)return null;
 const spec={schema:'LQC_POLICY_V1_LEDGER_MODEL',scope:{chainId:scope.chainId,domain:scope.domain,series:scope.series,token:scope.token,decimals:scope.decimals},policyVersion:ECONOMIC_POLICY_VERSION,calculationVersion:POLICY_CALCULATION_VERSION,policyCommitment:result.configuration.policyCommitment,obligationId:hash({kind:'SYNTHETIC_PROJECTED_FUNDING',source:result.history.sourceCommitment,accounts:[...projected]}),obligationKind:'FUNDING',debtors,creditors};
 validateSharedCashEpochs(postings);
 const initial=createPolicyV1Ledger(spec),events=[],entries=[];let globalSequence=0n;
 const groupState=new Map();
 function addEvent(kind,who,amount){
  if(amount==='0')return;const field=kind==='COLLECT'?'debt':'claim',parts=[...rawPositions.values()].filter(p=>p.account===who&&p[field].n>0n);
  validateSharedCashRouting(postings,parts.map(p=>({amount:wire(p[field])})),amount);
  for(const part of parts){const n=parts.length===1?amount:part[field].n.toString(),id=hash({kind,who,amount:n,pid:part.pid,binding:initial.binding,sequence:(++globalSequence).toString()});
   events.push({id,sequence:globalSequence.toString(),kind,account:who,amount:n,binding:initial.binding,provenance:'SYNTHETIC_RECEIPT_MODEL_NOT_VERIFIED_CASH'});
   const p=postings.find(p=>p.pid===part.pid&&fraction(p[field]).n>0n),key=epochKey(p)+'|'+kind,state=groupState.get(key)??{sequence:0n,cumulative:0n};state.sequence++;state.cumulative+=BigInt(n);groupState.set(key,state);
   entries.push({id,receipt:id,globalSequence:globalSequence.toString(),account:who,pid:p.pid,phase:p.phase,epoch:p.epoch,period:p.period,operation:kind,sequence:state.sequence.toString(),amount:n,cumulative:state.cumulative.toString()});
  }
 }
 for(const d of initial.debtors)addEvent('COLLECT',d.account,d.collectionTarget);for(const c of initial.creditors)addEvent('PAY',c.account,c.payoutTarget);
 // All entries share one synthetic transaction; distinct log/item units remain valid.
 for(const e of entries){e.consumptionIdentity={scopeCommitment:hash(scope),transactionHash:hash({syntheticBatch:initial.binding}),logIndex:e.globalSequence,itemIndex:'0',businessReceipt:e.receipt,receiptSequence:e.sequence};events.find(x=>x.id===e.id).consumptionIdentity=copy(e.consumptionIdentity);}
 const model=advancePolicyV1Ledger(initial,spec,ledgerEventRows(events)),terminalMap=new Map();for(const e of entries){const id=epochKey(e)+'|'+e.operation;terminalMap.set(id,{id,account:e.account,phase:e.phase,epoch:e.epoch,period:e.period,operation:e.operation,sequence:e.sequence,receipt:e.receipt,cumulative:e.cumulative});}const terminals=[...terminalMap.values()];
 const ownerRights=reservationRights(scope,postings,[...rawPositions.values()],model,entries),reservations=[];let cursor=zero();
 for(const owner of ownerRights){const to=add(cursor,fraction(owner.amount));const {amount,...identity}=owner;reservations.push({id:hash(identity),resource:'FUNDING_CASH',...identity,from:wire(cursor),to:wire(to)});cursor=to;}
 const cash={scope,basis:'FUNDING_ONLY_ZERO_INITIAL',initialCash:'0',events,endingCash:model.cash,reportedAccounted:model.cash,buckets:[{id:'FUNDING',amount:model.cash}],reservations,rights:{uncollectedDebt:model.uncollectedDebt,creditorRemaining:model.creditorRemaining,refundOutstanding:model.refundOutstanding,aggregateCashReservation:model.aggregateCashReservation},otherObligations:'EXPLICIT_SYNTHETIC_NONE'};
 return {spec,initial,model,ownerRights,consumption:{scope,entries,terminals},cash};
}
function syntheticSource(name,definition){
 const {context,request}=loadPolicyV1ResearchCase(definition.baseCase),result=evaluatePolicyV1(context,request),h=result.history;
 const projected=new Map(request.history.inventory.map(p=>[p.pid,definition.aliases[p.pid]??p.account]));
 const scope={...request.config.scope,queryBlock:{number:request.history.query.number,hash:request.history.query.hash},policyMode:'NEW_POLICY_V1_SYNTHETIC',policyCommitment:result.configuration.policyCommitment};
 const positions=request.history.inventory.map(p=>({...p,account:projected.get(p.pid)})),accounts=[...new Set(positions.map(p=>p.account))].map(id=>({id}));
 const transitions=request.history.records.map(t=>({...t,account:projected.get(t.pid)}));
 const lotMap=new Map();for(const a of h.attributions){const key=a.pid+'|'+(a.sequence??'OPEN')+'|'+a.kind;if(lotMap.has(key))continue;const row=transitions.find(t=>t.pid===a.pid&&t.sequence===a.sequence),final=request.history.finalPositions.find(p=>p.pid===a.pid);const quantity=a.kind==='OPEN_REMAINDER'?final.remainingQuantity18:(BigInt(row.oldQty)-BigInt(row.nextQty)).toString();lotMap.set(key,{id:key,pid:a.pid,account:projected.get(a.pid),sequence:a.sequence,kind:a.kind,quantity18:quantity});}
 const lots=[...lotMap.values()];
 const lot=h.attributions.map(a=>({id:a.id,segmentId:a.segmentId,pid:a.pid,account:projected.get(a.pid),lotId:a.pid+'|'+(a.sequence??'OPEN')+'|'+a.kind,phase:h.segments.find(s=>s.id===a.segmentId).kind,epoch:a.epoch,period:a.period,debt:a.debtUsd18,claim:a.claimUsd18}));
 const position=h.segments.flatMap(s=>s.positions.map(p=>({id:s.id+'|'+p.pid,segmentId:s.id,pid:p.pid,account:projected.get(p.pid),phase:s.kind,epoch:s.epoch,period:s.period,debt:p.debtUsd18,claim:p.claimUsd18})));
 const positionEpoch=h.positionEpochTotals.map(t=>({id:[t.pid,t.kind,t.epoch??'GAP',t.kind==='GAP'?t.period:''].join('|'),debt:t.debtUsd18,claim:t.claimUsd18}));
 const accountEpoch=aggregateRights(position,epochKey),domainSegment=h.segments.map(s=>({id:s.id,debt:s.fundingUsd18,claim:s.fundingUsd18}));
 const cash=definition.cash==='NONE'?null:cashSource(scope,projected,result,position);
 const requestData={schema:'LQC_SHARED_RECONCILIATION_INPUT_V1',policyMode:scope.policyMode,scope,inventory:{accounts,positions,transitions,lots},postings:{unit:'USD18_EXACT',lot,position,positionEpoch,accountEpoch,domainSegment},consumption:cash?.consumption??null,cash:cash?.cash??null};
 return {request:requestData,reference:copy(requestData),cash,openPositions:h.openPositions,pendingTail:h.pendingTail,originEvidence:{level:'SYNTHETIC_REFERENCE',sourceCommitment:h.sourceCommitment,definitionSHA256:SHARED_REFERENCE_SHA256,identityProjection:Object.keys(definition.aliases).length?'EXPLICIT_SYNTHETIC_ACCOUNT_RELABELING_NOT_SERIES_APPROVAL':'NONE'},economicKeys:null,blockers:['SYNTHETIC_REFERENCE_NOT_CHAIN_AUTHENTICATION','COMMON_CALCULATION_REFERENCE_NOT_INDEPENDENT_PROOF','MULTI_POSITION_CROSS_VERSION_CONSUMPTION_UNVERIFIED','RUNTIME_PINS_FOR_V1_OBLIGATION_KEYS_MISSING',...(h.openPositions.length?['OPEN_POSITIONS_AND_GAP_OBLIGATIONS_NOT_FINAL']:[]),...(h.pendingTail?['OPEN_POLICY_TAIL_NOT_FINAL']:[])]};
}
export function loadSharedReconciliationCase(name){
 assert(typeof name==='string','CASE_NAME_REQUIRED');let data;
 if(name==='recorded-legacy'){
  const ctx=loadSettlementLinkContext(),diagnosis=diagnoseSettlementLinkWithContext(ctx),input=ctx.input,scope={...ctx.scope,token:ctx.scope.contracts.find(c=>c.role==='Token').address,decimals:input.units.collateralDecimals,policyMode:'EXISTING_SERIES',policyCommitment:null};
  const positions=[{pid:ctx.scope.pid,account:ctx.scope.account,side:input.position.side,initialQuantity18:input.position.initialQuantity18,entryPrice18:input.position.entryPrice18}];
  data={request:{schema:'LQC_SHARED_RECONCILIATION_INPUT_V1',policyMode:'EXISTING_SERIES',scope,inventory:{accounts:[{id:ctx.scope.account}],positions,transitions:null,lots:null},postings:null,consumption:null,cash:null},reference:null,cash:null,openPositions:null,pendingTail:null,originEvidence:{level:'LOCAL_RECORDED',sourceCommitment:ctx.sourceCommitment,definitionSHA256:null,identityProjection:'NONE'},economicKeys:{FUNDING:positionAggregateKey(ctx.scope,'FUNDING')},diagnosis,blockers:['MULTI_POSITION_DOMAIN_INVENTORY_REFERENCE_MISSING','LEGACY_OBLIGATIONS_AND_CASH_EVIDENCE_MISSING',...diagnosis.sourceBlockers]};
 }else{
  const bytes=fs.readFileSync(new URL('../shared-reconciliation-references.json',import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),SHARED_REFERENCE_SHA256,'SHARED_REFERENCE_HASH_MISMATCH');const refs=JSON.parse(bytes);assert.equal(refs.purpose,'TEST_ONLY_NOT_CHAIN_POLICY_OR_LEDGER_AUTHENTICATION','REFERENCE_PURPOSE');assert(Object.hasOwn(refs.cases,name),'UNKNOWN_SHARED_REFERENCE');const d=refs.cases[name];record(d,['baseCase','aliases','cash']);data=syntheticSource(name,d);
 }
 const view=freeze({caseId:name,evidence:copy(data.originEvidence)});contexts.set(view,freeze(data));return {context:view,request:copy(data.request)};
}
export function sharedReconciliationSource(context){assert(contexts.has(context),'PINNED_SHARED_CONTEXT_REQUIRED');return contexts.get(context);}
