import {evaluateVerifiedLocalCandidate} from './verified-diagnostic-input.mjs';
import {assert,record,hash32,NO_AUTHORITY,ECONOMIC_POLICY_VERSION,POLICY_CALCULATION_VERSION} from './policy-v1-common.mjs';

// No caller-supplied candidate, approval, verification output or trust anchor.
// The optional commitment is a comparison constraint, never an approval source.
export function diagnoseRecordedEvidenceForPolicyV1(options={}){
 assert(arguments.length<=1,'RECORDED_DIAGNOSIS_ARGUMENTS');
 record(options,[],['expectedSourceCommitment']);
 if(Object.hasOwn(options,'expectedSourceCommitment'))hash32(options.expectedSourceCommitment);
 const prior=evaluateVerifiedLocalCandidate();
 const verification=prior.result.inputVerification,source=prior.input.source;
 assert.equal(source.semanticCommitment,verification.sourceSemanticCommitment,'VERIFIED_OUTPUT_COMMITMENT_MISMATCH');
 if(Object.hasOwn(options,'expectedSourceCommitment')&&hash32(options.expectedSourceCommitment)!==hash32(source.semanticCommitment)){
  const error=new Error('RECORDED_SOURCE_COMMITMENT_MISMATCH');
  error.evidenceStatus='MISMATCH';error.evidenceDimension='localOriginalBinding';throw error;
 }
 const local=reason=>({status:'LOCAL_MATCH',reason});
 const unknown=reason=>({status:'UNVERIFIED',reason});
 return {
  schema:'LQC_POLICY_V1_EXISTING_CANDIDATE_DIAGNOSIS',
  economicPolicy:ECONOMIC_POLICY_VERSION,calculationVersion:POLICY_CALCULATION_VERSION,
  evaluationStatus:'NOT_EVALUATED',confirmedAmount:null,monetaryResult:null,policyV1Amounts:null,
  activationAllowed:false,settlementComplete:false,...NO_AUTHORITY,
  sourceBinding:{semanticCommitment:source.semanticCommitment,rawByteHashes:verification.rawByteHashes,scope:source.scope,
   verifier:verification.status,trust:verification.chainEvidenceTrust,
   limits:'Fixed local test references identify recorded bytes and meaning, not independent chain truth or operating approval.'},
  evidenceLevels:{
   localOriginalBinding:local('UNCHANGED_PR403_PINNED_LOCAL_SOURCE'),
   internalConsistency:local('UNCHANGED_PR403_Q_JOURNAL_RECEIPT_HISTORY_CHECKS'),
   independentChain:unknown('LOCAL_ANVIL_NOT_INDEPENDENT_CHAIN_PROOF'),
   finality:unknown('INDEPENDENT_FINALITY_PROOF_MISSING'),
   storedUsedPrices:{...local('UNCHANGED_PR403_LINKED_EXIT_PRICE_AND_RECEIPT_BINDING'),observations:prior.input.prices},
   oracleSource:unknown('LOCAL_MOCK_NOT_AUTHENTICATED_OR_APPROVED_ORACLE'),
   v1PolicyApproval:unknown('NEW_V1_POLICY_APPROVAL_BINDING_MISSING'),
   v1SeriesEligibility:{status:'INELIGIBLE',reason:'EXISTING_SERIES_NOT_APPROVED_POLICY_V1'},
   actualCash:unknown('REAL_COLLECTION_AND_PAYMENT_RECEIPTS_NOT_AUTHENTICATED'),
   durableConsumption:unknown('PERSISTENT_CONSUMPTION_NOT_AUTHENTICATED')
  },
  blockers:[...new Set([...prior.result.blockers,'EXISTING_SERIES_NOT_APPROVED_POLICY_V1','POLICY_V1_PARAMETERS_AND_PROOFS_MISSING',
   'INDEPENDENT_FINALITY_PROOF_MISSING','NEW_V1_POLICY_APPROVAL_BINDING_MISSING',
   'REAL_COLLECTION_AND_PAYMENT_RECEIPTS_NOT_AUTHENTICATED','PERSISTENT_CONSUMPTION_NOT_AUTHENTICATED'])],
  prior
 };
}
