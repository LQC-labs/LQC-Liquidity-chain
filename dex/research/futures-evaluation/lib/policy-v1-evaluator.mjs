import {createPolicyV1Ledger} from './policy-v1-ledger.mjs';

import {assert,record,uint,hash,zero,add,subtract,multiply,rational,wire,ceil,fraction,eq,NO_AUTHORITY,ECONOMIC_POLICY_VERSION,POLICY_CALCULATION_VERSION} from './policy-v1-common.mjs';
import {pnlDiagnostic} from './exact-rational.mjs';
import {validatePolicyV1Config} from './policy-v1-config.mjs';
import {policyV1Source} from './policy-v1-source.mjs';
import {buildPolicyV1Segments} from './policy-v1-segments.mjs';
import {verifyPolicyV1Prices} from './policy-v1-price-evidence.mjs';
import {diagnoseRecordedEvidenceForPolicyV1} from './policy-v1-recorded-evidence.mjs';
export function evaluatePolicyV1(context,request){
 const configuration=validatePolicyV1Config(request.config);
 const base={schema:'LQC_POLICY_V1_RESEARCH_RESULT',economicPolicy:ECONOMIC_POLICY_VERSION,calculationVersion:POLICY_CALCULATION_VERSION,evaluationStatus:'NOT_EVALUATED',amountSeal:'BLOCKED_NO_INDEPENDENT_PROOF',confirmedAmount:null,monetaryResult:null,settlementComplete:false,activationAllowed:false,...NO_AUTHORITY};
 if(configuration.state==='UNCONFIGURED')return {...base,configuration,history:null,diagnosticAmounts:null,blockers:configuration.blockers};
 const history=buildPolicyV1Segments(context,request);
 const keys=[...history.segments.map(s=>'BOUNDARY:'+s.to)];
 for(const p of request.history.inventory)keys.push('ENTRY:'+p.pid);
 for(const r of request.history.records)if(r.sequence!=='1')keys.push('EXIT:'+r.pid+':'+r.sequence);
 const required=[...new Set(keys)],prices=verifyPolicyV1Prices(context,request,required);
 const blockers=[...configuration.blockers,...prices.proofBlockers,'LOCAL_SYNTHETIC_SOURCE_NOT_CHAIN_AUTHENTICITY',...prices.blockers];
 let diagnosticAmounts=null;
 if(prices.blockers.length===0){
  const funding=[];
  for(const s of history.segments){
   const price=prices.valid.get('BOUNDARY:'+s.to),scale=rational(10n**uint(request.config.scope.decimals),uint(price.collateral));
   let debt=zero(),claim=zero();const positions=s.positions.map(p=>{
    const d=multiply(rational(BigInt(p.debtUsd18.n),BigInt(p.debtUsd18.d)),scale),c=multiply(rational(BigInt(p.claimUsd18.n),BigInt(p.claimUsd18.d)),scale);
    debt=add(debt,d);claim=add(claim,c);return {pid:p.pid,account:p.account,debtRaw:wire(d),claimRaw:wire(c)};
   });
   eq(wire(debt),wire(claim),'CONVERTED_FUNDING_CONSERVATION');
   funding.push({segmentId:s.id,priceAnchor:price.anchorId,positions,totalDebtRaw:wire(debt),totalClaimRaw:wire(claim)});
  }
  const pnl=[];
  for(const r of request.history.records)if(r.sequence!=='1'){
   const p=request.history.inventory.find(p=>p.pid===r.pid),entry=prices.valid.get('ENTRY:'+p.pid),exit=prices.valid.get('EXIT:'+p.pid+':'+r.sequence);
   assert.equal(entry.market,p.entryPrice18,'ENTRY_PRICE_BASIS_MISMATCH');
   const value=pnlDiagnostic({quantity18:uint(r.oldQty)-uint(r.nextQty),side:p.side,entry18:p.entryPrice18,market18:exit.market,collateral18:exit.collateral,decimals:request.config.scope.decimals,quantityUnit:'USD18_NOTIONAL',priceUnit:'FIXED_18'});
   pnl.push({pid:p.pid,sequence:r.sequence,usd18:wire(value.usd18),raw:wire(value.rawToken),priceAnchor:exit.anchorId});
  }
  diagnosticAmounts={provenance:'SYNTHETIC_TEST_ONLY_NOT_FINANCIALLY_CONFIRMED',funding,pnl};
 }
 return {...base,configuration,history,diagnosticAmounts,evaluationId:hash({domain:'LQC_POLICY_V1_EVALUATION',economicPolicy:ECONOMIC_POLICY_VERSION,calculationVersion:POLICY_CALCULATION_VERSION,sourceEvidenceCommitment:hash(policyV1Source(context)),request}),blockers:[...new Set(blockers)]};
}
export function diagnosePolicyV1CollateralReturn(context,request){
 record(request,['scope','account','pid','policyCommitment','historyCommitment','independenceEvidenceId','reserveBoundEvidenceId']);
 const source=policyV1Source(context);
 const base={returnAmount:null,diagnosticReturnRaw:null,returnState:'UNDETERMINED',...NO_AUTHORITY,blockers:['NO_INDEPENDENT_CHAIN_OR_RETURN_AUTHORIZATION']};
 const a=source.returnProofs?.[request.independenceEvidenceId],b=source.returnProofs?.[request.reserveBoundEvidenceId];
 if(!a||!b)return {...base,blockers:[...base.blockers,'SHARED_INDEPENDENCE_OR_RESERVE_BOUND_MISSING']};
 assert.equal(a.kind,'SYNTHETIC_RESEARCH_RECONCILIATION','UNSUPPORTED_INDEPENDENCE_PROOF');assert.equal(b.kind,a.kind,'UNSUPPORTED_RESERVE_PROOF');
 for(const proof of [a,b]){assert.equal(proof.account,request.account,'RETURN_ACCOUNT');assert.equal(proof.pid,request.pid,'RETURN_POSITION');eq(proof.scope,request.scope,'RETURN_SCOPE');assert.equal(proof.policyCommitment,request.policyCommitment,'RETURN_POLICY');assert.equal(proof.historyCommitment,request.historyCommitment,'RETURN_HISTORY');}

const position=source.request.history.inventory.find(p=>p.pid===request.pid);assert(position&&position.account===request.account,'RETURN_OWNER_BINDING');
const evaluation=evaluatePolicyV1(context,source.request);
if(!evaluation.diagnosticAmounts)return {...base,blockers:[...base.blockers,'RETURN_PRICE_OR_OBLIGATION_EVIDENCE_MISSING']};
let ownFunding=zero();for(const segment of evaluation.diagnosticAmounts.funding)for(const p of segment.positions)if(p.pid===request.pid)ownFunding=add(ownFunding,fraction(p.debtRaw));
eq(a.principalAlreadyAppliedRaw,b.principalAlreadyAppliedRaw,'RETURN_CONSUMPTION_PROOF');const applied=fraction(a.principalAlreadyAppliedRaw),unpaid=subtract(ownFunding,applied);assert(unpaid.n>=0n,'RETURN_APPLIED_EXCEEDS_OWN_DEBT');
eq(wire(unpaid),wire(fraction(a.amounts.ownUnpaidRaw)),'RETURN_OWN_FUNDING_RECONCILIATION');
eq(a.amounts,b.amounts,'RETURN_PROOF_RECONCILIATION');record(a.amounts,['heldRaw','ownUnpaidRaw','otherOwnRaw','sharedProtectionRaw']);
 const held=uint(a.amounts.heldRaw),reserve=ceil(add(add(fraction(a.amounts.ownUnpaidRaw),fraction(a.amounts.otherOwnRaw)),fraction(a.amounts.sharedProtectionRaw)));
 if(reserve>held)return {...base,blockers:[...base.blockers,'INSUFFICIENT_OWN_COLLATERAL_FOR_PROVEN_RESERVE']};
 return {...base,returnState:'SYNTHETIC_DIAGNOSTIC_ONLY',diagnosticReturnRaw:(held-reserve).toString(),diagnosticReservedRaw:reserve.toString()};
}
export function diagnoseRecordedCandidateForPolicyV1(...args){
 return diagnoseRecordedEvidenceForPolicyV1(...args);
}


export function createPolicyV1FundingLedger(context,request){
 assert(arguments.length===2,'COMPLETE_SERIES_MODEL_ONLY');
 const result=evaluatePolicyV1(context,request);assert(result.diagnosticAmounts,'CONVERTED_MODEL_UNAVAILABLE');
 assert(result.history.openPositions.length===0&&result.history.pendingTail===null,'OPEN_SERIES_PRINCIPAL_NOT_FINAL');
 const aggregate=kind=>{
  const amounts=new Map();
  for(const segment of result.diagnosticAmounts.funding)for(const p of segment.positions){
   const amount=p[kind];if(BigInt(amount.n)===0n)continue;
   amounts.set(p.account,add(amounts.get(p.account)??zero(),rational(BigInt(amount.n),BigInt(amount.d))));
  }
  return [...amounts].map(([account,amount])=>({account,amount:wire(amount)}));
 };
 const c=request.config,debtors=aggregate('debtRaw'),creditors=aggregate('claimRaw');assert(debtors.length&&creditors.length,'ZERO_FUNDING_NO_CASH_MODEL_NEEDED');
 return createPolicyV1Ledger({schema:'LQC_POLICY_V1_LEDGER_MODEL',scope:{chainId:c.scope.chainId,domain:c.scope.domain,series:c.scope.series,token:c.scope.token,decimals:c.scope.decimals},policyVersion:ECONOMIC_POLICY_VERSION,calculationVersion:POLICY_CALCULATION_VERSION,policyCommitment:result.configuration.policyCommitment,obligationId:hash({source:result.history.sourceCommitment,kind:'FUNDING',policy:result.configuration.policyCommitment}),obligationKind:'FUNDING',debtors,creditors});
}
