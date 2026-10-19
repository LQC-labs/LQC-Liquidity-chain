
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {rational,wire,pnlDiagnostic} from '../lib/exact-rational.mjs';
import {evaluateDiagnostics,CALCULATION_VERSION} from '../lib/exit-diagnostic-evaluator.mjs';
import {evaluateVerifiedLocalCandidate} from '../lib/verified-diagnostic-input.mjs';
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
const equalFraction=(f,n,d)=>{assert.equal(BigInt(f.n)*d,n*BigInt(f.d));assert(BigInt(f.d)>0n);};
test('fraction sign and gcd normalize exactly',()=>assert.deepEqual(wire(rational(-6n,-8n)),{n:'3',d:'4'}));
test('zero has one canonical representation',()=>assert.deepEqual(wire(rational(0n,-99n)),{n:'0',d:'1'}));
test('zero denominator is rejected',()=>assert.throws(()=>rational(1n,0n),/ZERO_DENOMINATOR/));
test('Number is rejected at rational arithmetic boundary',()=>assert.throws(()=>rational(1,2n),/INTEGER_STRING_OR_BIGINT_REQUIRED/));
for(const [side,exit,sign]of [['LONG',110n,1n],['LONG',90n,-1n],['LONG',100n,0n],['SHORT',90n,1n],['SHORT',110n,-1n],['SHORT',100n,0n]])test('synthetic '+side+' exit '+exit.toString()+' gain loss or equal',()=>{
 const p=pnlDiagnostic({quantity18:10n*W,side,entry18:100n*W,market18:exit*W,collateral18:2n*W,decimals:'6',quantityUnit:'USD18_NOTIONAL',priceUnit:'FIXED_18'});assert.equal(p.usd18.n,sign*W);assert.equal(p.usd18.d,1n);assert.equal(p.rawToken.n,sign*500000n);assert.equal(p.rawToken.d,1n);
});
test('partial exit sums match independent cross multiplication',()=>{const r=evaluateDiagnostics(fixture()),t=r.diagnostics.pnlTotals;equalFraction(t.usd18Net,-W,1n);equalFraction(t.rawTokenNet,-13000000n,231n);equalFraction(t.rawTokenGain,2000000n,21n);equalFraction(t.rawTokenLoss,5000000n,33n);assert.equal(t.nettingAuthorized,false);});
test('large integer products preserve exactness beyond float precision',()=>{const q=10n**70n+1n,e=10n**40n+3n,c=W+1n,p=pnlDiagnostic({quantity18:q,side:'LONG',entry18:e,market18:e+7n,collateral18:c,decimals:'18',quantityUnit:'USD18_NOTIONAL',priceUnit:'FIXED_18'});assert.equal(p.rawToken.n*(e*c),q*7n*W*p.rawToken.d);});
for(const [d,n,den]of [['0',1n,2n],['6',500000n,1n],['18',500000000000000000n,1n]])test('synthetic collateral decimals '+d+' remain rational without integerization',()=>{const p=pnlDiagnostic({quantity18:10n*W,side:'LONG',entry18:100n*W,market18:110n*W,collateral18:2n*W,decimals:d,quantityUnit:'USD18_NOTIONAL',priceUnit:'FIXED_18'});equalFraction(wire(p.rawToken),n,den);});
test('zero collateral divisor is rejected',()=>assert.throws(()=>pnlDiagnostic({quantity18:W,side:'LONG',entry18:W,market18:W,collateral18:0n,decimals:'6',quantityUnit:'USD18_NOTIONAL',priceUnit:'FIXED_18'}),/ZERO_DENOMINATOR/));
test('wrong quantity unit is rejected',()=>{const x=fixture();x.units.quantity='TOKEN18';assert.throws(()=>evaluateDiagnostics(x),/QUANTITY_UNIT_MISMATCH/);});
test('wrong price unit is rejected',()=>{const x=fixture();x.units.marketPrice='USD27';assert.throws(()=>evaluateDiagnostics(x),/PRICE_UNIT_MISMATCH/);});
test('floating point model input is rejected',()=>{const x=fixture();x.prices[0].market18=0.1;assert.throws(()=>evaluateDiagnostics(x),/NUMBER_INPUT_FORBIDDEN/);});
test('Number decimals are rejected rather than coerced',()=>{const x=fixture();x.units.collateralDecimals=6;assert.throws(()=>evaluateDiagnostics(x),/NUMBER_INPUT_FORBIDDEN/);});
for(const [partial,end,official,gap]of [['198','199',691n,0n],['199','200',698n,0n],['199','201',698n,5n],['200','201',700n,5n],['201','202',700n,12n]])test('E boundary partial '+partial+' final '+end+' has no gap or double count',()=>{
 const x=fixture('LONG',partial,end);x.observedIntegrals={official:{long:(official*W).toString(),short:'0'},gap:{long:(gap*W).toString(),short:'0'}};const r=evaluateDiagnostics(x);
 assert.equal(r.diagnostics.exposure.integrals.official.long,(official*W).toString());assert.equal(r.diagnostics.exposure.integrals.gap.long,(gap*W).toString());assert.deepEqual(r.diagnostics.exposure.integrals,r.diagnostics.exposure.independentLotIntegrals);assert.equal(r.diagnostics.gapFunding,null);
});
test('short exposure integrates on short side only',()=>{const r=evaluateDiagnostics(fixture('SHORT','199','201'));assert.equal(r.diagnostics.exposure.integrals.official.short,(698n*W).toString());assert.equal(r.diagnostics.exposure.integrals.official.long,'0');assert.equal(r.diagnostics.exposure.integrals.gap.short,(5n*W).toString());});
test('multiple official epochs split the exposure without duplication',()=>{const x=fixture();x.officialEpochs=[{epoch:'1',from:'100',to:'150'},{epoch:'2',from:'150',to:'200'}];const r=evaluateDiagnostics(x);assert.deepEqual(r.diagnostics.exposure.perEpoch,[{epoch:'1',long:(350n*W).toString(),short:'0'},{epoch:'2',long:(348n*W).toString(),short:'0'}]);});
test('epoch gap is rejected',()=>{const x=fixture();x.officialEpochs=[{epoch:'1',from:'100',to:'150'},{epoch:'2',from:'151',to:'200'}];assert.throws(()=>evaluateDiagnostics(x),/EPOCH_GAP_OR_OVERLAP/);});
test('missing exposure interval is rejected',()=>{const x=fixture();x.submittedIntervals=evaluateDiagnostics(x).diagnostics.exposure.intervals.slice(1);assert.throws(()=>evaluateDiagnostics(x),/EXPOSURE_INTERVAL_COVERAGE_MISMATCH/);});
test('duplicate exposure interval is rejected',()=>{const x=fixture();const a=evaluateDiagnostics(x).diagnostics.exposure.intervals;x.submittedIntervals=[...a,a[0]];assert.throws(()=>evaluateDiagnostics(x),/EXPOSURE_INTERVAL_DUPLICATE/);});
test('overlapping altered interval is rejected',()=>{const x=fixture();x.submittedIntervals=evaluateDiagnostics(x).diagnostics.exposure.intervals;x.submittedIntervals[1].from='198';assert.throws(()=>evaluateDiagnostics(x),/EXPOSURE_INTERVAL_COVERAGE_MISMATCH/);});
test('recorded integral mismatch is rejected',()=>{const x=fixture();x.observedIntegrals={official:{long:'1',short:'0'},gap:{long:'0',short:'0'}};assert.throws(()=>evaluateDiagnostics(x),/RECORDED_INTEGRAL_MISMATCH/);});
test('missing transition is rejected',()=>{const x=fixture();x.transitions.splice(1,1);assert.throws(()=>evaluateDiagnostics(x),/TRANSITION_SEQUENCE/);});
test('duplicate transition receipt is rejected',()=>{const x=fixture();x.transitions[1].receipt=x.transitions[0].receipt;assert.throws(()=>evaluateDiagnostics(x),/DUPLICATE_TRANSITION_RECEIPT/);});
test('future price observation is rejected',()=>{const x=fixture();x.prices[0].marketTime='200';assert.throws(()=>evaluateDiagnostics(x),/PRICE_TIME_AFTER_EXIT/);});
test('missing all prices does not turn into zero money',()=>{const x=fixture();x.prices=[];const r=evaluateDiagnostics(x);assert.equal(r.diagnostics.pnlTotals,null);assert.equal(r.diagnostics.knownLegsSubtotal,null);assert(r.blockers.includes('PRICE_EVIDENCE_MISSING:2'));assert.equal(r.monetaryResult,null);});
test('old observations keep freshness policy undecided',()=>{const x=fixture();x.prices[0].marketTime='100';const r=evaluateDiagnostics(x);assert(r.blockers.includes('PRICE_FRESHNESS_POLICY_UNDECIDED'));assert.equal(r.evaluationStatus,'NOT_EVALUATED');});
test('unapproved Gap zero rate cannot be supplied as a default',()=>{const x=fixture();x.policies.gap={rate:'0'};assert.throws(()=>evaluateDiagnostics(x),/UNSUPPORTED_UNAPPROVED_POLICY:gap/);});
function funded(){const x=fixture();x.policies.fundingAllocation={provenance:'SYNTHETIC_TEST_ONLY',reference:H('8')};x.funding={kind:'SYNTHETIC_TEST_ONLY',reference:H('9'),obligations:[{obligationId:H('a'),epoch:'1',debtUsd18:{n:'10',d:'1'},claimUsd18:{n:'0',d:'1'}}],allocations:null};return x;}
test('official Funding is represented once rather than once per exit',()=>{const r=evaluateDiagnostics(funded());assert.equal(r.diagnostics.legs.length,2);assert.deepEqual(r.diagnostics.officialFunding.totalDebt,{n:'10',d:'1'});assert.equal(r.diagnostics.officialFunding.obligations.length,1);assert(r.diagnostics.legs.every(l=>!Object.hasOwn(l,'fundingDebt')));});
test('same official epoch cannot be submitted twice under another obligation ID',()=>{const x=funded();x.funding.obligations.push({...structuredClone(x.funding.obligations[0]),obligationId:H('b')});assert.throws(()=>evaluateDiagnostics(x),/FUNDING_EPOCH_DUPLICATE/);});
test('duplicate Funding attribution is rejected',()=>{const x=funded(),a={obligationId:H('a'),exitSequence:'2',debtUsd18:{n:'3',d:'1'},claimUsd18:{n:'0',d:'1'}};x.funding.allocations=[a,structuredClone(a)];assert.throws(()=>evaluateDiagnostics(x),/FUNDING_DUPLICATE_ATTRIBUTION/);});
test('full Funding duplicated over two exits is rejected',()=>{const x=funded();x.funding.allocations=['2','3'].map(exitSequence=>({obligationId:H('a'),exitSequence,debtUsd18:{n:'10',d:'1'},claimUsd18:{n:'0',d:'1'}}));assert.throws(()=>evaluateDiagnostics(x),/FUNDING_OVERALLOCATED/);});
test('explicit synthetic partial allocation preserves rational residual',()=>{const x=funded();x.funding.allocations=[{obligationId:H('a'),exitSequence:'2',debtUsd18:{n:'1',d:'3'},claimUsd18:{n:'0',d:'1'}}];const r=evaluateDiagnostics(x);assert.deepEqual(r.diagnostics.officialFunding.obligations[0].unallocatedDebt,{n:'29',d:'3'});assert.equal(r.confirmedAmount,null);});
test('Funding attribution without even test-only policy evidence is rejected',()=>{const x=funded();x.policies.fundingAllocation=null;x.funding.allocations=[];assert.throws(()=>evaluateDiagnostics(x),/FUNDING_ATTRIBUTION_POLICY_MISSING/);});
test('evaluation does not mutate its input or depend on prior calls',()=>{const x=fixture(),before=JSON.stringify(x),first=evaluateDiagnostics(x);evaluateDiagnostics(fixture('SHORT','199','201'));assert.equal(JSON.stringify(x),before);assert.deepEqual(evaluateDiagnostics(x),first);});
test('identical input yields identical evaluation ID and output',()=>assert.deepEqual(evaluateDiagnostics(fixture()),evaluateDiagnostics(fixture())));
test('source semantic commitment is bound into evaluation ID',()=>{const a=fixture(),b=fixture();b.source.semanticCommitment=H('c');assert.notEqual(evaluateDiagnostics(a).evaluationId,evaluateDiagnostics(b).evaluationId);});
test('price evidence content is bound even with unchanged evidence reference',()=>{const a=fixture(),b=fixture();b.prices[0].market18=(5n*W).toString();assert.notEqual(evaluateDiagnostics(a).evaluationId,evaluateDiagnostics(b).evaluationId);});
test('policy reference and calculation version are explicit evaluation identity inputs',()=>{const a=fixture(),b=fixture();b.policies.calculation.reference=H('d');const x=evaluateDiagnostics(a),y=evaluateDiagnostics(b);assert.notEqual(x.evaluationId,y.evaluationId);assert.equal(x.calculationVersion,CALCULATION_VERSION);});
test('synthetic diagnostics never acquire financial authority or consumption',()=>{const r=evaluateDiagnostics(funded());assert.equal(r.evaluationStatus,'NOT_EVALUATED');assert.equal(r.confirmedAmount,null);assert.equal(r.fundsAuthority,false);assert.equal(r.settlementAuthorized,false);assert.equal(r.createsClaim,false);assert.equal(r.consumesHistory,false);assert.equal(r.diagnostics.integerizedAmounts,null);assert.equal(r.diagnostics.dustAllocation,null);});
let actual;
test('real candidate reuses task 2/49 verification and remains blocked',()=>{
 actual=evaluateVerifiedLocalCandidate();const r=actual.result;
 assert.equal(r.inputVerification.status,'VERIFIED_BY_UNCHANGED_TASK_2_49_LOCAL_PATH');assert.equal(r.diagnostics.exposure.integrals.official.long,(698n*W).toString());assert.equal(r.diagnostics.exposure.integrals.gap.long,'0');
 assert.equal(r.diagnostics.exposure.comparison,'TWO_METHODS_AND_RECORDED_EVIDENCE_MATCH');
 assert.deepEqual(r.diagnostics.pnlTotals.usd18Net,{n:'0',d:'1'});assert.equal(r.diagnostics.officialFunding,null);assert.equal(r.diagnostics.gapFunding,null);
 assert(r.blockers.includes('OFFICIAL_FUNDING_UNFINALIZED'));assert(r.blockers.includes('PRICE_APPROVAL_EVIDENCE_MISSING'));assert(r.blockers.includes('POLICY_EVIDENCE_MISSING'));
 assert.equal(r.evaluationStatus,'NOT_EVALUATED');assert.equal(r.monetaryResult,null);assert.equal(r.confirmedAmount,null);assert.equal(r.fundsAuthority,false);assert.equal(r.settlementAuthorized,false);assert.equal(r.createsClaim,false);assert.equal(r.consumesHistory,false);
});
describe('task 2/51 exact exit diagnostics',()=>{for(const {name,fn}of cases)it(name,fn);});
if(typeof after==='function')after(()=>{if(process.env.LQC51_OUTPUT_DIR&&actual){fs.writeFileSync(process.env.LQC51_OUTPUT_DIR+'/actual-candidate-input.json',JSON.stringify(actual.input,null,2));fs.writeFileSync(process.env.LQC51_OUTPUT_DIR+'/actual-candidate-output.json',JSON.stringify(actual.result,null,2));}});
export const plannedNames=cases.map(c=>'task 2/51 exact exit diagnostics '+c.name);
