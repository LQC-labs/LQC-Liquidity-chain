import {assert,record,dense,uint,hash32,hash,fraction,zero,add,subtract,wire,cmp} from './policy-v1-common.mjs';
// Local diagnostic identities, not authenticated event/ledger proofs or claim keys.
// A transaction may contain multiple log/item consumption units. Business Receipt
// and its group Sequence are bound payload; the physical unit is not group-dependent.
export function consumptionUnit(identity,scope){
 record(identity,['scopeCommitment','transactionHash','logIndex','itemIndex','businessReceipt','receiptSequence']);
 assert.equal(hash32(identity.scopeCommitment),hash(scope),'CONSUMPTION_IDENTITY_SCOPE');
 const transactionHash=hash32(identity.transactionHash);hash32(identity.businessReceipt);uint(identity.receiptSequence);
 return hash({scopeCommitment:identity.scopeCommitment,transactionHash,logIndex:uint(identity.logIndex).toString(),itemIndex:uint(identity.itemIndex).toString()});
}
export function validateConsumptionIdentity(identity,row,scope){
 const unit=consumptionUnit(identity,scope);
 assert.equal(hash32(identity.businessReceipt),hash32(row.receipt),'CONSUMPTION_BUSINESS_RECEIPT_LINK');
 assert.equal(identity.receiptSequence,row.sequence,'CONSUMPTION_RECEIPT_SEQUENCE_LINK');return unit;
}
export function ledgerEventRows(events){return events.map(({consumptionIdentity,...row})=>row);}
export function validateSharedCashEpochs(postings){dense(postings,4096);assert(postings.every(p=>p.phase==='OFFICIAL'&&p.epoch==='1'),'UNSUPPORTED_MULTI_EPOCH_CASH_ROUTING');}
export function validateSharedCashRouting(postings,parts,amount){
 validateSharedCashEpochs(postings);dense(parts,4096);
 assert(parts.length>0,'CASH_POSTING_OWNER_MISSING');
 if(parts.length>1){assert(parts.every(p=>fraction(p.amount).d===1n),'UNSUPPORTED_FRACTIONAL_MULTI_POSITION_CASH_ROUTING');assert.equal(parts.reduce((n,p)=>n+fraction(p.amount).n,0n),uint(amount),'POSITION_CASH_PARTITION_TARGET');}
}
function obligationKey(scope,p){return hash({kind:'LOCAL_DIAGNOSTIC_FUNDING_OBLIGATION',chainId:scope.chainId,domain:scope.domain,series:scope.series,token:scope.token,policyCommitment:scope.policyCommitment,account:p.account,pid:p.pid,phase:p.phase,epoch:p.epoch,period:p.period});}
export function reservationOwnerKey(row){return hash({account:row.account,pid:row.pid,obligationKey:row.obligationKey,token:row.token,right:row.right});}
export function reservationRights(scope,postings,rawPositions,model,entries){
 // No new shortage allocation or fractional multi-position rounding policy.
 assert(fraction(model.uncollectedDebt).n===0n,'OWNER_FUNDED_ALLOCATION_UNPROVEN');
 const rights=[];
 const append=(p,right,amount)=>{if(amount.n>0n)rights.push({account:p.account,pid:p.pid,obligationKey:obligationKey(scope,p),token:scope.token,right,amount:wire(amount)});};
 for(const p of rawPositions){
  const posting=postings.find(x=>x.pid===p.pid);assert(posting,'RESERVATION_POSITION_MISSING');
  const paid=entries.filter(e=>e.pid===p.pid&&e.operation==='PAY').reduce((n,e)=>n+uint(e.amount),0n);
  if(fraction(wire(p.claim)).n>0n)append(posting,'FUNDED_CLAIMS',subtract(p.claim,{n:paid,d:1n}));
 }
 for(const d of model.debtors){const refund=fraction(d.refundOutstanding);if(refund.n===0n)continue;const parts=rawPositions.filter(p=>p.account===d.account&&p.debt.n>0n);assert.equal(parts.length,1,'UNSUPPORTED_FRACTIONAL_MULTI_POSITION_CASH_ROUTING');append(postings.find(p=>p.pid===parts[0].pid),'OVERPAYMENT_REFUND',refund);}
 return rights;
}
export function checkReservationOwners(reservations,rights,token){
 const expected=new Map(rights.map(r=>[reservationOwnerKey(r),r])),used=new Map();
 for(const r of reservations){assert.equal(r.token,token,'RESERVATION_TOKEN_MISMATCH');hash32(r.obligationKey);const key=reservationOwnerKey(r);assert(expected.has(key),'RESERVATION_OWNER_OBLIGATION_MISMATCH');used.set(key,add(used.get(key)??zero(),subtract(fraction(r.to),fraction(r.from))));}
 for(const [key,r]of expected)assert.equal(cmp(used.get(key)??zero(),fraction(r.amount)),0n,'RESERVATION_OWNER_RIGHT_BALANCE');
}
