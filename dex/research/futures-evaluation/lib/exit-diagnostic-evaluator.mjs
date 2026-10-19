
import assert from 'node:assert/strict';
import {CALCULATION_VERSION,evaluationIdFor} from './evaluation-identity.mjs';
import {rawTransitionIntegrals,assertIndependentExposure} from './independent-exposure-reference.mjs';
import {record,dense,hash32,canonical} from './input-schema.mjs';
import {integer,unsigned,rational,add,subtract,wire,sameFraction,pnlDiagnostic} from './exact-rational.mjs';
export {CALCULATION_VERSION};
const zero=()=>rational(0n,1n),sum=(a,b)=>add(a,b),min=(a,b)=>a<b?a:b,max=(a,b)=>a>b?a:b;
function stringsOnly(x){assert(typeof x!=='number'&&typeof x!=='bigint','NUMBER_INPUT_FORBIDDEN');if(Array.isArray(x)){dense(x,4096);for(const v of x)stringsOnly(v);}else if(x&&typeof x==='object'){record(x,[],Object.keys(x));for(const v of Object.values(x))stringsOnly(v);}}
function positive(x){const n=unsigned(x);assert(n>0n,'POSITIVE_INTEGER_REQUIRED');return n;}
function fractions(x){record(x,['n','d']);const f=rational(x.n,x.d);assert(f.n>=0n,'NEGATIVE_FUNDING_AMOUNT');return f;}
function epochConfig(input){
 dense(input.officialEpochs,64);assert(input.officialEpochs.length>0,'EPOCHS_REQUIRED');let end=null,next=1n;const epochs=[];
 for(const e of input.officialEpochs){record(e,['epoch','from','to']);assert.equal(unsigned(e.epoch),next,'EPOCH_SEQUENCE');const from=unsigned(e.from),to=unsigned(e.to);assert(to>from,'INVALID_EPOCH_INTERVAL');if(end!==null)assert.equal(from,end,'EPOCH_GAP_OR_OVERLAP');epochs.push({epoch:e.epoch,from,to});end=to;next+=1n;}
 assert.equal(end,unsigned(input.cutoff),'EPOCH_CUTOFF_MISMATCH');return epochs;
}
function totals(){return {official:{long:0n,short:0n},gap:{long:0n,short:0n}};}
const wireTotals=t=>({official:{long:t.official.long.toString(),short:t.official.short.toString()},gap:{long:t.gap.long.toString(),short:t.gap.short.toString()}});
export function validateExposureIntervals(expected,submitted){
 dense(submitted,4096);const seen=new Set();for(const x of submitted){record(x,['from','to','long18','short18','kind','epoch']);const key=canonical(x);assert(!seen.has(key),'EXPOSURE_INTERVAL_DUPLICATE');seen.add(key);}
 assert.equal(canonical(submitted),canonical(expected),'EXPOSURE_INTERVAL_COVERAGE_MISMATCH');
}
export function integrateHistory(input){
 const epochs=epochConfig(input),E=unsigned(input.cutoff);dense(input.transitions,256);assert(input.transitions.length>1,'COMPLETE_HISTORY_REQUIRED');
 let previousTime=null,L=0n,S=0n,sequence=1n,opening=null,closed=0n;const forward=totals(),lot=totals(),intervals=[],exits=[],receipts=new Set(),perEpoch=new Map(epochs.map(e=>[e.epoch,{long:0n,short:0n}]));
 function piece(from,to,l,s,kind,epoch){
  if(to<=from)return;const dt=to-from;forward[kind].long+=l*dt;forward[kind].short+=s*dt;
  if(kind==='official'){const p=perEpoch.get(epoch);p.long+=l*dt;p.short+=s*dt;}
  intervals.push({from:from.toString(),to:to.toString(),long18:l.toString(),short18:s.toString(),kind:kind==='official'?'OFFICIAL':'GAP',epoch});
 }
 for(const t of input.transitions){
  record(t,['pid','sequence','timestamp','oldL','oldS','nextL','nextS','receipt']);assert.equal(t.pid,input.source.scope.pid,'POSITION_SCOPE_MISMATCH');assert.equal(unsigned(t.sequence),sequence,'TRANSITION_SEQUENCE');hash32(t.receipt);assert(!receipts.has(t.receipt.toLowerCase()),'DUPLICATE_TRANSITION_RECEIPT');receipts.add(t.receipt.toLowerCase());
  const time=unsigned(t.timestamp),ol=unsigned(t.oldL),os=unsigned(t.oldS),nl=unsigned(t.nextL),ns=unsigned(t.nextS);
  assert.equal(ol,L,'OLD_EXPOSURE_MISMATCH');assert.equal(os,S,'OLD_EXPOSURE_MISMATCH');assert(!(nl>0n&&ns>0n),'MIXED_DIRECTION');
  if(input.position.side==='LONG')assert.equal(ns,0n,'DIRECTION_MISMATCH');else assert.equal(nl,0n,'DIRECTION_MISMATCH');
  if(opening===null){assert(time>=epochs[0].from&&time<E,'INVALID_OPEN_TIME');assert.equal(ol+os,0n);assert.equal(nl+ns,positive(input.position.initialQuantity18));opening=time;}
  else {
   assert(time>=previousTime,'TIME_REVERSED');const delta=L+S-nl-ns;assert(delta>0n&&nl<=L&&ns<=S,'INVALID_REDUCTION_OR_INCREASE');
   for(const e of epochs)piece(max(previousTime,e.from),min(time,e.to),L,S,'official',e.epoch);
   piece(max(previousTime,E),time,L,S,'gap',null);
   closed+=delta;exits.push({sequence:t.sequence,timestamp:t.timestamp,quantity18:delta.toString(),cumulativeClosed:closed.toString(),final:nl+ns===0n,receipt:t.receipt,boundary:time<E?'BEFORE_E':time===E?'AT_E':'AFTER_E'});
   // Independent method: each closed lot is integrated from opening until its own exit.
   for(const e of epochs){const dt=max(0n,min(time,e.to)-max(opening,e.from));lot.official[input.position.side==='LONG'?'long':'short']+=delta*dt;}
   lot.gap[input.position.side==='LONG'?'long':'short']+=delta*max(0n,time-max(opening,E));
  }
  previousTime=time;L=nl;S=ns;sequence+=1n;
 }
 assert.equal(L+S,0n,'POSITION_NOT_FULLY_CLOSED');assert.equal(closed,unsigned(input.position.initialQuantity18),'CLOSED_QUANTITY_MISMATCH');
 assert.equal(canonical(wireTotals(forward)),canonical(wireTotals(lot)),'INDEPENDENT_INTEGRAL_MISMATCH');
 const rawReference=rawTransitionIntegrals(input);assertIndependentExposure(wireTotals(forward),rawReference);
 if(input.submittedIntervals!==null)validateExposureIntervals(intervals,input.submittedIntervals);
 if(input.observedIntegrals!==null){record(input.observedIntegrals,['official','gap']);for(const k of ['official','gap']){record(input.observedIntegrals[k],['long','short']);unsigned(input.observedIntegrals[k].long);unsigned(input.observedIntegrals[k].short);}assert.equal(canonical(wireTotals(forward)),canonical(input.observedIntegrals),'RECORDED_INTEGRAL_MISMATCH');}
 return {unit:'USD18_NOTIONAL_SECONDS',exits,intervals,integrals:wireTotals(forward),independentLotIntegrals:wireTotals(lot),rawTransitionIntegrals:rawReference,perEpoch:[...perEpoch].map(([epoch,p])=>({epoch,long:p.long.toString(),short:p.short.toString()})),comparison:input.observedIntegrals===null?'TWO_METHODS_MATCH_RECORDED_EVIDENCE_MISSING':'TWO_METHODS_AND_RECORDED_EVIDENCE_MATCH'};
}

function fundingDiagnostics(input,exposure,blockers){
 // Necessary Epochs derive from validated held exposure, never submitted obligations.
 const requiredEpochs=exposure.perEpoch.filter(e=>unsigned(e.long)+unsigned(e.short)>0n).map(e=>e.epoch);
 const f=input.funding;
 if(f===null||f.kind==='UNFINALIZED_RECORDED'){
  if(f!==null){record(f,['kind','state','reference']);unsigned(f.state);hash32(f.reference);}
  blockers.push(f===null?'OFFICIAL_FUNDING_EVIDENCE_MISSING':'OFFICIAL_FUNDING_UNFINALIZED');
  const coverage={evidenceCompleteness:'MISSING',allocationStatus:'MISSING',requiredEpochs,missingEpochs:[...requiredEpochs],submittedSubtotal:null,totalDebt:null,totalClaim:null,confirmedAmount:null};
  return {funding:null,coverage};
 }
 record(f,['kind','reference','obligations','allocations']);assert.equal(f.kind,'SYNTHETIC_TEST_ONLY','UNSUPPORTED_FUNDING_EVIDENCE');hash32(f.reference);dense(f.obligations,64);
 const ids=new Map(),epochs=new Set();let subtotalDebt=zero(),subtotalClaim=zero();
 for(const o of f.obligations){
  record(o,['obligationId','epoch','debtUsd18','claimUsd18']);
  const id=hash32(o.obligationId);
  assert(!ids.has(id),'FUNDING_OBLIGATION_DUPLICATE');
  assert(!epochs.has(o.epoch),'FUNDING_EPOCH_DUPLICATE');
  assert(input.officialEpochs.some(e=>e.epoch===o.epoch),'FUNDING_EPOCH_OUTSIDE_OFFICIAL');
  assert(requiredEpochs.includes(o.epoch),'FUNDING_UNEXPECTED_EPOCH');
  epochs.add(o.epoch);
  const debt=fractions(o.debtUsd18),claim=fractions(o.claimUsd18);
  ids.set(id,{debt,claim,assignedDebt:zero(),assignedClaim:zero()});
  subtotalDebt=sum(subtotalDebt,debt);subtotalClaim=sum(subtotalClaim,claim);
 }
 const missingEpochs=requiredEpochs.filter(e=>!epochs.has(e));
 const evidenceCompleteness=missingEpochs.length===0?'COMPLETE':epochs.size===0?'MISSING':'PARTIAL';
 for(const epoch of missingEpochs)blockers.push('OFFICIAL_FUNDING_OBLIGATIONS_MISSING:'+epoch);
 if(f.allocations!==null){
  assert(input.policies.fundingAllocation!==null,'FUNDING_ATTRIBUTION_POLICY_MISSING');dense(f.allocations,256);const pairs=new Set();
  for(const a of f.allocations){
   record(a,['obligationId','exitSequence','debtUsd18','claimUsd18']);
   const id=hash32(a.obligationId),o=ids.get(id);assert(o,'FUNDING_OBLIGATION_UNKNOWN');
   assert(exposure.exits.some(e=>e.sequence===a.exitSequence),'FUNDING_EXIT_UNKNOWN');
   const key=id+':'+a.exitSequence;assert(!pairs.has(key),'FUNDING_DUPLICATE_ATTRIBUTION');pairs.add(key);
   o.assignedDebt=sum(o.assignedDebt,fractions(a.debtUsd18));o.assignedClaim=sum(o.assignedClaim,fractions(a.claimUsd18));
   assert(o.assignedDebt.n*o.debt.d<=o.debt.n*o.assignedDebt.d&&o.assignedClaim.n*o.claim.d<=o.claim.n*o.assignedClaim.d,'FUNDING_OVERALLOCATED');
  }
 }
 const obligations=[...ids].map(([id,o])=>({id,debt:wire(o.debt),claim:wire(o.claim),assignedDebt:f.allocations===null?null:wire(o.assignedDebt),assignedClaim:f.allocations===null?null:wire(o.assignedClaim),unallocatedDebt:f.allocations===null?null:wire(subtract(o.debt,o.assignedDebt)),unallocatedClaim:f.allocations===null?null:wire(subtract(o.claim,o.assignedClaim))}));
 const hasResidual=[...ids.values()].some(o=>subtract(o.debt,o.assignedDebt).n!==0n||subtract(o.claim,o.assignedClaim).n!==0n);
 const allocationStatus=f.allocations===null?'MISSING':evidenceCompleteness!=='COMPLETE'||hasResidual?'PARTIAL':'COMPLETE';
 if(allocationStatus!=='COMPLETE')blockers.push('OFFICIAL_FUNDING_ALLOCATION_'+allocationStatus);
 const coverage={evidenceCompleteness,allocationStatus,requiredEpochs,missingEpochs,submittedSubtotal:{debt:wire(subtotalDebt),claim:wire(subtotalClaim)},totalDebt:evidenceCompleteness==='COMPLETE'?wire(subtotalDebt):null,totalClaim:evidenceCompleteness==='COMPLETE'?wire(subtotalClaim):null,confirmedAmount:null};
 return {funding:{provenance:'SYNTHETIC_TEST_ONLY',unit:'USD18_RATIONAL',...coverage,obligations},coverage};
}
export function evaluateDiagnostics(input){
 stringsOnly(input);record(input,['schema','source','units','position','cutoff','officialEpochs','transitions','prices','policies','funding','observedIntegrals','submittedIntervals']);assert.equal(input.schema,'LQC_PURE_EXIT_DIAGNOSTIC_INPUT_V1');
 record(input.source,['kind','semanticCommitment','scope']);assert(['SYNTHETIC_TEST_ONLY','UNAPPROVED_RECORDED_INPUT'].includes(input.source.kind),'UNSUPPORTED_SOURCE_KIND');hash32(input.source.semanticCommitment);record(input.source.scope,['chainId','account','domain','series','pid']);for(const k of ['chainId','domain','series','pid'])unsigned(input.source.scope[k]);assert(/^0x[0-9a-fA-F]{40}$/.test(input.source.scope.account),'INVALID_ACCOUNT');
 record(input.units,['quantity','marketPrice','collateralPrice','collateralDecimals']);assert.equal(input.units.quantity,'USD18_NOTIONAL','QUANTITY_UNIT_MISMATCH');assert.equal(input.units.marketPrice,'FIXED_18','PRICE_UNIT_MISMATCH');assert.equal(input.units.collateralPrice,'FIXED_18','PRICE_UNIT_MISMATCH');assert(unsigned(input.units.collateralDecimals)<=255n,'DECIMALS_OUT_OF_RANGE');
 record(input.position,['side','entryPrice18','initialQuantity18']);assert(['LONG','SHORT'].includes(input.position.side),'INVALID_DIRECTION');positive(input.position.entryPrice18);positive(input.position.initialQuantity18);
 record(input.policies,['calculation','freshness','fundingAllocation','gap','integerization','dust']);
 for(const k of ['freshness','gap','integerization','dust'])assert.equal(input.policies[k],null,'UNSUPPORTED_UNAPPROVED_POLICY:'+k);
 for(const k of ['calculation','fundingAllocation'])if(input.policies[k]!==null){record(input.policies[k],['provenance','reference']);assert.equal(input.policies[k].provenance,'SYNTHETIC_TEST_ONLY');hash32(input.policies[k].reference);}
 const exposure=integrateHistory(input),bySequence=new Map();dense(input.prices,256);
 for(const p of input.prices){record(p,['sequence','market18','collateral18','marketTime','collateralTime','provenance','reference']);assert(['SYNTHETIC_TEST_ONLY','LOCAL_MOCK_NOT_APPROVED'].includes(p.provenance),'UNSUPPORTED_PRICE_PROVENANCE');hash32(p.reference);assert(!bySequence.has(p.sequence),'PRICE_SEQUENCE_DUPLICATE');assert(exposure.exits.some(e=>e.sequence===p.sequence),'PRICE_EXIT_UNKNOWN');positive(p.market18);positive(p.collateral18);unsigned(p.marketTime);unsigned(p.collateralTime);bySequence.set(p.sequence,p);}
 const blockers=['CALCULATION_POLICY_NOT_APPROVED','ENTRY_PRICE_APPROVAL_EVIDENCE_MISSING','PRICE_APPROVAL_EVIDENCE_MISSING','PRICE_FRESHNESS_POLICY_UNDECIDED','GAP_FUNDING_POLICY_UNDECIDED','FUNDING_ATTRIBUTION_POLICY_NOT_APPROVED','INTEGERIZATION_POLICY_UNDECIDED','DUST_POLICY_UNDECIDED'];if(input.observedIntegrals===null)blockers.push('RECORDED_EXPOSURE_EVIDENCE_MISSING');
 let usd=zero(),raw=zero(),usdGain=zero(),usdLoss=zero(),rawGain=zero(),rawLoss=zero(),complete=true,anyKnown=false;
 const legs=exposure.exits.map(e=>{
  const p=bySequence.get(e.sequence);if(!p){complete=false;blockers.push('PRICE_EVIDENCE_MISSING:'+e.sequence);return {...e,pnlDiagnostic:null,confirmedAmount:null};}
  assert(unsigned(p.marketTime)<=unsigned(e.timestamp)&&unsigned(p.collateralTime)<=unsigned(e.timestamp),'PRICE_TIME_AFTER_EXIT');
  anyKnown=true;const f=pnlDiagnostic({quantity18:e.quantity18,side:input.position.side,entry18:input.position.entryPrice18,market18:p.market18,collateral18:p.collateral18,decimals:input.units.collateralDecimals,quantityUnit:input.units.quantity,priceUnit:input.units.marketPrice});
  usd=add(usd,f.usd18);raw=add(raw,f.rawToken);
  if(f.usd18.n>=0n){usdGain=add(usdGain,f.usd18);rawGain=add(rawGain,f.rawToken);}else{usdLoss=add(usdLoss,rational(-f.usd18.n,f.usd18.d));rawLoss=add(rawLoss,rational(-f.rawToken.n,f.rawToken.d));}
  return {...e,pnlDiagnostic:{provenance:p.provenance,usd18Unit:'USD18_RATIONAL',rawTokenUnit:'RAW_COLLATERAL_TOKEN_RATIONAL',usd18:wire(f.usd18),rawToken:wire(f.rawToken),tokenDecimals:input.units.collateralDecimals,priceReference:p.reference},confirmedAmount:null};
 });
 const funding=fundingDiagnostics(input,exposure,blockers);
 const evaluationId=evaluationIdFor(input,CALCULATION_VERSION);
 return {schema:'LQC_PURE_EXIT_DIAGNOSTIC_RESULT_V1',calculationVersion:CALCULATION_VERSION,evaluationId,sourceSemanticCommitment:input.source.semanticCommitment,
 evaluationStatus:'NOT_EVALUATED',confirmedAmount:null,monetaryResult:null,fundsAuthority:false,settlementAuthorized:false,createsClaim:false,consumesHistory:false,
 units:{...input.units},diagnostics:{legs,pnlTotals:complete?{usd18Unit:'USD18_RATIONAL',rawTokenUnit:'RAW_COLLATERAL_TOKEN_RATIONAL',tokenDecimals:input.units.collateralDecimals,usd18Net:wire(usd),rawTokenNet:wire(raw),usd18Gain:wire(usdGain),usd18Loss:wire(usdLoss),rawTokenGain:wire(rawGain),rawTokenLoss:wire(rawLoss),nettingAuthorized:false}:null,knownLegsSubtotal:anyKnown?{usd18:wire(usd),rawToken:wire(raw)}:null,exposure,officialFunding:funding.funding,fundingEvidence:funding.coverage,gapFunding:null,integerizedAmounts:null,dustAllocation:null},
 evidenceUse:{source:input.source.kind,policyApproval:false,priceApproval:false},blockers:[...new Set(blockers)]};
}
