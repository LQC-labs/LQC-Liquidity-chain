
import {assert,record,dense,strictWire,address,hash32,uint,fraction,rational,zero,add,subtract,wire,cmp,ceil,floor,hash,freeze,NO_AUTHORITY} from './policy-v1-common.mjs';
const ledgers=new WeakMap();
function normalizeSpec(spec){
 strictWire(spec);record(spec,['schema','scope','policyVersion','calculationVersion','policyCommitment','obligationId','obligationKind','debtors','creditors']);
 assert.equal(spec.schema,'LQC_POLICY_V1_LEDGER_MODEL','LEDGER_SCHEMA');assert.equal(spec.policyVersion,'LQC_SETTLEMENT_POLICY_V1','LEDGER_POLICY_VERSION');
 assert.equal(spec.calculationVersion,'LQC_POLICY_V1_RESEARCH_CALCULATOR_1','LEDGER_CALCULATION_VERSION');
 hash32(spec.policyCommitment);hash32(spec.obligationId);assert(['FUNDING','PNL','FEE'].includes(spec.obligationKind),'LEDGER_OBLIGATION_KIND');
 record(spec.scope,['chainId','domain','series','token','decimals']);for(const k of ['chainId','domain','series'])uint(spec.scope[k]);address(spec.scope.token);assert(uint(spec.scope.decimals)<=255n,'DECIMALS_RANGE');
 let debt=zero(),claim=zero();
 for(const k of ['debtors','creditors']){
  dense(spec[k],128);assert(spec[k].length>0,'LEDGER_PARTICIPANTS_REQUIRED');const seen=new Set();
  for(const x of spec[k]){record(x,['account','amount']);const a=address(x.account);assert(!seen.has(a.toLowerCase()),'LEDGER_ACCOUNT_DUPLICATE');seen.add(a.toLowerCase());const f=fraction(x.amount);if(k==='debtors')debt=add(debt,f);else claim=add(claim,f);}
 }
 assert.equal(cmp(debt,claim),0n,'LEDGER_DEBT_CLAIM_MISMATCH');return structuredClone(spec);
}
function compute(spec,events){
 const debtors=new Map(spec.debtors.map(x=>[x.account.toLowerCase(),{account:x.account,principal:fraction(x.amount),collected:0n,refunded:0n}]));
 const creditors=new Map(spec.creditors.map(x=>[x.account.toLowerCase(),{account:x.account,principal:fraction(x.amount),paid:0n}]));
 const ids=new Set(),bindings=hash(spec);let cash=0n,sequence=1n;
 for(const e of events){
  strictWire(e);record(e,['id','sequence','kind','account','amount','binding','provenance']);hash32(e.id);assert(!ids.has(e.id.toLowerCase()),'LEDGER_RECONSUMPTION');ids.add(e.id.toLowerCase());
  assert.equal(uint(e.sequence),sequence,'LEDGER_SEQUENCE');sequence++;assert.equal(e.binding,bindings,'LEDGER_EVENT_SCOPE_OR_VERSION');
  assert.equal(e.provenance,'SYNTHETIC_RECEIPT_MODEL_NOT_VERIFIED_CASH','UNSUPPORTED_LEDGER_RECEIPT_PROOF');
  const amount=uint(e.amount);assert(amount>0n,'ZERO_LEDGER_EVENT');address(e.account);
  if(e.kind==='COLLECT'){
   const d=debtors.get(e.account.toLowerCase());assert(d,'COLLECTION_ACCOUNT');assert(d.collected+amount<=ceil(d.principal),'COLLECTION_EXCEEDS_CEILING');d.collected+=amount;cash+=amount;
  }else if(e.kind==='PAY'){
   const c=creditors.get(e.account.toLowerCase());assert(c,'PAYOUT_ACCOUNT');assert(c.paid+amount<=floor(c.principal),'PAYOUT_EXCEEDS_FLOOR');
   const unpaid=[...debtors.values()].some(d=>cmp(d.principal,rational(d.collected,1n))>0n);
   assert(!(unpaid&&creditors.size>1),'SHARED_SHORTAGE_ALLOCATION_UNPROVEN');
   assert(cash>=amount,'UNFUNDED_PAYOUT');c.paid+=amount;cash-=amount;
  }else if(e.kind==='REFUND'){
   const d=debtors.get(e.account.toLowerCase());assert(d,'REFUND_ACCOUNT');
   const excess=subtract(rational(d.collected,1n),d.principal),available=excess.n>0n?floor(excess):0n;
   assert(d.refunded+amount<=available,'REFUND_EXCEEDS_OWN_EXCESS');assert(cash>=amount,'UNFUNDED_REFUND');d.refunded+=amount;cash-=amount;
  }else assert.fail('LEDGER_EVENT_KIND');
 }
 let debtUnpaid=zero(),creditorRemaining=zero(),refundOutstanding=zero(),fundedCreditorRemaining=zero();
 const debtorRows=[...debtors.values()].map(d=>{
  const collected=rational(d.collected,1n),applied=cmp(collected,d.principal)<0n?collected:d.principal;
  const unpaid=subtract(d.principal,applied),excess=subtract(collected,applied),refund=subtract(excess,rational(d.refunded,1n));
  debtUnpaid=add(debtUnpaid,unpaid);refundOutstanding=add(refundOutstanding,refund);fundedCreditorRemaining=add(fundedCreditorRemaining,applied);
  return {account:d.account,principal:wire(d.principal),collectionTarget:ceil(d.principal).toString(),collectedCash:d.collected.toString(),principalApplied:wire(applied),unpaid:wire(unpaid),overpaymentCreated:wire(excess),refundPaid:d.refunded.toString(),refundOutstanding:wire(refund)};
 });
 const creditorRows=[...creditors.values()].map(c=>{
  const remaining=subtract(c.principal,rational(c.paid,1n));creditorRemaining=add(creditorRemaining,remaining);fundedCreditorRemaining=subtract(fundedCreditorRemaining,rational(c.paid,1n));
  return {account:c.account,principal:wire(c.principal),payoutTarget:floor(c.principal).toString(),paidCash:c.paid.toString(),remaining:wire(remaining)};
 });
 assert(fundedCreditorRemaining.n>=0n,'NEGATIVE_FUNDED_CLAIMS');
 // One aggregate cash reservation, never separately ceil every fractional right.
 const reserved=add(fundedCreditorRemaining,refundOutstanding);
 assert.equal(cmp(reserved,rational(cash,1n)),0n,'CASH_RESERVATION_CONSERVATION');
 assert.equal(cmp(add(rational(cash,1n),debtUnpaid),add(creditorRemaining,refundOutstanding)),0n,'LEDGER_ASSET_LIABILITY_CONSERVATION');
 const clear=debtUnpaid.n===0n&&creditorRemaining.n===0n&&refundOutstanding.n===0n&&cash===0n;
 return {schema:'LQC_POLICY_V1_LEDGER_MODEL_RESULT',binding:bindings,sequence:(sequence-1n).toString(),cash:cash.toString(),debtors:debtorRows,creditors:creditorRows,uncollectedDebt:wire(debtUnpaid),creditorRemaining:wire(creditorRemaining),refundOutstanding:wire(refundOutstanding),aggregateCashReservation:wire(reserved),reservedRawCeil:ceil(reserved).toString(),modelStatus:clear?'MODEL_RECONCILED':'MODEL_OUTSTANDING',financialSettlementComplete:false,reportedReceiptsVerified:false,...NO_AUTHORITY};
}
function make(spec,events){
 const result=freeze(compute(spec,events));ledgers.set(result,{spec:freeze(structuredClone(spec)),events:freeze(structuredClone(events))});return result;
}
export function createPolicyV1Ledger(spec){return make(normalizeSpec(spec),[]);}
export function advancePolicyV1Ledger(previous,spec,events){
 assert(ledgers.has(previous),'LEDGER_CONTEXT_REQUIRED');const original=ledgers.get(previous),normalized=normalizeSpec(spec);
 assert.equal(hash(normalized),hash(original.spec),'LEDGER_SCOPE_OBLIGATION_OR_VERSION_CHANGED');dense(events,4096);assert(original.events.length+events.length<=4096,'LEDGER_HISTORY_BOUND');
 return make(normalized,[...original.events,...structuredClone(events)]);
}
export function recalculatePolicyV1Ledger(previous){
 assert(ledgers.has(previous),'LEDGER_CONTEXT_REQUIRED');const {spec,events}=ledgers.get(previous);return make(spec,events);
}
export function policyV1LedgerBinding(spec){return hash(normalizeSpec(spec));}
