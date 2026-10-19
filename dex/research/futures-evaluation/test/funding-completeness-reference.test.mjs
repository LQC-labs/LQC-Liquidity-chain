
import assert from 'node:assert/strict';
import {evaluateDiagnostics,CALCULATION_VERSION,integrateHistory} from '../lib/exit-diagnostic-evaluator.mjs';
import {rawTransitionIntegrals,assertIndependentExposure} from '../lib/independent-exposure-reference.mjs';
import {evaluationIdFor} from '../lib/evaluation-identity.mjs';
const W=10n**18n,H=x=>'0x'+x.repeat(64),cases=[],test=(name,fn)=>cases.push({name,fn});
function fixture(side='LONG',partial='199',end='200'){
 const isLong=side==='LONG',q=(7n*W).toString(),left=(5n*W).toString(),base={pid:'1'};
 const transition=(sequence,timestamp,old,next,receipt)=>({...base,sequence,timestamp,oldL:isLong?old:'0',oldS:isLong?'0':old,nextL:isLong?next:'0',nextS:isLong?'0':next,receipt});
 return {schema:'LQC_PURE_EXIT_DIAGNOSTIC_INPUT_V1',source:{kind:'SYNTHETIC_TEST_ONLY',semanticCommitment:H('1'),scope:{chainId:'31337',account:'0x0000000000000000000000000000000000000001',domain:'2',series:'1',pid:'1'}},
 units:{quantity:'USD18_NOTIONAL',marketPrice:'FIXED_18',collateralPrice:'FIXED_18',collateralDecimals:'6'},
 position:{side,entryPrice18:(3n*W).toString(),initialQuantity18:q},cutoff:'200',officialEpochs:[{epoch:'1',from:'100',to:'200'}],
 transitions:[transition('1','100','0',q,H('2')),transition('2',partial,q,left,H('3')),transition('3',end,left,'0',H('4'))],
 prices:[{sequence:'2',market18:(4n*W).toString(),collateral18:(7n*W).toString(),marketTime:partial,collateralTime:partial,provenance:'SYNTHETIC_TEST_ONLY',reference:H('5')},{sequence:'3',market18:(2n*W).toString(),collateral18:(11n*W).toString(),marketTime:end,collateralTime:end,provenance:'SYNTHETIC_TEST_ONLY',reference:H('6')}],
 policies:{calculation:{provenance:'SYNTHETIC_TEST_ONLY',reference:H('7')},freshness:null,fundingAllocation:null,gap:null,integerization:null,dust:null},funding:null,observedIntegrals:null,submittedIntervals:null};
}

const obligation=(epoch,n='10')=>({obligationId:H(epoch==='1'?'a':'b'),epoch,debtUsd18:{n,d:'1'},claimUsd18:{n:'0',d:'1'}});
function funded2(){
 const x=fixture();x.officialEpochs=[{epoch:'1',from:'100',to:'150'},{epoch:'2',from:'150',to:'200'}];
 x.policies.fundingAllocation={provenance:'SYNTHETIC_TEST_ONLY',reference:H('8')};
 x.funding={kind:'SYNTHETIC_TEST_ONLY',reference:H('9'),obligations:[obligation('1'),obligation('2')],allocations:null};return x;
}
const allocate=(o,seq='3')=>({obligationId:o.obligationId,exitSequence:seq,debtUsd18:structuredClone(o.debtUsd18),claimUsd18:structuredClone(o.claimUsd18)});
test('missing funding evidence stays unknown not zero',()=>{
 const r=evaluateDiagnostics(fixture()),f=r.diagnostics.fundingEvidence;
 assert.equal(f.evidenceCompleteness,'MISSING');assert.equal(f.allocationStatus,'MISSING');assert.equal(f.totalDebt,null);assert.equal(f.submittedSubtotal,null);assert.equal(r.diagnostics.officialFunding,null);
});
test('empty submitted obligation list cannot define required epochs',()=>{
 const x=funded2();x.funding.obligations=[];const r=evaluateDiagnostics(x),f=r.diagnostics.officialFunding;
 assert.equal(f.evidenceCompleteness,'MISSING');assert.deepEqual(f.requiredEpochs,['1','2']);assert.deepEqual(f.missingEpochs,['1','2']);assert.equal(f.totalDebt,null);assert.deepEqual(f.submittedSubtotal.debt,{n:'0',d:'1'});assert(r.blockers.includes('OFFICIAL_FUNDING_OBLIGATIONS_MISSING:1'));
});
test('missing epoch is PARTIAL with subtotal and null whole total',()=>{
 const x=funded2();x.funding.obligations.pop();const r=evaluateDiagnostics(x),f=r.diagnostics.officialFunding;
 assert.equal(f.evidenceCompleteness,'PARTIAL');assert.deepEqual(f.missingEpochs,['2']);assert.equal(f.totalDebt,null);assert.equal(f.totalClaim,null);assert.deepEqual(f.submittedSubtotal.debt,{n:'10',d:'1'});assert(r.blockers.includes('OFFICIAL_FUNDING_OBLIGATIONS_MISSING:2'));
});
test('full submitted allocation cannot complete missing obligation evidence',()=>{
 const x=funded2();x.funding.obligations.pop();x.funding.allocations=x.funding.obligations.map(o=>allocate(o));const f=evaluateDiagnostics(x).diagnostics.officialFunding;
 assert.equal(f.evidenceCompleteness,'PARTIAL');assert.equal(f.allocationStatus,'PARTIAL');assert.equal(f.totalDebt,null);
});
test('unexpected official epoch without held exposure is rejected',()=>{
 const x=funded2();x.transitions[0].timestamp='160';x.funding.obligations=[obligation('1')];
 assert.throws(()=>evaluateDiagnostics(x),/FUNDING_UNEXPECTED_EPOCH/);
});
test('epoch outside official range is rejected separately',()=>{
 const x=funded2();x.funding.obligations=[obligation('3')];assert.throws(()=>evaluateDiagnostics(x),/FUNDING_EPOCH_OUTSIDE_OFFICIAL/);
});
test('complete evidence of zero differs from absent evidence',()=>{
 const x=funded2();x.funding.obligations=x.funding.obligations.map(o=>({...o,debtUsd18:{n:'0',d:'1'}}));x.funding.allocations=[];
 const r=evaluateDiagnostics(x),f=r.diagnostics.officialFunding;
 assert.equal(f.evidenceCompleteness,'COMPLETE');assert.equal(f.allocationStatus,'COMPLETE');assert.deepEqual(f.totalDebt,{n:'0',d:'1'});assert.equal(r.confirmedAmount,null);assert.equal(r.evaluationStatus,'NOT_EVALUATED');
});
test('required epochs derive from actual lifetime not entire series',()=>{
 const x=funded2();x.transitions[0].timestamp='160';x.funding.obligations=[obligation('2')];
 const f=evaluateDiagnostics(x).diagnostics.officialFunding;assert.deepEqual(f.requiredEpochs,['2']);assert.equal(f.evidenceCompleteness,'COMPLETE');
});
test('complete obligations can have MISSING allocation evidence',()=>{
 const f=evaluateDiagnostics(funded2()).diagnostics.officialFunding;
 assert.equal(f.evidenceCompleteness,'COMPLETE');assert.equal(f.allocationStatus,'MISSING');assert.deepEqual(f.totalDebt,{n:'20',d:'1'});
});
test('complete obligations can have PARTIAL rational allocation',()=>{
 const x=funded2();x.funding.allocations=[{...allocate(x.funding.obligations[0]),debtUsd18:{n:'1',d:'3'}}];
 const f=evaluateDiagnostics(x).diagnostics.officialFunding;assert.equal(f.evidenceCompleteness,'COMPLETE');assert.equal(f.allocationStatus,'PARTIAL');assert.deepEqual(f.obligations[0].unallocatedDebt,{n:'29',d:'3'});
});
test('fully allocated complete evidence still grants no financial rights',()=>{
 const x=funded2();x.funding.allocations=x.funding.obligations.map(o=>allocate(o));
 const r=evaluateDiagnostics(x);assert.equal(r.diagnostics.officialFunding.allocationStatus,'COMPLETE');assert.equal(r.evaluationStatus,'NOT_EVALUATED');
 for(const k of ['fundsAuthority','settlementAuthorized','createsClaim','consumesHistory'])assert.equal(r[k],false);
 assert.equal(r.confirmedAmount,null);assert.equal(r.monetaryResult,null);assert(r.blockers.includes('FUNDING_ATTRIBUTION_POLICY_NOT_APPROVED'));
});
for(const side of ['LONG','SHORT'])for(const [partial,end,official,gap]of [['198','199',691n,0n],['199','200',698n,0n],['199','201',698n,5n],['200','201',700n,5n],['201','202',700n,12n]]){
 test('independent raw '+side+' partial '+partial+' final '+end,()=>{
  const x=fixture(side,partial,end),r=evaluateDiagnostics(x).diagnostics.exposure,key=side==='LONG'?'long':'short',other=key==='long'?'short':'long';
  assert.equal(r.rawTransitionIntegrals.official[key],(official*W).toString());assert.equal(r.rawTransitionIntegrals.gap[key],(gap*W).toString());assert.equal(r.rawTransitionIntegrals.official[other],'0');assert.deepEqual(r.rawTransitionIntegrals,r.integrals);
 });
}
test('independent reference handles opening inside epoch and multiple epochs',()=>{
 const x=funded2();x.transitions[0].timestamp='120';const r=evaluateDiagnostics(x).diagnostics.exposure;
 assert.equal(r.rawTransitionIntegrals.official.long,(558n*W).toString());assert.deepEqual(r.rawTransitionIntegrals,r.integrals);
});
test('one wrong primary derivation is detected against untouched raw reference',()=>{
 const x=fixture(),primary=structuredClone(integrateHistory(x).integrals),ref=rawTransitionIntegrals(x);
 primary.official.long=(BigInt(primary.official.long)+1n).toString();assert.throws(()=>assertIndependentExposure(primary,ref),/RAW_TRANSITION_INTEGRAL_MISMATCH/);
});
test('one wrong reference derivation is detected against untouched primary',()=>{
 const x=fixture(),primary=integrateHistory(x).integrals,ref=rawTransitionIntegrals(x);
 ref.gap.short='1';assert.throws(()=>assertIndependentExposure(primary,ref),/RAW_TRANSITION_INTEGRAL_MISMATCH/);
});
test('calculation version change alone directly changes evaluation ID',()=>{
 const x=fixture();assert.notEqual(evaluationIdFor(x,CALCULATION_VERSION),evaluationIdFor(x,'LQC_PURE_EXIT_DIAGNOSTICS_VERSION_CHANGE_TEST'));
 assert.equal(evaluateDiagnostics(x).evaluationId,evaluationIdFor(x,CALCULATION_VERSION));
});
describe('task 2/53 completeness and independent reference',()=>{for(const {name,fn}of cases)it(name,fn);});
export const plannedNames=cases.map(c=>'task 2/53 completeness and independent reference '+c.name);
