
import assert from 'node:assert/strict';
import {loadTestOnlyCandidate,readCandidateRecordsForUnitTests,inspectCandidateRecordsForUnitTests} from './candidate-adapter-v3.mjs';
import {evaluateDiagnostics} from './exit-diagnostic-evaluator.mjs';
import {unsigned} from './exact-rational.mjs';
// IO boundary only. Existing task 2/49 validation is unchanged; the calculator itself performs no IO.
export function evaluateVerifiedLocalCandidate(){
 const verified=loadTestOnlyCandidate(),records=readCandidateRecordsForUnitTests(),second=inspectCandidateRecordsForUnitTests(records);
 assert.equal(second.semanticCommitment,verified.semanticCommitment,'INPUT_CHANGED_AFTER_VERIFICATION');
 const s=records.scope,h=s.history[0],domain=verified.history.domain,seriesId=verified.history.series,pid=h.pid;
 function one(role,method,predicate=()=>true){const rows=s.finalViews.filter(v=>v.role===role&&v.method===method&&predicate(v));assert.equal(rows.length,1,'VERIFIED_VIEW_NOT_UNIQUE:'+method);return rows[0];}
 const basis=one('LocalFuturesPartialV11','linkedBasis',v=>v.args[0]===pid).result[0],
 domainView=one('LocalFuturesTradingCore','domain',v=>v.args[0]===domain).result[0],
 series=one('LocalFuturesFundingV11','fundingSeries',v=>v.args[0]===domain&&v.args[1]===seriesId).result[0];
 assert.equal(series[2],'1','UNSUPPORTED_LOCAL_MULTI_EPOCH_BRIDGE');
 const epoch=one('LocalFuturesFundingV11','fundingSeriesEpoch',v=>v.args[0]===domain&&v.args[1]===seriesId),
 gap=one('LocalFuturesFundingV11','policyGap',v=>v.args[0]===domain&&v.args[1]===seriesId&&v.args[2]===h.account&&v.args[3]===pid);
 const responses=new Map(records.journal.filter(e=>e.event==='RESPONSE').map(e=>[e.id,e.response])),
 counts=records.journal.filter(e=>e.event==='REQUEST'&&e.request.method==='exposurePositionCount');
 assert(counts.length>0&&counts.every(q=>BigInt(responses.get(q.id))===1n),'AGGREGATE_OI_COMPARISON_REQUIRES_ONE_POSITION');
 const origin=unsigned(series[0]),E=origin+unsigned(series[1])*unsigned(series[2]);assert.equal(epoch.result[0][0],origin.toString());assert.equal(epoch.result[0][1],E.toString());
 const prices=verified.history.legs.map(leg=>{
  const row=one('LocalFuturesPartialV11','linkedExit',v=>v.args[0]===pid&&v.args[1]===leg.sequence&&v.args[2]===leg.final),p=row.result[0];
  assert.equal(p[1],leg.timestamp);assert.equal(p[10],leg.receipt);
  return {sequence:leg.sequence,market18:p[4],collateral18:p[5],marketTime:p[6],collateralTime:p[7],provenance:'LOCAL_MOCK_NOT_APPROVED',reference:row.resultKeccak};
 });
 const input={schema:'LQC_PURE_EXIT_DIAGNOSTIC_INPUT_V1',
 source:{kind:'UNAPPROVED_RECORDED_INPUT',semanticCommitment:verified.semanticCommitment,scope:{chainId:s.chainId,account:h.account,domain,series:seriesId,pid}},
 units:{quantity:'USD18_NOTIONAL',marketPrice:'FIXED_18',collateralPrice:'FIXED_18',collateralDecimals:domainView[6]},
 position:{side:unsigned(h.transitions[0][5])>0n?'LONG':'SHORT',entryPrice18:basis[7],initialQuantity18:basis[1]},
 cutoff:E.toString(),officialEpochs:[{epoch:'1',from:origin.toString(),to:E.toString()}],
 transitions:h.transitions.map(t=>({timestamp:t[0],pid:t[1],sequence:t[2],oldL:t[3],oldS:t[4],nextL:t[5],nextS:t[6],receipt:t[7]})),prices,
 policies:{calculation:null,freshness:null,fundingAllocation:null,gap:null,integerization:null,dust:null},
 funding:epoch.result[0][10]!=='3'?{kind:'UNFINALIZED_RECORDED',state:epoch.result[0][10],reference:epoch.resultKeccak}:null,
 observedIntegrals:{official:{long:epoch.result[0][3],short:epoch.result[0][4]},gap:{long:gap.result[0][6],short:gap.result[0][7]}},submittedIntervals:null};
 const result=evaluateDiagnostics(input);
 result.blockers=[...new Set([...verified.blockers,...result.blockers])];
 result.inputVerification={status:'VERIFIED_BY_UNCHANGED_TASK_2_49_LOCAL_PATH',sourceSemanticCommitment:verified.semanticCommitment,rawByteHashes:verified.rawByteHashes,chainEvidenceTrust:'LOCAL_ANVIL_NOT_INDEPENDENT_CHAIN_PROOF',officialIntegralComparison:'AGGREGATE_MATCH_UNDER_VERIFIED_SINGLE_POSITION_FIXTURE'};
 return {input,result};
}
