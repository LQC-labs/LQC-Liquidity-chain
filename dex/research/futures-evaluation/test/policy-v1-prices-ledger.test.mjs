
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadPolicyV1ResearchCase,policyV1Source} from '../lib/policy-v1-source.mjs';
import {evaluatePolicyV1,diagnosePolicyV1CollateralReturn,diagnoseRecordedCandidateForPolicyV1,createPolicyV1FundingLedger} from '../lib/policy-v1-evaluator.mjs';
import {createPolicyV1Ledger,advancePolicyV1Ledger,recalculatePolicyV1Ledger,policyV1LedgerBinding} from '../lib/policy-v1-ledger.mjs';
import {hash,NO_AUTHORITY} from '../lib/policy-v1-common.mjs';
const cases=[],test=(name,fn)=>cases.push({name,fn}),load=name=>loadPolicyV1ResearchCase(name);
for(const [fixture,reason]of [['stale','PRICE_STALE'],['lateCommit','PRICE_POST_BOUNDARY_COMMITMENT'],['scopeMix','PRICE_SCOPE_MIX'],['futurePrice','PRICE_AFTER_BOUNDARY'],['finalityMissing','FINALITY_DEPTH_INSUFFICIENT'],['pastStateMissing','PAST_STATE_EVIDENCE_MISSING'],['deviation','PRICE_DEVIATION'],['confidence','PRICE_CONFIDENCE'],['normalizationLoss','PRICE_NORMALIZATION_LOSS'],['priceAbiRange','PRICE_ABI_RANGE'],['badScheduledSuccessor','BOUNDARY_SUCCESSOR_MISSING'],['wrongBoundaryEvent','BOUNDARY_FIRST_EVENT_REQUIRED']]){
 test('history sealed but money null for '+reason,()=>{const {context,request}=load(fixture),r=evaluatePolicyV1(context,request);assert.equal(r.history.historySeal,'SEALED_SYNTHETIC_RESEARCH_ONLY');assert.equal(r.diagnosticAmounts,null);assert.equal(r.confirmedAmount,null);assert(r.blockers.some(b=>b.startsWith(reason+':')),JSON.stringify(r.blockers));});
}
test('missing price does not use a fallback or zero',()=>{const {context,request}=load('partial');request.priceSelections.pop();const r=evaluatePolicyV1(context,request);assert.equal(r.diagnosticAmounts,null);assert(r.blockers.some(b=>b.startsWith('PRICE_EVIDENCE_MISSING:')));});
test('another valid older report cannot replace fixed selection',()=>{
 const {context,request}=load('partial');request.priceSelections[0].primaryMarket=policyV1Source(context).alternativeReportId;const r=evaluatePolicyV1(context,request);assert.equal(r.diagnosticAmounts,null);assert(r.blockers.some(b=>b.startsWith('PRICE_SELECTION_REPLACEMENT:')));
});
test('approved true does not make price evidence acceptable',()=>{const {context,request}=load('partial');request.priceSelections[0].approved=true;assert.throws(()=>evaluatePolicyV1(context,request),/ADDITIONAL_FIELD/);});
test('synthetic complete price data never authenticates chain or grants authority',()=>{
 const {context,request}=load('partial'),r=evaluatePolicyV1(context,request);assert(r.diagnosticAmounts);assert.equal(r.evaluationStatus,'NOT_EVALUATED');assert.equal(r.confirmedAmount,null);assert.equal(r.monetaryResult,null);assert.equal(r.activationAllowed,false);assert(r.blockers.includes('INDEPENDENT_CHAIN_PROOF_UNAVAILABLE'));
 for(const k of Object.keys(NO_AUTHORITY))assert.equal(r[k],false);assert.equal(r.history.independentChainProof,false);
});
test('exit-specific PnL and collateral use exact fractions without netting',()=>{
 const {context,request}=load('pnl'),r=evaluatePolicyV1(context,request),p=r.diagnosticAmounts.pnl.filter(p=>p.pid==='1');
 assert.deepEqual(p.map(x=>x.usd18),[{n:(10n*10n**18n).toString(),d:'1'},{n:(-20n*10n**18n).toString(),d:'1'}]);assert.deepEqual(p.map(x=>x.raw),[{n:'10000000',d:'1'},{n:'-20000000',d:'1'}]);
});
test('Funding ledger aggregates verified complete Series before rounding',()=>{
 const {context,request}=load('partial'),r=evaluatePolicyV1(context,request),s=createPolicyV1FundingLedger(context,request);
 assert.deepEqual(s.debtors[0].principal,{n:'12500',d:'3'});assert.deepEqual(s.creditors[0].principal,{n:'12500',d:'3'});assert.equal(s.reportedReceiptsVerified,false);assert.equal(s.fundsAuthority,false);
});
test('incomplete price proof cannot create even a converted Funding ledger model',()=>{
 const {context,request}=load('stale');assert.throws(()=>createPolicyV1FundingLedger(context,request),/CONVERTED_MODEL_UNAVAILABLE/);
});
const account=n=>'0x'+BigInt(n).toString(16).padStart(40,'0');
function spec(){return {schema:'LQC_POLICY_V1_LEDGER_MODEL',scope:{chainId:'31337',domain:'101',series:'201',token:account(13),decimals:'6'},policyVersion:'LQC_SETTLEMENT_POLICY_V1',calculationVersion:'LQC_POLICY_V1_RESEARCH_CALCULATOR_1',policyCommitment:'0x'+'a'.repeat(64),obligationId:'0x'+'b'.repeat(64),obligationKind:'FUNDING',debtors:[{account:account(101),amount:{n:'7',d:'5'}}],creditors:[{account:account(102),amount:{n:'7',d:'5'}}]};}
const event=(s,sequence,kind,amount='1',id='event:'+sequence)=>({id:hash(id),sequence:String(sequence),kind,account:kind==='PAY'?s.creditors[0].account:s.debtors[0].account,amount,binding:policyV1LedgerBinding(s),provenance:'SYNTHETIC_RECEIPT_MODEL_NOT_VERIFIED_CASH'});
test('1.4 raw partial collection keeps unpaid 0.4 and no invented cash',()=>{
 const s=spec(),r=advancePolicyV1Ledger(createPolicyV1Ledger(s),s,[event(s,1,'COLLECT')]);
 assert.equal(r.cash,'1');assert.deepEqual(r.uncollectedDebt,{n:'2',d:'5'});assert.deepEqual(r.refundOutstanding,{n:'0',d:'1'});assert.equal(r.debtors[0].collectionTarget,'2');
});
test('partial collection and payment conserve receivable rather than cash',()=>{
 const s=spec(),r=advancePolicyV1Ledger(createPolicyV1Ledger(s),s,[event(s,1,'COLLECT'),event(s,2,'PAY')]);
 assert.equal(r.cash,'0');assert.deepEqual(r.uncollectedDebt,{n:'2',d:'5'});assert.deepEqual(r.creditorRemaining,{n:'2',d:'5'});assert.equal(r.reservedRawCeil,'0');
});
test('full collection after partial payment preserves 0.4 and 0.6 backed by one raw',()=>{
 const s=spec(),partial=advancePolicyV1Ledger(createPolicyV1Ledger(s),s,[event(s,1,'COLLECT'),event(s,2,'PAY')]),r=advancePolicyV1Ledger(partial,s,[event(s,3,'COLLECT')]);
 assert.equal(r.cash,'1');assert.deepEqual(r.uncollectedDebt,{n:'0',d:'1'});assert.deepEqual(r.creditorRemaining,{n:'2',d:'5'});assert.deepEqual(r.refundOutstanding,{n:'3',d:'5'});assert.equal(r.reservedRawCeil,'1');assert.equal(r.modelStatus,'MODEL_OUTSTANDING');assert.equal(r.financialSettlementComplete,false);
});
test('collect 2 pay 1 yields identical principal and residual accounting',()=>{
 const s=spec(),r=advancePolicyV1Ledger(createPolicyV1Ledger(s),s,[event(s,1,'COLLECT','2'),event(s,2,'PAY')]);
 assert.equal(r.cash,'1');assert.deepEqual(r.debtors[0].principalApplied,{n:'7',d:'5'});assert.deepEqual(r.debtors[0].overpaymentCreated,{n:'3',d:'5'});assert.equal(r.reservedRawCeil,'1');
});
test('two one-raw withdrawals cannot erase fractional ownership',()=>{
 const s=spec(),r=advancePolicyV1Ledger(createPolicyV1Ledger(s),s,[event(s,1,'COLLECT','2'),event(s,2,'PAY')]);
 assert.throws(()=>advancePolicyV1Ledger(r,s,[event(s,3,'PAY')]),/PAYOUT_EXCEEDS_FLOOR/);assert.throws(()=>advancePolicyV1Ledger(r,s,[event(s,3,'REFUND')]),/REFUND_EXCEEDS_OWN_EXCESS/);assert.equal(r.cash,'1');
});
test('over collection is rejected without altering previous state',()=>{
 const s=spec(),r=createPolicyV1Ledger(s);assert.throws(()=>advancePolicyV1Ledger(r,s,[event(s,1,'COLLECT','3')]),/COLLECTION_EXCEEDS_CEILING/);assert.equal(r.cash,'0');
});
test('unfunded payment is rejected at actual model cash check',()=>{const s=spec();assert.throws(()=>advancePolicyV1Ledger(createPolicyV1Ledger(s),s,[event(s,1,'PAY')]),/UNFUNDED_PAYOUT/);});
test('cumulative recalculation does not recollect or repay',()=>{
 const s=spec(),r=advancePolicyV1Ledger(createPolicyV1Ledger(s),s,[event(s,1,'COLLECT','2'),event(s,2,'PAY')]);assert.deepEqual(recalculatePolicyV1Ledger(r),r);
});
test('duplicate modeled receipt is rejected across updates',()=>{
 const s=spec(),e=event(s,1,'COLLECT'),r=advancePolicyV1Ledger(createPolicyV1Ledger(s),s,[e]);assert.throws(()=>advancePolicyV1Ledger(r,s,[{...e,sequence:'2'}]),/LEDGER_RECONSUMPTION/);
});
test('backward receipt sequence is rejected',()=>{const s=spec(),r=advancePolicyV1Ledger(createPolicyV1Ledger(s),s,[event(s,1,'COLLECT')]);assert.throws(()=>advancePolicyV1Ledger(r,s,[event(s,1,'COLLECT','1','new-receipt-with-backward-sequence')]),/LEDGER_SEQUENCE/);});
test('obligation or scope cannot change on existing ledger',()=>{
 const s=spec(),r=createPolicyV1Ledger(s),other=structuredClone(s);other.scope.series='999';assert.throws(()=>advancePolicyV1Ledger(r,other,[]),/LEDGER_SCOPE_OBLIGATION_OR_VERSION_CHANGED/);
});
test('calculation version change cannot reuse ledger consumption',()=>{const s=spec(),r=createPolicyV1Ledger(s),other=structuredClone(s);other.calculationVersion='LQC_POLICY_V1_RESEARCH_CALCULATOR_2';assert.throws(()=>advancePolicyV1Ledger(r,other,[]),/LEDGER_CALCULATION_VERSION/);});
test('ledger token binding cannot be changed in a receipt',()=>{const s=spec(),e=event(s,1,'COLLECT');e.binding='0x'+'c'.repeat(64);assert.throws(()=>advancePolicyV1Ledger(createPolicyV1Ledger(s),s,[e]),/LEDGER_EVENT_SCOPE_OR_VERSION/);});
test('serialized summary is not an authenticated mutable ledger',()=>{const s=spec(),r=createPolicyV1Ledger(s);assert.throws(()=>advancePolicyV1Ledger(structuredClone(r),s,[]),/LEDGER_CONTEXT_REQUIRED/);});
test('multi creditor shortage payout blocks absent approved allocation',()=>{
 const s=spec();s.debtors[0].amount={n:'14',d:'5'};s.creditors.push({account:account(103),amount:{n:'7',d:'5'}});
 const r=advancePolicyV1Ledger(createPolicyV1Ledger(s),s,[event(s,1,'COLLECT')]);assert.throws(()=>advancePolicyV1Ledger(r,s,[event(s,2,'PAY')]),/SHARED_SHORTAGE_ALLOCATION_UNPROVEN/);
});
test('integer complete model still grants no actual settlement rights',()=>{
 const s=spec();s.debtors[0].amount={n:'3',d:'1'};s.creditors[0].amount={n:'3',d:'1'};const r=advancePolicyV1Ledger(createPolicyV1Ledger(s),s,[event(s,1,'COLLECT','3'),event(s,2,'PAY','3')]);assert.equal(r.modelStatus,'MODEL_RECONCILED');for(const k of Object.keys(NO_AUTHORITY))assert.equal(r[k],false);assert.equal(r.financialSettlementComplete,false);
});
function returnRequest(request){return {scope:structuredClone(request.config.scope),account:request.history.inventory[0].account,pid:request.history.inventory[0].pid,policyCommitment:hash(request.config),historyCommitment:request.history.commitment,independenceEvidenceId:'INDEPENDENCE',reserveBoundEvidenceId:'RESERVE'};}
test('missing independence or reserve proof gives unknown return not zero',()=>{const {context,request}=load('partial'),r=diagnosePolicyV1CollateralReturn(context,returnRequest(request));assert.equal(r.returnAmount,null);assert.equal(r.diagnosticReturnRaw,null);assert(r.blockers.includes('SHARED_INDEPENDENCE_OR_RESERVE_BOUND_MISSING'));});
test('synthetic reserve diagnosis retains own debt without spending Held',()=>{
 const {context,request}=load('longOpen'),r=diagnosePolicyV1CollateralReturn(context,returnRequest(request));assert.equal(r.diagnosticReturnRaw,'9994000');assert.equal(r.diagnosticReservedRaw,'6000');assert.equal(r.returnAmount,null);assert.equal(r.returnAuthorized,false);assert.equal(r.heldUseAuthorized,false);
});
test('return proof cannot be mixed across scope',()=>{const {context,request}=load('longOpen'),p=returnRequest(request);p.scope.series='999';assert.throws(()=>diagnosePolicyV1CollateralReturn(context,p),/RETURN_SCOPE/);});
test('return proof is bound to account and position',()=>{const {context,request}=load('longOpen'),p=returnRequest(request);p.account=account(999);assert.throws(()=>diagnosePolicyV1CollateralReturn(context,p),/RETURN_ACCOUNT/);});
let actual;
test('actual legacy candidate remains blocked without applying V1 to its Series',()=>{
 actual=diagnoseRecordedCandidateForPolicyV1();assert.equal(actual.prior.result.calculationVersion,'LQC_PURE_EXIT_DIAGNOSTICS_V2');assert.equal(actual.economicPolicy,'LQC_SETTLEMENT_POLICY_V1');assert.equal(actual.policyV1Amounts,null);assert.equal(actual.confirmedAmount,null);assert.equal(actual.monetaryResult,null);
 assert(actual.blockers.includes('EXISTING_SERIES_NOT_APPROVED_POLICY_V1'));assert(actual.blockers.includes('PRICE_APPROVAL_EVIDENCE_MISSING'));assert(actual.blockers.includes('OFFICIAL_FUNDING_UNFINALIZED'));
 for(const k of Object.keys(NO_AUTHORITY))assert.equal(actual[k],false);
});

test('sub raw amounts are aggregated per account not ceiled per segment',()=>{
 const {context,request}=load('roundAggregation'),s=createPolicyV1FundingLedger(context,request);
 assert.deepEqual(s.debtors[0].principal,{n:'1',d:'240'});assert.equal(s.debtors[0].collectionTarget,'1');
});
test('open Series cannot freeze its incomplete cumulative collection principal',()=>{
 const {context,request}=load('longOpen');assert.throws(()=>createPolicyV1FundingLedger(context,request),/OPEN_SERIES_PRINCIPAL_NOT_FINAL/);
});

describe('policy V1 prices residual ledger and return diagnosis',()=>{for(const {name,fn}of cases)it(name,fn);});
if(typeof after==='function')after(()=>{if(actual&&process.env.LQC58_OUTPUT_DIR)fs.writeFileSync(process.env.LQC58_OUTPUT_DIR+'/actual-policy-v1-candidate.json',JSON.stringify(actual,null,2));});
export const plannedNames=cases.map(c=>'policy V1 prices residual ledger and return diagnosis '+c.name);
