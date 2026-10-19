import assert from 'node:assert/strict';
import {diagnoseRecordedCandidateForPolicyV1,evaluatePolicyV1} from '../lib/policy-v1-evaluator.mjs';
import {loadPolicyV1ResearchCase} from '../lib/policy-v1-source.mjs';
import {NO_AUTHORITY} from '../lib/policy-v1-common.mjs';

describe('policy V1 recorded evidence levels',()=>{
 let actual;
 before(()=>{actual=diagnoseRecordedCandidateForPolicyV1();});
 it('binds existing verified output and raw hashes without changing its evidence',()=>{
  assert.equal(actual.sourceBinding.semanticCommitment,actual.prior.input.source.semanticCommitment);
  assert.equal(actual.sourceBinding.semanticCommitment,actual.prior.result.inputVerification.sourceSemanticCommitment);
  assert.deepEqual(actual.sourceBinding.rawByteHashes,actual.prior.result.inputVerification.rawByteHashes);
  assert(Object.keys(actual.sourceBinding.rawByteHashes).length>0);
  assert.equal(actual.evidenceLevels.localOriginalBinding.status,'LOCAL_MATCH');
  assert.equal(actual.evidenceLevels.internalConsistency.status,'LOCAL_MATCH');
 });
 it('separates local stored prices from chain finality and Oracle authentication',()=>{
  const e=actual.evidenceLevels;
  assert.equal(e.storedUsedPrices.status,'LOCAL_MATCH');assert.equal(e.storedUsedPrices.observations.length,2);
  assert.deepEqual(e.storedUsedPrices.observations,actual.prior.input.prices);
  for(const key of ['independentChain','finality','oracleSource','v1PolicyApproval','actualCash','durableConsumption'])assert.equal(e[key].status,'UNVERIFIED',key);
  assert.equal(e.v1SeriesEligibility.status,'INELIGIBLE');assert(!Object.hasOwn(actual,'verified'));
 });
 it('retains blockers null amounts and every disabled authority',()=>{
  assert.equal(actual.evaluationStatus,'NOT_EVALUATED');
  for(const key of ['confirmedAmount','monetaryResult','policyV1Amounts'])assert.equal(actual[key],null);
  for(const key of Object.keys(NO_AUTHORITY))assert.equal(actual[key],false);
  assert.equal(actual.activationAllowed,false);assert.equal(actual.settlementComplete,false);
  for(const blocker of actual.prior.result.blockers)assert(actual.blockers.includes(blocker));
  for(const blocker of ['INDEPENDENT_FINALITY_PROOF_MISSING','NEW_V1_POLICY_APPROVAL_BINDING_MISSING','REAL_COLLECTION_AND_PAYMENT_RECEIPTS_NOT_AUTHENTICATED','PERSISTENT_CONSUMPTION_NOT_AUTHENTICATED'])assert(actual.blockers.includes(blocker));
 });
 it('accepts only the matching original commitment as a comparison constraint',()=>{
  const result=diagnoseRecordedCandidateForPolicyV1({expectedSourceCommitment:actual.sourceBinding.semanticCommitment});
  assert.deepEqual(result,actual);
 });
 it('reports an explicit commitment mismatch rather than unknown authentication',()=>{
  const wrong='0x'+(actual.sourceBinding.semanticCommitment[2]==='0'?'1':'0')+actual.sourceBinding.semanticCommitment.slice(3);
  assert.throws(()=>diagnoseRecordedCandidateForPolicyV1({expectedSourceCommitment:wrong}),e=>e.message==='RECORDED_SOURCE_COMMITMENT_MISMATCH'&&e.evidenceStatus==='MISMATCH'&&e.evidenceDimension==='localOriginalBinding');
 });
 it('rejects forged verification approval and caller supplied prior output',()=>{
  for(const key of ['verified','approved','policyApproved','priceApproved','finalityAuthenticated','evidenceLevels','prior','candidate'])assert.throws(()=>diagnoseRecordedCandidateForPolicyV1({[key]:true}),/ADDITIONAL_FIELD/);
  assert.throws(()=>diagnoseRecordedCandidateForPolicyV1({},actual.prior),/RECORDED_DIAGNOSIS_ARGUMENTS/);
 });
 it('rejects mixing V1 requests into the legacy diagnosis',()=>{
  const {request}=loadPolicyV1ResearchCase('partial');
  assert.throws(()=>diagnoseRecordedCandidateForPolicyV1(request),/ADDITIONAL_FIELD/);
  assert.throws(()=>diagnoseRecordedCandidateForPolicyV1({config:request.config}),/ADDITIONAL_FIELD/);
 });
 it('does not turn a recorded diagnosis into a V1 evaluation source',()=>{
  const {request}=loadPolicyV1ResearchCase('partial');
  assert.throws(()=>evaluatePolicyV1(actual,request),/PINNED_SOURCE_CONTEXT_REQUIRED/);
 });
 it('rejects malformed commitments and hidden authentication fields',()=>{
  assert.throws(()=>diagnoseRecordedCandidateForPolicyV1({expectedSourceCommitment:null}),/INVALID_BYTES32/);
  const options={};Object.defineProperty(options,'approved',{value:true});
  assert.throws(()=>diagnoseRecordedCandidateForPolicyV1(options),/ADDITIONAL_FIELD/);
 });
});
