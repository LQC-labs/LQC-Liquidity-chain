
import assert from 'node:assert/strict';
import {loadPolicyV1ResearchCase,historyMeaning} from '../lib/policy-v1-source.mjs';
import {validatePolicyV1Config} from '../lib/policy-v1-config.mjs';
import {buildPolicyV1Segments} from '../lib/policy-v1-segments.mjs';
import {evaluatePolicyV1} from '../lib/policy-v1-evaluator.mjs';
import {hash} from '../lib/policy-v1-common.mjs';
const W=10n**18n,cases=[],test=(name,fn)=>cases.push({name,fn}),load=name=>loadPolicyV1ResearchCase(name);
const frac=(f,n,d=1n)=>{assert.equal(BigInt(f.n)*d,n*BigInt(f.d));assert(BigInt(f.d)>0n);};
test('economic V1 is distinct from diagnostic calculation V2',()=>{const {request}=load('partial'),v=validatePolicyV1Config(request.config);assert.equal(v.state,'CONFIGURED_NOT_APPROVED');assert.equal(request.config.schema,'LQC_SETTLEMENT_POLICY_V1');assert.equal(v.activationAllowed,false);});
for(const field of ['D','rBps','prices','proof','origin'])test('missing required '+field+' never receives a default',()=>{const {request}=load('partial');delete request.config[field];const x=validatePolicyV1Config(request.config);assert.equal(x.state,'UNCONFIGURED');assert(x.blockers.some(b=>b==='CONFIG_MISSING:'+field));assert.equal(x.activationAllowed,false);});
test('missing nested price setting is unconfigured',()=>{const {request}=load('partial');delete request.config.prices.collateral.maxAge;assert(validatePolicyV1Config(request.config).blockers.includes('CONFIG_MISSING:prices.collateral.maxAge'));});
test('missing proof setting is unconfigured',()=>{const {request}=load('partial');request.config.proof.stateRule=null;assert(validatePolicyV1Config(request.config).blockers.includes('CONFIG_MISSING:proof.stateRule'));});
test('explicit zero rate is configured and gives diagnostic zero',()=>{const {context,request}=load('explicitZero'),r=evaluatePolicyV1(context,request);assert.equal(r.configuration.state,'CONFIGURED_NOT_APPROVED');assert(r.history.segments.every(s=>s.fundingUsd18.n==='0'&&s.fundingUsd18.d==='1'));assert.equal(r.confirmedAmount,null);});
test('zero D is invalid rather than an omitted value',()=>{const {request}=load('partial');request.config.D='0';assert.throws(()=>validatePolicyV1Config(request.config),/PERIOD_MUST_BE_POSITIVE/);});
test('Number period input is rejected',()=>{const {request}=load('partial');request.config.D=100;assert.throws(()=>validatePolicyV1Config(request.config),/WIRE_TYPE_FORBIDDEN/);});
test('negative rate is rejected',()=>{const {request}=load('partial');request.config.rBps.n='-1';assert.throws(()=>validatePolicyV1Config(request.config),/INVALID_UINT_STRING/);});
test('zero rate denominator is rejected',()=>{const {request}=load('partial');request.config.rBps.d='0';assert.throws(()=>validatePolicyV1Config(request.config),/ZERO_DENOMINATOR/);});
test('arbitrary approval flag is rejected',()=>{const {request}=load('partial');request.config.approved=true;assert.throws(()=>validatePolicyV1Config(request.config),/ADDITIONAL_FIELD/);});
test('policy committed after Series creation is rejected',()=>{const {context,request}=load('latePolicy');assert.throws(()=>evaluatePolicyV1(context,request),/POLICY_COMMITTED_AFTER_SERIES/);});
test('existing Series cannot acquire V1 retroactively',()=>{const {context,request}=load('oldSeries');assert.throws(()=>evaluatePolicyV1(context,request),/EXISTING_SERIES_NOT_V1/);});
test('caller cannot replace independent source and history together',()=>{const {request}=load('partial');assert.throws(()=>buildPolicyV1Segments({kind:'PINNED_SYNTHETIC_RESEARCH_SOURCE'},request),/PINNED_SOURCE_CONTEXT_REQUIRED/);});
test('50 50 flip preserves both directions unlike whole integral zero',()=>{
 const {context,request}=load('flip50'),h=buildPolicyV1Segments(context,request);
 assert.equal(h.segments.length,2);assert.deepEqual(h.segments.map(s=>s.direction),['LONG','SHORT']);
 for(const s of h.segments)frac(s.fundingUsd18,W,400n);
 assert.equal(h.segments[0].positions.find(p=>p.pid==='1').claimUsd18.n,'0');frac(h.segments[0].positions.find(p=>p.pid==='1').debtUsd18,W,400n);
 frac(h.segments[1].positions.find(p=>p.pid==='3').claimUsd18,W,400n);
 const wholeL=300n*50n+100n*50n,wholeS=100n*50n+300n*50n;assert.equal(wholeL-wholeS,0n);
});
test('60 40 flip keeps 0.003 debt and reverse 0.002 instead of one 0.001 flow',()=>{
 const {context,request}=load('flip60'),h=buildPolicyV1Segments(context,request);
 frac(h.segments[0].fundingUsd18,3n*W,1000n);frac(h.segments[1].fundingUsd18,W,500n);
 frac(h.segments[1].positions.find(p=>p.pid==='3').claimUsd18,W,500n);
 const L=22000n,S=18000n,M=10000n;assert.equal(M*(L-S)*W/(100n*(L+S)*10000n),W/1000n);
});
test('same timestamp changes preserve original order with no zero time charge',()=>{
 const {context,request}=load('flip50'),h=buildPolicyV1Segments(context,request);
 assert.equal(request.history.records.filter(r=>r.timestamp==='150').length,4);
 assert.deepEqual(h.segments.map(s=>[s.from,s.to]),[['100','150'],['150','200']]);
 assert.deepEqual(h.segments[1].participants.map(p=>p.pid),['3','4']);
});
test('E minus one E and E plus one are nonoverlapping half open boundaries',()=>{
 const {context,request}=load('edge'),h=buildPolicyV1Segments(context,request);
 assert(h.segments.some(s=>s.from==='199'&&s.to==='200'&&s.kind==='OFFICIAL'));
 assert(h.segments.some(s=>s.from==='200'&&s.to==='201'&&s.kind==='GAP'));
 const officialLong=h.segments.filter(s=>s.kind==='OFFICIAL').reduce((n,s)=>n+BigInt(s.long18)*(BigInt(s.to)-BigInt(s.from)),0n);assert.equal(officialLong,698n*W);
});
test('D grid starts at O and is not reset at nonaligned E',()=>{
 const {context,request}=load('originGrid'),h=buildPolicyV1Segments(context,request),ends=h.segments.map(s=>s.to);
 for(const t of ['200','250','300','400'])assert(ends.includes(t));assert(!ends.includes('350'));
});
test('long remaining B does not change sealed A past debt or direction',()=>{
 const short=load('shortOpen'),long=load('longOpen'),a=buildPolicyV1Segments(short.context,short.request),b=buildPolicyV1Segments(long.context,long.request);
 const earlier=a.segments.filter(s=>BigInt(s.to)<=220n),later=b.segments.filter(s=>BigInt(s.to)<=220n);assert.deepEqual(later,earlier);
 assert.deepEqual(b.openPositions,['2']);frac(later[1].fundingUsd18,W,1000n);
 assert(b.segments.filter(s=>BigInt(s.from)>=220n).every(s=>s.fundingUsd18.n==='0'));
 const A=b.positionEpochTotals.filter(p=>p.pid==='1');frac(A.find(p=>p.kind==='OFFICIAL').debtUsd18,W,200n);frac(A.find(p=>p.kind==='GAP').debtUsd18,W,1000n);
});
test('closed lots and open remainder are not completion or consumption',()=>{
 const {context,request}=load('longOpen'),h=buildPolicyV1Segments(context,request);assert(h.attributions.some(x=>x.pid==='2'&&x.kind==='OPEN_REMAINDER'));assert.equal(h.consumesHistory,false);
});
test('partial lots conserve position and Epoch amounts exactly',()=>{
 const {context,request}=load('partial'),h=buildPolicyV1Segments(context,request),p=h.positionEpochTotals.find(x=>x.pid==='1');
 frac(p.debtUsd18,W,240n);
 const first=h.attributions.filter(x=>x.pid==='1'&&x.sequence==='2');assert.equal(first.length,1);frac(first[0].debtUsd18,W,1200n);
 const last=h.attributions.filter(x=>x.pid==='1'&&x.sequence==='3');let n=0n,d=1n;for(const x of last){n=n*BigInt(x.debtUsd18.d)+BigInt(x.debtUsd18.n)*d;d*=BigInt(x.debtUsd18.d);}assert.equal(n*300n,W*d);
});
test('duplicate lot attribution is rejected at attribution check',()=>{const {context,request}=load('partial'),h=buildPolicyV1Segments(context,request);request.attributions=[...structuredClone(h.attributions),structuredClone(h.attributions[0])];assert.throws(()=>buildPolicyV1Segments(context,request),/DUPLICATE_ATTRIBUTION/);});
test('changed attribution amount is rejected at reconciliation',()=>{const {context,request}=load('partial'),h=buildPolicyV1Segments(context,request);request.attributions=structuredClone(h.attributions);request.attributions[0].debtUsd18.n='1';assert.throws(()=>buildPolicyV1Segments(context,request),/ATTRIBUTION_RECONCILIATION/);});
test('coherent removal of participant and all its records still fails independent inventory',()=>{
 const {context,request}=load('flip50'),h=request.history;
 h.inventory=h.inventory.filter(p=>p.pid!=='2');h.records=h.records.filter(p=>p.pid!=='2').map((r,i)=>({...r,index:String(i+1)}));h.finalPositions=h.finalPositions.filter(p=>p.pid!=='2');h.commitment=hash(historyMeaning(h));
 assert.throws(()=>buildPolicyV1Segments(context,request),/SOURCE_POSITION_INVENTORY/);
});
test('coherent removal of final transition still fails original record binding',()=>{
 const {context,request}=load('flip50'),h=request.history;h.records=h.records.filter(r=>!(r.pid==='1'&&r.sequence==='2')).map((r,i)=>({...r,index:String(i+1)}));
 h.finalPositions.find(p=>p.pid==='1').remainingQuantity18=(300n*W).toString();Object.assign(h.finalPositions.find(p=>p.pid==='1'),{finalSequence:'1',cumulativeClosed18:'0',exitCount:'0'});h.commitment=hash(historyMeaning(h));
 assert.throws(()=>buildPolicyV1Segments(context,request),/SOURCE_RECORD_BINDING/);
});
test('duplicate Receipt is rejected',()=>{const {context,request}=load('partial');request.history.records[1].receipt=request.history.records[0].receipt;assert.throws(()=>buildPolicyV1Segments(context,request),/DUPLICATE_RECEIPT/);});
test('backward sequence is rejected',()=>{const {context,request}=load('partial');request.history.records[2].sequence='1';assert.throws(()=>buildPolicyV1Segments(context,request),/POSITION_SEQUENCE/);});
test('scope mix is rejected',()=>{const {context,request}=load('partial');request.history.scope.domain='999';assert.throws(()=>buildPolicyV1Segments(context,request),/HISTORY_SCOPE_MIX/);});
test('final count and quantity snapshot mismatch is rejected',()=>{const {context,request}=load('partial');request.history.finalPositions[0].cumulativeClosed18='1';assert.throws(()=>buildPolicyV1Segments(context,request),/FINAL_POSITION_RECONCILIATION/);});
test('identical full evidence yields identical identity and result',()=>{const {context,request}=load('partial');assert.deepEqual(evaluatePolicyV1(context,request),evaluatePolicyV1(context,structuredClone(request)));});
describe('policy V1 configuration history and segmented Funding',()=>{for(const {name,fn}of cases)it(name,fn);});
export const plannedNames=cases.map(c=>'policy V1 configuration history and segmented Funding '+c.name);
