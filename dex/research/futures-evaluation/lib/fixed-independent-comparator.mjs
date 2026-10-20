import fs from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {FIXED_REFERENCE_HASHES} from './fixed-independent-reference-pins.mjs';
import {NO_AUTHORITY} from './policy-v1-common.mjs';
const root=new URL('../',import.meta.url);
export function validateFixedReferenceBytes(kind,bytes){
 assert(Object.hasOwn(FIXED_REFERENCE_HASHES,kind),'UNSUPPORTED_FIXED_REFERENCE');assert(Buffer.isBuffer(bytes),'REFERENCE_BYTES_REQUIRED');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),FIXED_REFERENCE_HASHES[kind],'FIXED_REFERENCE_BYTES_MISMATCH');return JSON.parse(bytes);
}
export function readFixedReference(kind){return validateFixedReferenceBytes(kind,fs.readFileSync(new URL('fixed-independent-'+kind+'.json',root)));}
export function fixedGroupKey(owner,phase,epoch,period){
 assert(typeof owner==='string'&&owner.length>0,'GROUP_OWNER_REQUIRED');
 assert(phase==='OFFICIAL'&&epoch==='1'&&period===null||phase==='GAP'&&epoch===null&&period==='1','UNSUPPORTED_FIXED_GROUP_SCOPE');
 return JSON.stringify([owner,phase,epoch,period]);
}
function expectedObligations(name){const refs=readFixedReference('obligations');assert(Object.hasOwn(refs.cases,name),'UNSUPPORTED_FIXED_CASE');const e=refs.cases[name];for(const r of e.positionTotals)r.id=fixedGroupKey(r.pid,r.phase,r.epoch,r.period);for(const r of e.accountTotals)r.id=fixedGroupKey(r.account,r.phase,r.epoch,r.period);return e;}
export function strictUnsigned(value){assert(typeof value==='string'&&/^(0|[1-9][0-9]*)$/.test(value),'STRICT_UNSIGNED_STRING');return BigInt(value);}
function keys(x){assert(x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype,'PLAIN_RECORD_REQUIRED');return Object.keys(x).sort();}
export function compareExactFraction(actual,expected,path='fraction'){
 assert.deepEqual(keys(actual),['d','n'],path+':FRACTION_SCHEMA');assert.deepEqual(keys(expected),['d','n'],path+':EXPECTED_FRACTION_SCHEMA');
 const an=strictUnsigned(actual.n),ad=strictUnsigned(actual.d),bn=strictUnsigned(expected.n),bd=strictUnsigned(expected.d);
 assert(ad>0n&&bd>0n,path+':POSITIVE_DENOMINATOR');assert.equal(an*bd,bn*ad,path+':FRACTION_VALUE');
}
function compareTree(actual,expected,path){
 if(expected===null){assert.equal(actual,null,path+':NULL_REQUIRED');return;}
 if(Array.isArray(expected)){
  assert(Array.isArray(actual),path+':ARRAY_REQUIRED');for(let i=0;i<actual.length;i++)assert(Object.hasOwn(actual,i),path+':SPARSE_ARRAY');assert.equal(Object.keys(actual).length,actual.length,path+':ARRAY_PROPERTIES');
  if(expected.length&&typeof expected[0]==='object'&&Object.hasOwn(expected[0],'id')){
   const rows=new Map();for(const row of actual){assert(row&&typeof row.id==='string',path+':ROW_ID');assert(!rows.has(row.id),path+':DUPLICATE_ROW');rows.set(row.id,row);}
   assert.deepEqual([...rows.keys()].sort(),expected.map(r=>r.id).sort(),path+':EXACT_ROW_SET');
   for(const row of expected)compareTree(rows.get(row.id),row,path+'/'+row.id);
  }else{assert.equal(actual.length,expected.length,path+':ARRAY_LENGTH');for(let i=0;i<expected.length;i++)compareTree(actual[i],expected[i],path+'/'+i);}
  return;
 }
 if(typeof expected==='object'){
  if(Object.hasOwn(expected,'n')&&Object.hasOwn(expected,'d')){compareExactFraction(actual,expected,path);return;}
  assert.deepEqual(keys(actual),keys(expected),path+':EXACT_FIELDS');for(const k of Object.keys(expected))compareTree(actual[k],expected[k],path+'/'+k);return;
 }
 if(typeof expected==='string'&&/^(0|[1-9][0-9]*)$/.test(expected))strictUnsigned(actual);
 assert.equal(actual,expected,path+':VALUE');
}
function safeResult(kind){return {comparison:kind,evidenceLevel:'FIXED_SYNTHETIC_HAND_CHECK_ONLY',actualCandidateStatus:'UNVERIFIED',evaluationStatus:'NOT_EVALUATED',confirmedAmount:null,payableAmount:null,returnAmount:null,lpRecoveryAmount:null,rightsTransitionComplete:false,financialSettlementComplete:false,...NO_AUTHORITY,blockers:['GENERAL_CALCULATION_CORRECTNESS_UNPROVEN','REAL_INVENTORY_CHAIN_PRICE_AND_LEDGER_UNAUTHENTICATED','REFUND_AND_RIGHTS_EXECUTION_UNSUPPORTED']};}
export function compareFixedObligations(name,calculated,submitted){
 const expected=expectedObligations(name);
 for(const [label,view]of [['calculated',calculated],['submitted',submitted]]){
  // Preserve raw global ordering even though other keyed tables are compared as sets.
  assert(Array.isArray(view.transitions),'TRANSITIONS_REQUIRED');assert.deepEqual(view.transitions.map(r=>r.id),expected.transitions.map(r=>r.id),label+'/transitions:EXACT_ORDER');
  compareTree(view,expected,label);
 }
 return {...safeResult('MATCH_FIXED_OBLIGATION_CASE'),caseId:name,observedOnly:true,openPositions:[...expected.openPositions]};
}
export function compareFixedCash(calculated,submitted){const expected=readFixedReference('cash').case;compareTree(calculated,expected,'calculatedCash');compareTree(submitted,expected,'submittedCash');return safeResult('MATCH_FIXED_CASH_ARITHMETIC');}

// Untrusted submitted projections only: no context registration or ledger authentication.
export function compareFixedSubmission(name,projection){
 const expected=expectedObligations(name),required=['scope','policyMode','units','Q','accounts','positions','transitions','lots','obligations','lotAmounts','positionTotals','accountTotals'];
 assert.deepEqual(keys(projection),['fields','unlinked'],'SUBMISSION_PROJECTION_SCHEMA');assert.deepEqual(keys(projection.fields),[...required].sort(),'SUBMISSION_FIELD_MANIFEST');
 const expectedAccounts=[...new Set(expected.positions.map(p=>p.account))].map(id=>({id}));const compared=[],missing=[];
 for(const field of required){const value=projection.fields[field];if(value===null){missing.push(field);continue;}const e=field==='accounts'?expectedAccounts:expected[field];if(field==='transitions')assert.deepEqual(value.map(t=>t.id),e.map(t=>t.id),'submitted/transitions:EXACT_ORDER');compareTree(value,e,'submitted/'+field);compared.push(field);}
 assert(Array.isArray(projection.unlinked),'UNLINKED_FIELDS_REQUIRED');for(const item of projection.unlinked){assert.deepEqual(keys(item),['field','reason'],'UNLINKED_REASON_SCHEMA');assert(typeof item.reason==='string'&&item.reason.length>0,'UNLINKED_REASON_REQUIRED');}
 for(const field of missing)assert(projection.unlinked.some(x=>x.field===field),'MISSING_FIELD_REASON_REQUIRED');
 return {...safeResult(missing.length?'PARTIAL_FIXED_SUBMISSION':'MATCH_FIXED_SUBMITTED_LAYERS'),comparedFields:compared,unlinked:projection.unlinked,fullSubmissionConnectionEstablished:false};
}
