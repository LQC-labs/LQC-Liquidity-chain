
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {assert,eq,freeze,hash,hash32,uint,address,strictWire,record,dense,ECONOMIC_POLICY_VERSION} from './policy-v1-common.mjs';
import {validatePolicyV1Config} from './policy-v1-config.mjs';
import {POLICY_V1_RESEARCH_FIXTURE_SHA256} from './policy-v1-test-reference.mjs';
import {EVALUATION_EVIDENCE_VARIATIONS_SHA256} from './shared-evaluation-evidence-reference.mjs';
const sources=new WeakMap();
export function loadPolicyV1ResearchCase(name){
 assert(typeof name==='string','CASE_NAME_REQUIRED');
 const bytes=fs.readFileSync(new URL('../fixtures/policy-v1/research-cases.json',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),POLICY_V1_RESEARCH_FIXTURE_SHA256,'RESEARCH_SOURCE_HASH_MISMATCH');
 const bundle=JSON.parse(bytes);assert.equal(bundle.purpose,'SYNTHETIC_TEST_ONLY_NOT_CHAIN_PROOF');
 assert(Object.hasOwn(bundle.cases,name),'UNKNOWN_RESEARCH_CASE');
 const source=freeze(bundle.cases[name]);assert.equal(source.kind,'SYNTHETIC_TEST_ONLY','SOURCE_KIND');
 const context=freeze({kind:'PINNED_SYNTHETIC_RESEARCH_SOURCE',caseId:name});sources.set(context,source);
 return {context,request:structuredClone(source.request)};
}
export function policyV1Source(context){assert(sources.has(context),'PINNED_SOURCE_CONTEXT_REQUIRED');return sources.get(context);}
export function historyMeaning(h){return {scope:h.scope,query:h.query,inventory:h.inventory,records:h.records,finalPositions:h.finalPositions};}
export function verifyPolicyV1History(context,request){
 const source=policyV1Source(context);strictWire(request);
 record(request,['config','history','priceSelections'],['attributions']);
 const config=validatePolicyV1Config(request.config);assert(config.state==='CONFIGURED_NOT_APPROVED','CONFIGURATION_INCOMPLETE');
 eq(request.config,source.request.config,'POLICY_COMMITMENT_MISMATCH');
 assert.equal(source.series.policySchema,ECONOMIC_POLICY_VERSION,'EXISTING_SERIES_NOT_V1');
 assert(uint(source.series.policyCommittedAt)<=uint(source.series.createdAt),'POLICY_COMMITTED_AFTER_SERIES');
 assert(uint(source.series.createdAt)<=uint(request.config.origin),'SERIES_CREATED_AFTER_ORIGIN');
 assert.equal(source.series.policyCommitment,config.policyCommitment,'SERIES_POLICY_COMMITMENT');
 const h=request.history;record(h,['scope','query','inventory','records','finalPositions','commitment']);eq(h.scope,request.config.scope,'HISTORY_SCOPE_MIX');eq(h.scope,source.request.history.scope,'SOURCE_SCOPE_MIX');
 record(h.query,['number','hash','timestamp','successorNumber','successorHash','successorParentHash','successorTimestamp']);
 hash32(h.query.hash);hash32(h.query.successorHash);assert.equal(h.query.successorParentHash,h.query.hash,'QUERY_SUCCESSOR_PARENT');
 assert.equal(uint(h.query.successorNumber),uint(h.query.number)+1n,'QUERY_SUCCESSOR_NUMBER');
 assert(uint(h.query.successorTimestamp)>uint(h.query.timestamp),'QUERY_SUCCESSOR_TIME');
 dense(h.inventory,128);dense(h.records,4096);dense(h.finalPositions,128);assert(h.inventory.length>0,'POSITION_INVENTORY_REQUIRED');
 const inventory=new Map(),states=new Map(),receipts=new Set(),accounts=new Set();let index=1n,lastTime=uint(request.config.origin),lastBlock=0n,lastTx=0n,lastLog=0n;
 for(const p of h.inventory){
  record(p,['pid','account','side','initialQuantity18','entryPrice18']);
  uint(p.pid);address(p.account);assert(['LONG','SHORT'].includes(p.side),'POSITION_SIDE');assert(uint(p.initialQuantity18)>0n&&uint(p.entryPrice18)>0n,'POSITION_BASIS');assert(!inventory.has(p.pid),'POSITION_DUPLICATE');
  inventory.set(p.pid,p);states.set(p.pid,{qty:0n,sequence:0n,closed:0n,exits:0n,opened:null,account:p.account,side:p.side});accounts.add(p.account.toLowerCase());
 }
 const blockHashes=new Map();
 for(const r of h.records){
  record(r,['index','blockNumber','blockHash','transactionHash','transactionIndex','logIndex','timestamp','pid','account','side','sequence','oldQty','nextQty','receipt']);
  assert.equal(uint(r.index),index,'RECORD_INDEX');index++;
  const p=inventory.get(r.pid);assert(p,'UNDECLARED_POSITION');const state=states.get(r.pid);assert.equal(r.account,p.account,'POSITION_ACCOUNT');assert.equal(r.side,p.side,'POSITION_DIRECTION');
  const t=uint(r.timestamp),bn=uint(r.blockNumber),tx=uint(r.transactionIndex),log=uint(r.logIndex);
  assert(t>=lastTime&&t<=uint(h.query.timestamp),'HISTORY_TIME_ORDER');assert(bn>=lastBlock&&bn<=uint(h.query.number),'HISTORY_BLOCK_RANGE');
  if(bn===lastBlock)assert(tx>lastTx||(tx===lastTx&&log>lastLog),'TRANSACTION_LOG_ORDER');
  hash32(r.blockHash);hash32(r.transactionHash);
  if(blockHashes.has(r.blockNumber))assert.equal(r.blockHash,blockHashes.get(r.blockNumber),'BLOCK_HASH_CONFLICT');blockHashes.set(r.blockNumber,r.blockHash);
  const receipt=hash32(r.receipt);assert(!receipts.has(receipt),'DUPLICATE_RECEIPT');receipts.add(receipt);
  assert.equal(uint(r.sequence),state.sequence+1n,'POSITION_SEQUENCE');assert.equal(uint(r.oldQty),state.qty,'POSITION_OLD_QUANTITY');
  const next=uint(r.nextQty);
  if(state.opened===null){assert(t<uint(request.config.end),'OPEN_AFTER_OFFICIAL_END');assert.equal(next,uint(p.initialQuantity18),'INITIAL_QUANTITY');state.opened=t;}
  else{assert(next<state.qty,'NON_REDUCTION');state.closed+=state.qty-next;state.exits++;}
  state.qty=next;state.sequence++;lastTime=t;lastBlock=bn;lastTx=tx;lastLog=log;
 }
 const final=h.inventory.map(p=>{const s=states.get(p.pid);assert(s.opened!==null,'POSITION_WITHOUT_HISTORY');return {pid:p.pid,remainingQuantity18:s.qty.toString(),finalSequence:s.sequence.toString(),cumulativeClosed18:s.closed.toString(),exitCount:s.exits.toString()};});
 eq(h.finalPositions,final,'FINAL_POSITION_RECONCILIATION');
 // Compare every record and complete independent inventory, not just summary counts.
 eq(h.inventory,source.request.history.inventory,'SOURCE_POSITION_INVENTORY');
 eq(h.records,source.request.history.records,'SOURCE_RECORD_BINDING');
 eq(h.query,source.request.history.query,'SOURCE_QUERY_BINDING');eq(h.finalPositions,source.request.history.finalPositions,'SOURCE_FINAL_BINDING');
 assert.equal(h.commitment,hash(historyMeaning(h)),'HISTORY_COMMITMENT');assert.equal(h.commitment,source.request.history.commitment,'SOURCE_HISTORY_COMMITMENT');
 return {source,config,states,historyCommitment:h.commitment,accountCount:accounts.size};
}

// Only pinned synthetic variation recipes register here; no caller source/approval input.
export function loadPolicyV1EvidenceVariation(name){
 assert(typeof name==='string','EVIDENCE_VARIATION_NAME_REQUIRED');
 const bytes=fs.readFileSync(new URL('../shared-evaluation-evidence-variations.json',import.meta.url));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),EVALUATION_EVIDENCE_VARIATIONS_SHA256,'EVIDENCE_VARIATION_HASH_MISMATCH');
 const bundle=JSON.parse(bytes);assert.equal(bundle.purpose,'TEST_ONLY_NOT_PRICE_POLICY_OR_CHAIN_APPROVAL','EVIDENCE_VARIATION_PURPOSE');assert(Object.hasOwn(bundle.cases,name),'UNKNOWN_EVIDENCE_VARIATION');
 const definition=bundle.cases[name],base=loadPolicyV1ResearchCase(definition.baseCase),source=structuredClone(policyV1Source(base.context));
 if(definition.kind==='PRICE_REPORT_METADATA'){
  record(definition,['baseCase','kind','selectionKey','selectionField','roundId']);assert.equal(definition.selectionField,'primaryCollateral','UNSUPPORTED_EVIDENCE_VARIATION_FIELD');uint(definition.roundId);
  const selection=source.request.priceSelections.find(s=>s.key===definition.selectionKey);assert(selection,'VARIATION_SELECTION_MISSING');const original=source.reports[selection[definition.selectionField]];assert(original,'VARIATION_REPORT_MISSING');
  const id=hash({namespace:'SYNTHETIC_PRICE_EVIDENCE_VARIATION',recipe:EVALUATION_EVIDENCE_VARIATIONS_SHA256,original:original.id,roundId:definition.roundId});
  source.reports[id]={...original,id,roundId:definition.roundId};selection[definition.selectionField]=id;
 }else if(definition.kind==='POLICY_IDENTITY'){
  record(definition,['baseCase','kind','policyId']);hash32(definition.policyId);source.request.config.policyId=definition.policyId;source.series.policyCommitment=validatePolicyV1Config(source.request.config).policyCommitment;
 }else assert.fail('UNSUPPORTED_EVIDENCE_VARIATION_KIND');
 const context=freeze({kind:'PINNED_SYNTHETIC_EVIDENCE_VARIATION',caseId:name});sources.set(context,freeze(source));return {context,request:structuredClone(source.request)};
}
