import { validateConsumedNested, headerMeaning } from './authoritative-fields.mjs';
import { assertIndependentQueries, LINK_TARGETS, HASH_LINKS } from './independent-query-spec.mjs';
import { callMeaning, candidateSemanticCommitment } from './semantic-commitment.mjs';

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Interface,AbiCoder,keccak256,toUtf8Bytes,getAddress,ZeroAddress} from 'ethers';
import {TEST_EXPECTATIONS_SHA256} from './candidate-test-anchor.mjs';
import {record,dense,uint,hash32,canonical,eq,exact,list,argsFor,validateVersion} from './candidate-schema-v3.mjs';
const ROOT=fileURLToPath(new URL('../',import.meta.url)),FIX=path.join(ROOT,'fixtures/task-2-45');
const sha=b=>createHash('sha256').update(b).digest('hex');
const bytes=fs.readFileSync(path.join(ROOT,'test-only-expectations.json'));assert.equal(sha(bytes),TEST_EXPECTATIONS_SHA256,'TEST_EXPECTATION_HASH_MISMATCH');
const E=JSON.parse(bytes),base=path.join(FIX,'candidate');
assert.equal(E.purpose,'TEST_ONLY_NOT_OPERATIONAL_TRUST');
const peerRoles=['LocalFuturesTradingCore','LocalFuturesFundingV11','LocalFuturesPartialV11','LocalFuturesExposureLedger','LocalFuturesAttribution','LocalFuturesSettlementCoordinator','LocalFuturesCollectionExecutor','LocalFuturesPayoutSpecification','LocalFuturesPayoutExecutor','LocalFuturesWithdrawalVerifier','LocalFuturesReleaseVerifier','LocalFuturesLinkedExposureVerifier'];
const extraRoles=['Registry','Token','CollateralOracle','MarketOracle','PreparedStateVerifier','OperationPolicy','TradingPreflightVerifier'];
function artifact(name){assert(E.contracts.some(c=>c.name===name),'UNKNOWN_FIXTURE_ARTIFACT');return JSON.parse(fs.readFileSync(path.join(ROOT,'fixtures/artifact-records',name+'.json')));}
const interfaces=new Map(E.contracts.map(c=>[c.address.toLowerCase(),new Interface(artifact(c.name).abi)]));
const contractByRole=new Map(E.contracts.map(c=>[c.role,c]));
const addr=x=>getAddress(x), lower=x=>addr(x).toLowerCase();
function queryKey(q){
 if(q.rpc==='eth_call'&&q.target){
  exact(q,['phase','rpc','target','artifact','method','args','caller','blockTag','queryBlockHash','required']);
  const c=E.contracts.find(c=>lower(c.address)===lower(q.target));assert(c,'UNKNOWN_QUERY_TARGET');assert.equal(q.artifact,c.name,'QUERY_ARTIFACT_MISMATCH');assert.equal(q.required,true);
  return canonical({...q,target:addr(q.target),caller:addr(q.caller),args:argsFor(interfaces.get(lower(q.target)),q.method,q.args)});
 }
 const exemplar=E.requests.find(x=>x.phase===q.phase&&x.rpc===q.rpc);assert(exemplar,'UNPLANNED_RPC');exact(q,Object.keys(exemplar));canonical(q);return canonical(q);
}
const expectedCounts=new Map();for(const q of E.requests){const key=queryKey(q);expectedCounts.set(key,(expectedCounts.get(key)||0)+1);}
export function readCandidateRecordsForUnitTests(){
 return {manifest:JSON.parse(fs.readFileSync(path.join(base,'review-candidate-manifest.json'))),scope:JSON.parse(fs.readFileSync(path.join(base,'scope-evidence.json'))),code:JSON.parse(fs.readFileSync(path.join(base,'contract-code.json'))),journal:fs.readFileSync(path.join(base,'query-journal.jsonl'),'utf8').trim().split('\n').map(JSON.parse)};
}
function verifyJournal(journal,scope){
 list(journal,4096);const requests=new Map(),responses=new Map(),seen=new Map();
 for(const event of journal){
  assert.equal(event.runId,E.runId,'JOURNAL_RUN_MISMATCH');
  assert(event.event==='REQUEST'||event.event==='RESPONSE','JOURNAL_FAILURE_OR_UNKNOWN_EVENT');
  exact(event,event.event==='REQUEST'?['runId','event','id','request']:['runId','event','id','response']);
  assert(Number.isSafeInteger(event.id)&&event.id>0,'INVALID_RPC_ID');
  if(event.event==='REQUEST'){assert(!requests.has(event.id),'DUPLICATE_REQUEST_ID');requests.set(event.id,event.request);const key=queryKey(event.request);seen.set(key,(seen.get(key)||0)+1);}
  else {assert(requests.has(event.id)&&!responses.has(event.id),'DUPLICATE_OR_ORPHAN_RESPONSE');responses.set(event.id,event.response);}
 }
 assert.equal(requests.size,responses.size,'MISSING_SUCCESS_RESPONSE');
 eq([...seen].sort(),[...expectedCounts].sort(),'EXPECTED_QUERY_MULTISET_MISMATCH');
 for(const[id,q]of requests){
  const response=responses.get(id);assert(response!==null&&response!==undefined,'NULL_REQUIRED_RESPONSE');
  if(q.rpc==='eth_call'){const iface=interfaces.get(lower(q.target));iface.decodeFunctionResult(q.method,response);}
  if(['FINAL_STATE','FINAL_CODE','FINAL_DISCOVERY'].includes(q.phase)){assert.equal(q.blockTag,scope.queryBlock.blockTag,'QUERY_BLOCK_TAG');assert.equal(q.queryBlockHash,scope.queryBlock.hash,'QUERY_BLOCK_HASH');}
  if(q.rpc==='eth_chainId')assert.equal(BigInt(response).toString(),E.scope.chainId,'CHAIN_ID_MISMATCH');
 }
 const repeated=new Map();for(const[id,q]of requests)if(q.rpc==='eth_call'){const k=canonical(callMeaning(interfaces.get(lower(q.target)),q,scope.chainId)),raw=responses.get(id).toLowerCase();if(repeated.has(k))assert.equal(raw,repeated.get(k),'RPC_REPEAT_RESPONSE_CONFLICT');else repeated.set(k,raw);}
 return {requests,responses};
}
function valuesFor(state,role,method,args=[]){
 const c=contractByRole.get(role),iface=interfaces.get(lower(c.address)),norm=argsFor(iface,method,args);
 const rows=state.scope.finalViews.filter(v=>v.role===role&&v.method===method&&canonical(argsFor(iface,method,v.args))===canonical(norm));
 assert(rows.length>0,'MISSING_FINAL_VIEW:'+role+'.'+method);for(const row of rows)eq(row.result,rows[0].result,'CONFLICTING_FINAL_VIEW');return rows[0].result;
}
function verifyViews(state){
 const {scope,journalState}=state,expected=new Map(),actual=new Map();
 const rows=E.finalViewQueries;assert(Array.isArray(rows),'EXPECTED_VIEW_PLAN_MISSING');
 const viewKey=v=>{const c=contractByRole.get(v.role);assert(c,'UNKNOWN_VIEW_ROLE');assert.equal(addr(v.address),addr(c.address),'VIEW_TARGET');assert.equal(v.blockTag,scope.queryBlock.blockTag);assert.equal(v.queryBlockHash,scope.queryBlock.hash);return canonical({role:v.role,address:addr(v.address),method:v.method,args:argsFor(interfaces.get(lower(v.address)),v.method,v.args),blockTag:v.blockTag,queryBlockHash:v.queryBlockHash});};
 for(const v of rows){const k=viewKey(v);expected.set(k,(expected.get(k)||0)+1);}
 for(const v of list(scope.finalViews)){
  exact(v,['role','address','method','args','rpc','blockTag','queryBlockHash','result','resultKeccak']);assert.equal(v.rpc,'eth_call');
  const k=viewKey(v);actual.set(k,(actual.get(k)||0)+1);const iface=interfaces.get(lower(v.address));
  const matches=[...journalState.requests].filter(([,q])=>q.rpc==='eth_call'&&lower(q.target)===lower(v.address)&&q.method===v.method&&q.caller===ZeroAddress&&canonical(argsFor(iface,q.method,q.args))===canonical(argsFor(iface,v.method,v.args)));
  assert(matches.length>0&&matches.every(([id])=>{const raw=journalState.responses.get(id);return keccak256(raw)===v.resultKeccak&&canonical(iface.decodeFunctionResult(v.method,raw).toArray(true).map(x=>plain(x)))===canonical(v.result);}), 'FINAL_VIEW_RESPONSE_MISMATCH');
 }
 eq([...actual].sort(),[...expected].sort(),'EXPECTED_FINAL_VIEW_MULTISET_MISMATCH');
}
function plain(x){return JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v));}
function verifyContracts(state){
 const {scope,code}=state;exact(code,['schema','runId','queryBlock','contracts']);assert.equal(code.schema,'LQC_FIXED_BLOCK_CODE_V1');assert.equal(code.runId,E.runId);eq(code.queryBlock,scope.queryBlock,'CODE_QUERY_SCOPE');
 assert.equal(scope.contracts.length,19,'CONTRACT_ROLE_COUNT');assert.equal(code.contracts.length,19,'CONTRACT_CODE_COUNT');
 const roles=new Set();for(let i=0;i<19;i++){
  const c=scope.contracts[i],e=E.contracts[i];exact(c,['role','name','address','expectedHash','rpc','blockTag','queryBlockHash','runtimeHash']);
  assert.equal(c.rpc,'eth_getCode','CONTRACT_CODE_RPC');assert.equal(c.blockTag,scope.queryBlock.blockTag,'CONTRACT_QUERY_BLOCK_TAG');assert.equal(c.queryBlockHash,scope.queryBlock.hash,'CONTRACT_QUERY_BLOCK_HASH');
  assert(!roles.has(c.role),'DUPLICATE_CONTRACT_ROLE');roles.add(c.role);
  eq({role:c.role,name:c.name,address:c.address,runtimeHash:c.runtimeHash},e,'CONTRACT_ROLE_OR_PIN_MISMATCH');
  if(c.expectedHash!==null)assert.equal(c.expectedHash,c.runtimeHash,'CONTRACT_DECLARED_PIN_MISMATCH');
  const b=code.contracts[i];eq(Object.fromEntries(Object.entries(b).filter(([k])=>k!=='runtimeCode')),c,'CONTRACT_CODE_RECORD_MISMATCH');
  assert.equal(keccak256(b.runtimeCode),c.runtimeHash,'RUNTIME_HASH_MISMATCH');
  const qs=[...state.journalState.requests].filter(([,q])=>q.rpc==='eth_getCode'&&q.phase==='FINAL_CODE'&&q.target===c.address);
  assert(qs.length===1&&state.journalState.responses.get(qs[0][0])===b.runtimeCode,'CODE_JOURNAL_MISMATCH');
 }
 eq(scope.contracts.slice(0,12).map(c=>({address:c.address,runtimeHash:c.runtimeHash})),E.oldPeers,'OLD_PEER_PINS_CHANGED');
 eq(scope.contracts.slice(0,12).map(c=>c.role),peerRoles,'PEER_ROLE_ORDER');
 eq(scope.contracts.slice(12).map(c=>c.role),extraRoles,'EXTRA_ROLE_ORDER');
 const link=LINK_TARGETS;
 for(const v of scope.finalViews)if(v.args.length===0&&link[v.method])assert.equal(lower(v.result[0]),lower(contractByRole.get(link[v.method]).address),'CONNECTION_MISMATCH');
 for(let i=0;i<12;i++){assert.equal(addr(valuesFor(state,'Registry','peers',[i])[0]),E.contracts[i].address);assert.equal(valuesFor(state,'Registry','approvedCodeHashes',[i])[0],E.contracts[i].runtimeHash);}
 for(const[role,method,target]of HASH_LINKS)assert.equal(valuesFor(state,role,method)[0],contractByRole.get(target).runtimeHash,'VERIFIER_CODE_PIN');
}
function verifyHeadersAndReceipts(state){
 const {scope,journalState}=state,Q=scope.queryBlock;eq(Q,E.scope.Q,'QUERY_SCOPE_MISMATCH');uint(Q.number);hash32(Q.hash);assert.equal(BigInt(Q.blockTag).toString(),Q.number);
 const rpcRows=(method)=>[...journalState.requests].filter(([,q])=>q.rpc===method).map(([id,q])=>({q,value:journalState.responses.get(id)}));
 for(const h of [scope.queryHeaderBefore,scope.queryHeaderAfter]){assert.equal(h.hash,Q.hash,'Q_HEADER_HASH');assert.equal(BigInt(h.number).toString(),Q.number);assert.equal(BigInt(h.timestamp).toString(),Q.timestamp);assert(rpcRows('eth_getBlockByNumber').some(x=>canonical(headerMeaning(x.value))===canonical(headerMeaning(h))),'Q_HEADER_JOURNAL');}
 assert.equal(scope.queryHashUnchanged,true);exact(scope.chain,['beforeRaw','afterRaw','unchanged']);assert.equal(scope.chain.beforeRaw,scope.chain.afterRaw);assert.equal(BigInt(scope.chain.beforeRaw).toString(),E.scope.chainId);assert.equal(scope.chain.unchanged,true);
 const hashes=new Set();for(const r of list(scope.receipts,32)){
  exact(r,['label','rpc','raw','blockHeader','blockTimestamp']);const x=r.raw;assert(!hashes.has(x.transactionHash),'DUPLICATE_TRANSACTION_RECEIPT');hashes.add(x.transactionHash);
  assert.equal(x.status,'0x1','RECEIPT_FAILED');assert(BigInt(x.blockNumber)<=BigInt(Q.number),'RECEIPT_AFTER_Q');assert.equal(r.blockHeader.hash,x.blockHash);assert.equal(r.blockHeader.number,x.blockNumber);assert.equal(BigInt(r.blockHeader.timestamp).toString(),r.blockTimestamp);
  assert.equal(r.blockHeader.transactions[Number(BigInt(x.transactionIndex))],x.transactionHash);
  assert(rpcRows('eth_getTransactionReceipt').some(({q,value})=>q.params[0]===x.transactionHash&&canonical(value)===canonical(x)),'RECEIPT_JOURNAL_MISMATCH');
  assert(rpcRows('eth_getBlockByNumber').some(({q,value})=>q.params[0]===x.blockNumber&&canonical(headerMeaning(value))===canonical(headerMeaning(r.blockHeader))),'TRANSACTION_BLOCK_JOURNAL_MISMATCH');
  for(const log of x.logs){assert.equal(log.transactionHash,x.transactionHash);assert.equal(log.blockHash,x.blockHash);assert.equal(log.blockNumber,x.blockNumber);}
  const t=scope.scenarioEvidence.timedTransactions.filter(t=>t.hash===x.transactionHash);assert.equal(t.length,1);assert.equal(String(t[0].block),BigInt(x.blockNumber).toString());assert.equal(t[0].blockHash,x.blockHash);assert.equal(t[0].timestamp,r.blockTimestamp);assert.equal(t[0].status,1);
 }
 assert.equal(scope.receipts.length,9,'RECEIPT_COUNT');assert.equal(scope.scenarioEvidence.timedTransactions.length,9);
}
function verifyHistory(state){
 const {scope}=state;const h=scope.history[0];
 const ctx=valuesFor(state,peerRoles[0],'coreExposureContext',[h.pid]),basis=valuesFor(state,peerRoles[2],'linkedBasis',[h.pid])[0],trace=valuesFor(state,peerRoles[4],'traces',[h.pid]),log=valuesFor(state,peerRoles[4],'logs',[h.accountKey]),series=valuesFor(state,peerRoles[1],'fundingSeries',[ctx[1][0],ctx[1][1]]);
 assert.equal(ctx[0],h.account);assert.equal(trace[1],h.account);assert.equal(trace[2],ctx[1][0]);assert.equal(trace[3],ctx[1][1]);
 assert.equal(h.count,log[0]);assert.equal(log[1],'0');assert.equal(log[2],'0');assert.equal(ctx[1][3],'0');assert.equal(ctx[1][4],'0');assert.equal(trace[6],'0');
 for(const seq of [ctx[1][2],basis[5],trace[7],valuesFor(state,peerRoles[4],'finalOrdinal',[h.pid])[0],valuesFor(state,peerRoles[1],'coreExposureSequences',[basis[0]])[0]])assert.equal(seq,h.finalSequence,'FINAL_SEQUENCE_MISMATCH');
 const coder=AbiCoder.defaultAbiCoder(),key=keccak256(coder.encode(['address','address','uint256','uint256','address','uint256','bytes32'],[E.contracts[0].address,E.contracts[1].address,ctx[1][0],ctx[1][1],h.account,h.pid,ctx[2]]));assert.equal(key,basis[0]);assert.equal(trace[0],key);
 const accountKey=keccak256(coder.encode(['address','address','address','address','uint256','uint256','bytes32','address'],[E.contracts[4].address,E.contracts[2].address,E.contracts[0].address,E.contracts[1].address,ctx[1][0],ctx[1][1],ctx[2],h.account]));assert.equal(accountKey,h.accountKey);
 const cutoff=uint(series[0][0])+uint(series[0][1])*uint(series[0][2]);assert.equal(cutoff.toString(),scope.scenarioEvidence.end);
 list(h.transitions,256);assert.equal(h.transitions.length,Number(uint(h.count)),'HISTORY_COUNT_MISMATCH');
 let L=0n,S=0n,last=uint(series[0][0]),closed=0n;const legs=[],seen=new Set();
 for(let i=0;i<h.transitions.length;i++){
  const t=h.transitions[i];list(t,8);assert.equal(t.length,8);t.slice(0,7).forEach(uint);hash32(t[7]);assert.equal(t[1],h.pid);assert.equal(t[2],String(i+1),'TRANSITION_SEQUENCE');assert(!seen.has(t[7]),'DUPLICATE_HISTORY_RECEIPT');seen.add(t[7]);
  const time=uint(t[0]);assert(time>=last&&time<=uint(scope.queryBlock.timestamp),'TRANSITION_TIME');assert.equal(uint(t[3]),L);assert.equal(uint(t[4]),S);
  const nl=uint(t[5]),ns=uint(t[6]);assert(!(nl&&ns));const delta=L+S-nl-ns;
  eq(valuesFor(state,peerRoles[4],'transition',[ctx[1][0],h.account,String(i+1)])[0],t,'TRANSITION_QUERY_MISMATCH');
  assert.equal(keccak256(coder.encode(['bytes32','uint256','uint256','uint256','uint256','uint256','uint256'],[key,t[2],t[0],...t.slice(3,7)])),t[7],'TRANSITION_RECEIPT_HASH');
  const matches=[];for(const r of scope.receipts)for(const l of r.raw.logs){if(lower(l.address)!==lower(E.contracts[4].address))continue;let event;try{event=interfaces.get(lower(l.address)).parseLog(l);}catch{continue;}if(event?.name==='Recorded'&&event.args[1].toString()===h.pid&&event.args[2].toString()===t[2]&&event.args[4]===t[7])matches.push(r);}
  assert.equal(matches.length,1,'TRANSITION_TRANSACTION_LINK');assert.equal(matches[0].blockTimestamp,t[0]);
  if(i===0){assert.equal((nl+ns).toString(),basis[1]);assert(time<cutoff);}
  else {assert(delta>0n&&nl<=L&&ns<=S,'INVALID_REDUCTION');closed+=delta;const final=nl+ns===0n,exit=valuesFor(state,peerRoles[2],'linkedExit',[h.pid,t[2],final])[0];
   assert.equal(exit[0],final?'2':'3');assert.equal(exit[1],t[0]);assert.equal(exit[3],closed.toString());assert.equal(exit[8],cutoff.toString());assert.equal(exit[10],t[7]);
   legs.push({pid:h.pid,sequence:t[2],timestamp:t[0],quantity:delta.toString(),cumulativeClosed:closed.toString(),final,receipt:t[7],transactionHash:matches[0].raw.transactionHash,block:BigInt(matches[0].raw.blockNumber).toString(),boundary:time<cutoff?'BEFORE_E':time===cutoff?'AT_E':'AFTER_E',evaluationStatus:'NOT_EVALUATED',monetaryResult:null});
  }L=nl;S=ns;last=time;
 }
 assert.equal(L+S,0n);assert.equal(closed.toString(),basis[1]);assert.equal(closed.toString(),basis[3]);assert.equal(log[3],last.toString());
 const finalRows=scope.finalViews.filter(v=>v.role===peerRoles[2]&&v.method==='linkedExit'&&argsFor(interfaces.get(lower(v.address)),v.method,v.args)[0]===h.pid&&v.args[2]===true);assert(finalRows.length>0);for(const r of finalRows)eq(r.result,finalRows[0].result,'CONFLICTING_REPEATED_FINAL_RECEIPT');assert.equal(legs.filter(l=>l.final).length,1,'FINAL_EXIT_COUNT');
 const snap=scope.scenarioEvidence.stages.at(-1).snapshot;assert.equal(snap.state.positions.length,1);const pos=snap.state.positions[0];assert.equal(pos.pid,h.pid);assert.equal(pos.ledgerSequence,h.finalSequence);assert.equal(pos.position[4],h.finalSequence);assert.equal(pos.position[3],'0');eq(pos.context,ctx,'FINAL_SNAPSHOT_CONTEXT');eq(pos.basis,basis,'FINAL_SNAPSHOT_BASIS');
 return {account:h.account,domain:ctx[1][0],series:ctx[1][1],pid:h.pid,count:h.count,sequence:h.finalSequence,cumulativeClosed:closed.toString(),legs};
}
// Semantic verifier is exposed solely for mutation unit tests, not as a trusted source loader.

export const NON_AUTHORITATIVE_FIELDS=[
 'scope.journalSummary','manifest.requiredQuerySummary','scope.registryOnlyValidation','scope.genesis','scope.clientVersion','scope.historicalCodeProbe','scope.toolsAndSettings','scope.fixedBlockCalls','scope.scenarioFinalReads',
 'scenarioEvidence fields except end, timedTransactions, final stages.snapshot.state.positions',
 'final snapshot position fields except pid, position, context, ledgerSequence, basis',
 'block header fields except hash, number, timestamp, transactions'
];
function withStage(name,fn,completed){try{const value=fn();completed.push(name);return value;}catch(error){error.verificationStage??=name;error.completedStages=[...completed];throw error;}}
export function inspectCandidateRecordsForUnitTests(records){
 const completed=[];exact(records,['manifest','scope','code','journal']);const {manifest:m,scope:s}=records;
 withStage('SCHEMA',()=>{validateVersion(m,s);validateConsumedNested(s,records.code);},completed);
 withStage('SCOPE',()=>{assert.equal(m.runId,E.runId);assert.equal(s.runId,E.runId);assert.equal(s.chainId,E.scope.chainId);eq(m.scope.queryBlock,E.scope.Q,'MANIFEST_Q');
 assert.equal(m.scope.evidenceSchema,E.scope.schema);assert.equal(m.scope.schemaVersion,E.scope.version);assert.equal(m.scope.chainId,E.scope.chainId);
 eq(m.scope.contracts,s.contracts.map(({role,address,runtimeHash})=>({role,address,runtimeHash})),'MANIFEST_CONTRACT_SCOPE'); list(s.history,1);assert.equal(s.history.length,1,'SINGLE_POSITION_ONLY');const h=s.history[0];exact(h,['pid','account','accountKey','count','finalSequence','transitions']);eq({pid:h.pid,account:h.account,accountKey:h.accountKey,count:h.count,finalSequence:h.finalSequence},E.historyScope[0],'HISTORY_SCOPE');},completed);
 const state={...records,journalState:withStage('JOURNAL',()=>verifyJournal(records.journal,s),completed)};
 const independentSpec=withStage('INDEPENDENT_SPEC',()=>assertIndependentQueries(s,state.journalState,E.contracts,interfaces),completed);
 withStage('VIEWS',()=>verifyViews(state),completed);withStage('CONTRACTS',()=>verifyContracts(state),completed);
 withStage('HEADERS_RECEIPTS',()=>verifyHeadersAndReceipts(state),completed);const history=withStage('HISTORY',()=>verifyHistory(state),completed);
 const semanticCommitment=candidateSemanticCommitment(state,history,interfaces);
 return {status:'ACCEPTABLE_LOCAL_TEST_CANDIDATE',trust:'TEST_ONLY_LOCAL_ANVIL',schema:'LQC_EXIT_INPUT_CANDIDATE_V3',queryScope:s.queryBlock,history,
 inputCommitment:semanticCommitment,semanticCommitment,commitmentMeaning:'LQC_LOCAL_CANDIDATE_MEANING_V1: ABI-normalized calls, response hashes, multiplicities, bound scope, contracts, receipts, verified history; not raw file bytes',
 independentSpec,verifiedStages:completed,nonAuthoritativeFields:NON_AUTHORITATIVE_FIELDS,
 evaluationStatus:'NOT_EVALUATED',monetaryResult:null,fundsAuthority:false,settlementAuthorized:false,
 blockers:['POLICY_EVIDENCE_MISSING','PRICE_APPROVAL_EVIDENCE_MISSING','LOCAL_ANVIL_NOT_INDEPENDENT_CHAIN_PROOF','NOT_REGISTERED_AS_OPERATIONAL_TRUST']};
}
export function checkIndependentSpecForUnitTests(records){
 const requests=new Map(records.journal.filter(x=>x.event==='REQUEST').map(x=>[x.id,x.request])),responses=new Map(records.journal.filter(x=>x.event==='RESPONSE').map(x=>[x.id,x.response]));
 return assertIndependentQueries(records.scope,{requests,responses},E.contracts,interfaces);
}

export function loadTestOnlyCandidate(){
 const manifestBytes=fs.readFileSync(path.join(base,'review-candidate-manifest.json'));assert.equal(sha(manifestBytes),E.manifestSha256,'TEST_MANIFEST_HASH_MISMATCH');const records=readCandidateRecordsForUnitTests(),m=records.manifest,rawByteHashes={manifest:sha(manifestBytes)};
 const safe=(relative)=>{const f=path.resolve(base,relative);assert(f.startsWith(path.resolve(FIX)+path.sep),'EVIDENCE_PATH_ESCAPE');return f;};
 for(const [name,item]of Object.entries({...m.files,queryJournal:m.queryJournal,publicAllowlist:m.publicAllowlist,requiredQueryPlan:m.requiredQueryPlan})){exact(item,['path','sha256']);const b=fs.readFileSync(safe(item.path));assert.equal(sha(b),item.sha256,'RAW_FILE_HASH_MISMATCH:'+name);rawByteHashes[name]=sha(b);}
 for(const [file,hash]of Object.entries(m.sourceFileHashes)){const f=path.resolve(FIX,file);assert(f.startsWith(path.resolve(FIX)+path.sep));assert.equal(sha(fs.readFileSync(f)),hash,'SOURCE_FILE_HASH_MISMATCH');}
 for(const[name,hash]of Object.entries(m.artifactContentHashes))assert.equal(sha(Buffer.from(JSON.stringify(artifact(name),null,2))),hash,'ARTIFACT_HASH_MISMATCH');
 return {...inspectCandidateRecordsForUnitTests(records),rawByteHashes};
}
