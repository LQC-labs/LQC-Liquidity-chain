
import assert from 'node:assert/strict';
import {keccak256,toUtf8Bytes} from 'ethers';
import {canonical} from './input-schema.mjs';
export const CALCULATION_VERSION='LQC_PURE_EXIT_DIAGNOSTICS_V2';
export function evaluationIdFor(input,calculationVersion){
 assert(typeof calculationVersion==='string'&&calculationVersion.length>0,'CALCULATION_VERSION_REQUIRED');
 return keccak256(toUtf8Bytes(canonical({domain:'LQC_DIAGNOSTIC_EVALUATION_ID_V1',sourceMeaning:input.source.semanticCommitment,calculationVersion,input})));
}
