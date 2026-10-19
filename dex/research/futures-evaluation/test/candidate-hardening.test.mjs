
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Interface,keccak256,getAddress,ZeroAddress} from 'ethers';
import {loadTestOnlyCandidate,readCandidateRecordsForUnitTests,inspectCandidateRecordsForUnitTests as inspect,checkIndependentSpecForUnitTests} from '../lib/candidate-adapter-v3.mjs';
import {argsFor,normalizeAbi} from '../lib/candidate-schema-v3.mjs';
import {semanticCallCommitment} from '../lib/semantic-commitment.mjs';
const cases=[],rejections=[];const test=(name,fn)=>cases.push({name,fn});
const qfind=(r,p)=>r.journal.find(e=>e.event==='REQUEST'&&p(e.request));
function rejectAt(name,fn,stage,reason,passed=[]){
 assert.throws(fn,e=>{assert.equal(e.verificationStage,stage);assert.match(e.message,reason);for(const p of passed)assert(e.completedStages?.includes(p),'TARGET_PRECONDITION_STAGE_NOT_COMPLETED:'+p);rejections.push({case:name,stage,message:e.message,completedStages:e.completedStages??[],reexecutedChain:false});return true;});
}
test('accepts candidate with independent requirements and unchanged blockers',()=>{const x=loadTestOnlyCandidate();assert(x.independentSpec.requiredConcreteQueries>100);assert(x.verifiedStages.includes('HISTORY'));assert.equal(x.inputCommitment,x.semanticCommitment);assert.equal(x.evaluationStatus,'NOT_EVALUATED');assert.equal(x.monetaryResult,null);assert.equal(x.fundsAuthority,false);assert.equal(x.settlementAuthorized,false);assert(x.blockers.includes('POLICY_EVIDENCE_MISSING'));assert(x.blockers.includes('PRICE_APPROVAL_EVIDENCE_MISSING'));});
test('independent specification rejects deletion from both candidate and candidate replay inventory',()=>{
 const r=readCandidateRecordsForUnitTests(),replay=JSON.parse(fs.readFileSync(new URL('../test-only-expectations.json',import.meta.url)));
 const ids=new Set(r.journal.filter(e=>e.event==='REQUEST'&&e.request.method==='traces').map(e=>e.id));
 r.journal=r.journal.filter(e=>!ids.has(e.id));r.scope.finalViews=r.scope.finalViews.filter(v=>v.method!=='traces');
 replay.requests=replay.requests.filter(q=>q.method!=='traces');replay.finalViewQueries=replay.finalViewQueries.filter(q=>q.method!=='traces');
 assert.deepEqual(r.journal.filter(e=>e.event==='REQUEST').map(e=>e.request),replay.requests,'CANDIDATE_REPLAY_COMPARISON_PASSES');
 assert.deepEqual(r.scope.finalViews.map(({role,address,method,args,blockTag,queryBlockHash})=>({role,address,method,args,blockTag,queryBlockHash})),replay.finalViewQueries);
 rejectAt('co-deletion traces',()=>checkIndependentSpecForUnitTests(r),'INDEPENDENT_SPEC',/INDEPENDENT_REQUIRED_QUERY_MISSING:LocalFuturesAttribution.traces/);
});
test('one conflicting success among repeated same-Q calls is rejected',()=>{
 const r=readCandidateRecordsForUnitTests(),e=qfind(r,q=>q.method==='preparedStateVerifier'),iface=new Interface(['function preparedStateVerifier() view returns(address)']);
 r.journal.find(x=>x.event==='RESPONSE'&&x.id===e.id).response=iface.encodeFunctionResult('preparedStateVerifier',[r.scope.contracts[0].address]);
 rejectAt('one repeat response',()=>inspect(r),'JOURNAL',/RPC_REPEAT_RESPONSE_CONFLICT/,['SCHEMA','SCOPE']);
});
test('consistent declared wrong runtime pin reaches contract pin comparison',()=>{
 const r=readCandidateRecordsForUnitTests(),i=12,h='0x'+'11'.repeat(32);r.scope.contracts[i].runtimeHash=h;r.code.contracts[i].runtimeHash=h;r.manifest.scope.contracts[i].runtimeHash=h;
 rejectAt('contract pin after consistent manifest',()=>inspect(r),'CONTRACTS',/CONTRACT_ROLE_OR_PIN_MISMATCH/,['SCHEMA','SCOPE','JOURNAL','INDEPENDENT_SPEC','VIEWS']);
});
for(const field of ['blockTag','queryBlockHash'])test('contract '+field+' is directly bound to Q',()=>{
 const r=readCandidateRecordsForUnitTests(),v=field==='blockTag'?'0x40':'0x'+'11'.repeat(32);r.scope.contracts[12][field]=v;r.code.contracts[12][field]=v;
 rejectAt('contract '+field,()=>inspect(r),'CONTRACTS',field==='blockTag'?/CONTRACT_QUERY_BLOCK_TAG/:/CONTRACT_QUERY_BLOCK_HASH/,['SCOPE','JOURNAL','INDEPENDENT_SPEC','VIEWS']);
});
test('internally consistent response-view mutation reaches final receipt conflict check',()=>{
 const r=readCandidateRecordsForUnitTests(),view=r.scope.finalViews.find(v=>v.role==='LocalFuturesPartialV11'&&v.method==='linkedExit'&&v.args[1]==='0'&&v.args[2]===true);
 const artifact=JSON.parse(fs.readFileSync(new URL('../fixtures/artifact-records/LocalFuturesPartialV11.json',import.meta.url))),iface=new Interface(artifact.abi);
 view.result[0][2]=(BigInt(view.result[0][2])+1n).toString();const encoded=iface.encodeFunctionResult('linkedExit',view.result);view.resultKeccak=keccak256(encoded);
 for(const e of r.journal)if(e.event==='REQUEST'&&e.request.rpc==='eth_call'&&e.request.target?.toLowerCase()===view.address.toLowerCase()&&e.request.method==='linkedExit'&&e.request.caller===ZeroAddress&&JSON.stringify(argsFor(iface,'linkedExit',e.request.args))===JSON.stringify(argsFor(iface,'linkedExit',view.args)))r.journal.find(x=>x.event==='RESPONSE'&&x.id===e.id).response=encoded;
 rejectAt('final receipt after all front checks',()=>inspect(r),'HISTORY',/CONFLICTING_REPEATED_FINAL_RECEIPT/,['SCHEMA','SCOPE','JOURNAL','INDEPENDENT_SPEC','VIEWS','CONTRACTS','HEADERS_RECEIPTS']);
});
test('non-authoritative annotations do not affect decision or semantic commitment',()=>{
 const r=readCandidateRecordsForUnitTests(),a=inspect(r);r.scope.journalSummary='IGNORED_ANNOTATION_49';r.manifest.requiredQuerySummary='IGNORED_ANNOTATION_49';r.scope.fixedBlockCalls={unverified:'IGNORED_ANNOTATION_49'};r.scope.toolsAndSettings={unverified:'IGNORED_ANNOTATION_49'};
 const b=inspect(r);assert.equal(a.semanticCommitment,b.semanticCommitment);assert.equal(a.status,b.status);assert(!JSON.stringify(b).includes('IGNORED_ANNOTATION_49'));
});
test('ABI integer representations share meaning while serialized bytes differ',()=>{
 const r=readCandidateRecordsForUnitTests(),a=inspect(r),before=Buffer.from(r.journal.map(x=>JSON.stringify(x)).join('\n')+'\n');
 qfind(r,q=>q.method==='traces').request.args=[1];const after=Buffer.from(r.journal.map(x=>JSON.stringify(x)).join('\n')+'\n'),b=inspect(r);
 const sha=x=>createHash('sha256').update(x).digest('hex');assert.notEqual(sha(before),sha(after));assert.equal(a.semanticCommitment,b.semanticCommitment);assert.equal(a.inputCommitment,b.inputCommitment);
});
const iface=new Interface(['function alpha(uint256) view returns(uint256)','function beta(uint256) view returns(uint256)']);
function call(method='alpha',args=['1']){return {rpc:'eth_call',target:'0x0000000000000000000000000000000000000001',caller:ZeroAddress,method,args,blockTag:'0x41',queryBlockHash:'0x'+'11'.repeat(32)};}
test('different method signatures have different semantic commitments',()=>assert.notEqual(semanticCallCommitment(iface,call('alpha'),'31337'),semanticCallCommitment(iface,call('beta'),'31337')));
test('different arguments have different semantic commitments',()=>assert.notEqual(semanticCallCommitment(iface,call('alpha',['1']),'31337'),semanticCallCommitment(iface,call('alpha',['2']),'31337')));
test('different callers have different semantic commitments',()=>{const q=call();q.caller=q.target;assert.notEqual(semanticCallCommitment(iface,call(),'31337'),semanticCallCommitment(iface,q,'31337'));});
test('different targets have different semantic commitments',()=>{const q=call();q.target='0x0000000000000000000000000000000000000002';assert.notEqual(semanticCallCommitment(iface,call(),'31337'),semanticCallCommitment(iface,q,'31337'));});
test('different chain scopes have different semantic commitments',()=>assert.notEqual(semanticCallCommitment(iface,call(),'31337'),semanticCallCommitment(iface,call(),'1')));
test('different ABI widths preserve type identity',()=>{const narrow=new Interface(['function alpha(uint8) view returns(uint256)']);assert.notEqual(semanticCallCommitment(iface,call(),'31337'),semanticCallCommitment(narrow,call(),'31337'));});
test('unsigned integer width overflow stays rejected',()=>assert.throws(()=>normalizeAbi('uint8','256'),/ABI_INTEGER_RANGE/));
test('signed input is explicitly unsupported',()=>assert.throws(()=>normalizeAbi('int256','-1'),/UNSUPPORTED_ABI_SIGNED/));
test('tuple input is explicitly unsupported',()=>assert.throws(()=>normalizeAbi('(uint256,address)',['1',ZeroAddress]),/UNSUPPORTED_ABI_TUPLE/));
test('overload is explicitly unsupported even with a full signature',()=>{const overloaded=new Interface(['function alpha(uint8) view returns(uint256)','function alpha(uint256) view returns(uint256)']);assert.throws(()=>argsFor(overloaded,'alpha(uint8)',['1']),/UNSUPPORTED_ABI_OVERLOAD/);});
test('unknown authoritative nested header field is rejected',()=>{const r=readCandidateRecordsForUnitTests();r.scope.queryHeaderBefore.unknown=true;rejectAt('nested header field',()=>inspect(r),'SCHEMA',/ADDITIONAL_FIELD/);});
test('malformed authoritative receipt quantity is rejected',()=>{const r=readCandidateRecordsForUnitTests();r.scope.receipts[0].raw.blockNumber=55;rejectAt('nested receipt quantity',()=>inspect(r),'SCHEMA',/INVALID_RPC_QUANTITY/);});
describe('task 2/49 independent query and semantic hardening',()=>{for(const {name,fn}of cases)it(name,fn);});
if(typeof after==='function')after(()=>{if(process.env.LQC49_REJECTIONS)fs.writeFileSync(process.env.LQC49_REJECTIONS,JSON.stringify(rejections,null,2));});
export const plannedNames=cases.map(c=>'task 2/49 independent query and semantic hardening '+c.name);
