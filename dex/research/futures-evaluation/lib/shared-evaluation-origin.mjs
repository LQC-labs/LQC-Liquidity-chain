import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {evaluatePolicyV1} from './policy-v1-evaluator.mjs';
import {policyV1Source} from './policy-v1-source.mjs';
import {assert,hash,hash32,freeze} from './policy-v1-common.mjs';
import {CALCULATOR_IMPLEMENTATION_RECORD_SHA256} from './shared-evaluation-origin-reference.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function implementationRecord(){
 const bytes=fs.readFileSync(new URL('../shared-calculator-implementation-record.json',import.meta.url));assert.equal(sha(bytes),CALCULATOR_IMPLEMENTATION_RECORD_SHA256,'CALCULATOR_IMPLEMENTATION_RECORD_HASH_MISMATCH');const record=JSON.parse(bytes);
 for(const file of record.files){assert(/^lib\/[a-z0-9-]+\.mjs$/.test(file.file),'IMPLEMENTATION_RECORD_PATH');assert.equal(sha(fs.readFileSync(new URL('../'+file.file,import.meta.url))),file.sha256,'CALCULATOR_IMPLEMENTATION_FILE_HASH_MISMATCH');}
 assert.equal(sha(fs.readFileSync(new URL('../../../package-lock.json',import.meta.url))),record.dependencyLockSHA256,'CALCULATOR_LOCK_FILE_HASH_MISMATCH');
 return {recordSHA256:CALCULATOR_IMPLEMENTATION_RECORD_SHA256,calculationVersion:record.calculationVersion,localFileCount:record.files.length,localByteComparison:'MATCH_FIXED_RECORD',dependencyLockComparison:'FILE_BYTES_MATCH_ONLY',coverage:record.coverage,externalDependenciesAuthenticated:false,implementationCorrectnessProven:false};
}
export function evaluateWithBoundOrigin(context,request){
 // Read the existing loader's privately registered source, then actually call its evaluator.
 const source=policyV1Source(context),implementation=implementationRecord(),result=evaluatePolicyV1(context,request);assert.equal(result.calculationVersion,implementation.calculationVersion,'CALCULATOR_IMPLEMENTATION_VERSION_MISMATCH');hash32(result.evaluationId);
 const origin={underlyingEvaluationId:result.evaluationId,underlyingCalculationVersion:result.calculationVersion,sourceEvidenceCommitment:hash(source),requestCommitment:hash(request),implementationRecord:implementation,sourceVerification:'PINNED_LOCAL_SYNTHETIC_LOADER',executionVerification:'EXISTING_LOCAL_EVALUATOR_CALLED',independentReevaluationAuthenticated:false,pricePolicyApproved:false,chainAuthenticated:false};
 return {result,origin:freeze(origin)};
}
