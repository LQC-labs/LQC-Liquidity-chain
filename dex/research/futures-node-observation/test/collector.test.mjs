import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {keccak256} from 'ethers';
import {collectRegistryObservation,LIMITS} from '../collector.mjs';
import {createNodeTransport} from '../transport.mjs';
import {openJournal} from '../journal.mjs';
import {DEPLOYER,OWNER,specs,compareRuntime} from '../../../scripts/verify-futures-deployment-lineage.mjs';
import {NO_AUTHORITY} from '../../futures-evaluation/lib/policy-v1-common.mjs';
const tests=[],test=(name,fn)=>tests.push({name,fn}),H=c=>'0x'+c.repeat(64),runId='00000000-0000-4000-8000-000000000063';
const node={host:'synthetic.invalid',settingSource:'BSC_TESTNET_RPC_URL'};
function fixture(){
 const Q={number:'0x100',hash:H('a'),parentHash:H('b'),timestamp:'0x200'},past={number:'0x50',hash:H('c'),parentHash:H('d'),timestamp:'0x100'};
 const receipt={transactionHash:specs.Registry.tx,blockNumber:past.number,blockHash:past.hash,transactionIndex:'0x0',from:DEPLOYER,to:null,contractAddress:specs.Registry.address,status:'0x1',logs:[]};
 return {Q,past,values:['0x61',Q,'0x6000','0x'+'0'.repeat(24)+OWNER.slice(2),receipt,past,{...Q}]};
}
async function collect(mutate=()=>{}){
 const f=fixture(),journal=[],calls=[];mutate(f);
 const result=await collectRegistryObservation({runId,node,persist:e=>journal.push(structuredClone(e)),request:async p=>{
  calls.push(structuredClone(p));const value=f.values[p.id-1];if(value instanceof Error)throw value;
  return f.envelopes?.[p.id]??{jsonrpc:'2.0',id:p.id,result:value};
 }});
 return {result,journal,calls,f};
}
function stopped(x,count,reason){assert.equal(x.result.collectionComplete,false);assert.equal(x.result.status,'PARTIAL');assert.equal(x.calls.length,count);assert(x.result.blockers.includes(reason));assert.equal(x.journal.at(-1).event,'STOP');assert(!x.journal.some(e=>e.event==='COMPLETE'));}
test('complete synthetic observation fixes all code and state reads to fresh finalized Q',async()=>{
 const x=await collect();assert.equal(x.result.status,'COLLECTED');assert.equal(x.result.requestCount,7);assert.equal(x.result.qUnchanged,true);
 assert.deepEqual(x.calls.map(c=>[c.method,c.params]),[
  ['eth_chainId',[]],['eth_getBlockByNumber',['finalized',false]],['eth_getCode',[specs.Registry.address,x.f.Q.number]],
  ['eth_call',[{to:specs.Registry.address,data:'0x8da5cb5b'},x.f.Q.number]],['eth_getTransactionReceipt',[specs.Registry.tx]],
  ['eth_getBlockByNumber',[x.f.past.number,false]],['eth_getBlockByNumber',[x.f.Q.number,false]]]);
 assert.equal(x.result.code.raw,'0x6000');assert.equal(x.result.code.runtimeHash,keccak256('0x6000'));
 assert.equal(x.result.code.presence,'PRESENT');assert.equal(x.result.code.deploymentCodeMatch,'UNVERIFIED');assert.equal(x.result.code.artifactComparison,'NOT_PERFORMED');
 assert(x.calls.every(c=>x.journal.findIndex(e=>e.event==='REQUEST'&&e.id===c.id)<x.journal.findIndex(e=>e.event==='RESPONSE'&&e.id===c.id)));
});
test('each run selects finalized again rather than inheriting an old Q',async()=>{
 const a=await collect(),b=await collect(f=>{f.Q.number='0x101';f.Q.hash=H('e');f.values[6]={...f.Q};});assert.notDeepEqual(a.result.Q,b.result.Q);assert.deepEqual(b.calls[1].params,['finalized',false]);
});
test('wrong chain stops after exactly one request',async()=>stopped(await collect(f=>{f.values[0]='0x38';}),1,'CHAIN_ID_MISMATCH'));
test('missing finalized result stops without latest fallback',async()=>stopped(await collect(f=>{f.values[1]=null;}),2,'REQUIRED_RESULT_MISSING'));
test('unsupported finalized response stops without retry',async()=>stopped(await collect(f=>{f.envelopes={2:{jsonrpc:'2.0',id:2,error:{code:-32602,message:'unsupported finalized'}}};}),2,'RPC_ERROR'));
test('missing Registry runtime stops before state or Receipt queries',async()=>stopped(await collect(f=>{f.values[2]='0x';}),3,'REGISTRY_CODE_MISSING_OR_INVALID'));
test('owner conflict is distinct from missing evidence',async()=>stopped(await collect(f=>{f.values[3]='0x'+'0'.repeat(64);}),4,'OWNER_RECORD_MISMATCH'));
test('deployment Receipt conflict stops before its historical block',async()=>stopped(await collect(f=>{f.values[4].contractAddress=OWNER;}),5,'DEPLOYMENT_RECEIPT_MISMATCH'));
test('deployment block hash conflict is rejected',async()=>stopped(await collect(f=>{f.past.hash=H('e');}),6,'DEPLOYMENT_BLOCK_MISMATCH'));
test('Q hash change prevents collection completion',async()=>stopped(await collect(f=>{f.values[6].hash=H('e');}),7,'Q_CHANGED'));
test('same Q hash with conflicting timestamp is rejected',async()=>stopped(await collect(f=>{f.values[6].timestamp='0x201';}),7,'Q_CHANGED'));
test('response ID conflict is rejected',async()=>stopped(await collect(f=>{f.envelopes={3:{jsonrpc:'2.0',id:999,result:'0x6000'}};}),3,'RPC_ENVELOPE_MISMATCH'));
test('missing required response field leaves a partial journal',async()=>stopped(await collect(f=>{f.envelopes={4:{jsonrpc:'2.0',id:4}};}),4,'REQUIRED_RESULT_MISSING'));
test('RPC request limit error is journaled without a retry',async()=>{
 const x=await collect(f=>{f.envelopes={3:{jsonrpc:'2.0',id:3,error:{code:-32005,message:'quota secret-token'}}};});stopped(x,3,'RPC_ERROR');assert.equal(x.journal.at(-2).rpcError.code,-32005);assert(!JSON.stringify({result:x.result,journal:x.journal}).includes('quota secret-token'));
});
test('transport error text and authentication URL never enter evidence',async()=>{
 const secret='https://user:password@private.invalid/key?token=VERY_SECRET';
 const x=await collect(f=>{f.values[2]=new Error(secret);});stopped(x,3,'TRANSPORT_ERROR');assert(!JSON.stringify({result:x.result,journal:x.journal}).includes('VERY_SECRET'));assert.equal(x.journal.at(-2).event,'ERROR');
});
test('unrecognized response fields cannot inject credentials into journal',async()=>{
 const x=await collect(f=>{f.Q.authorization='VERY_SECRET';f.values[4].providerUrl='https://private.invalid/VERY_SECRET';});assert.equal(x.result.status,'COLLECTED');assert(!JSON.stringify(x.journal).includes('VERY_SECRET'));
});
test('partial responses are flushed to disk and existing evidence cannot be overwritten',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'lqc-node-unit-')),dir=path.join(root,'partial'),journal=openJournal(dir),f=fixture();let count=0;
 const result=await collectRegistryObservation({runId,node,persist:journal.persist,request:async p=>{count++;return {jsonrpc:'2.0',id:p.id,result:p.id===4?null:f.values[p.id-1]};}});
 journal.finish(result);journal.close();const events=fs.readFileSync(path.join(dir,'journal.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(count,4);assert.equal(events.at(-1).event,'STOP');assert.equal(events.filter(e=>e.event==='RESPONSE').length,4);
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'observation.json'))).collectionComplete,false);assert.throws(()=>openJournal(dir),/EEXIST/);
});
test('journal write failure prevents the next RPC dispatch',async()=>{
 const f=fixture();let count=0;
 const r=await collectRegistryObservation({runId,node,persist:e=>{if(e.event==='REQUEST'&&e.id===3)throw Error('DISK_WRITE_FAILED');},request:async p=>{count++;return {jsonrpc:'2.0',id:p.id,result:f.values[p.id-1]};}});assert.equal(r.collectionComplete,false);assert(r.blockers.includes('DISK_WRITE_FAILED'));assert.equal(count,2);assert.equal(r.requestCount,2);
});
test('node observed never grants trust V1 acceptance or money authorities',async()=>{
 const {result:r}=await collect();assert.equal(r.evidenceLevel,'NODE_OBSERVED');assert.equal(r.trustStatus,'UNAPPROVED');assert.equal(r.independentChainAuthenticated,false);assert.equal(r.independentFinalityAuthenticated,false);assert.equal(r.v1InputAccepted,false);assert.equal(r.evaluationStatus,'NOT_EVALUATED');assert.equal(r.confirmedAmount,null);assert.equal(r.monetaryResult,null);
 for(const k of Object.keys(NO_AUTHORITY))assert.equal(r[k],false);
 for(const s of ['HISTORICAL_STATE','FULL_LOG_HISTORY','PARTICIPANT_COMPLETENESS','TRANSACTION_PRICE','NEW_V1_POLICY_SERIES_BINDING','ACTUAL_CASH','DURABLE_CONSUMPTION'])assert(r.blockers.includes(s+'_UNVERIFIED'));
});
test('legacy runtime comparison is reused without calling its live entry point',()=>{
 assert.equal(compareRuntime('0x6000',{deployedBytecode:'0x6000'}).normalizedRuntimeMatch,true);
 assert.equal(compareRuntime('0x6001',{deployedBytecode:'0x6000'}).normalizedRuntimeMatch,false);
});
const payload={jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]};
test('transport records only host and forbids redirect following',async()=>{
 let count=0;const t=createNodeTransport('https://node.invalid/private?api_key=VERY_SECRET',{fetchImpl:async(url,options)=>{count++;assert.equal(options.redirect,'error');return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:'0x61'}));}});
 assert.deepEqual(t.descriptor,{host:'node.invalid',settingSource:'BSC_TESTNET_RPC_URL'});assert.equal((await t.request(payload)).result,'0x61');assert.equal(count,1);
});
test('HTTP request limitation makes one attempt and omits response body',async()=>{
 let count=0;const t=createNodeTransport('https://node.invalid',{fetchImpl:async()=>{count++;return new Response('VERY_SECRET',{status:429});}});
 await assert.rejects(()=>t.request(payload),e=>e.code==='HTTP_ERROR'&&e.httpStatus===429&&!e.message.includes('VERY_SECRET'));assert.equal(count,1);
});
test('timeout aborts one request without retry',async()=>{
 let count=0;const t=createNodeTransport('https://node.invalid',{schedule:fn=>{queueMicrotask(fn);return 1;},cancel:()=>{},fetchImpl:async(_u,{signal})=>{count++;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('private credentials')),{once:true}));}});
 await assert.rejects(()=>t.request(payload),e=>e.code==='TIMEOUT');assert.equal(count,1);
});
test('oversized response stops before body parsing',async()=>{
 const t=createNodeTransport('https://node.invalid',{fetchImpl:async()=>new Response('ignored',{headers:{'content-length':String(LIMITS.maxResponseBytes+1)}})});
 await assert.rejects(()=>t.request(payload),e=>e.code==='RESPONSE_TOO_LARGE');
});
test('invalid JSON is a sanitized terminal error',async()=>{
 const t=createNodeTransport('https://node.invalid',{fetchImpl:async()=>new Response('VERY_SECRET')});await assert.rejects(()=>t.request(payload),e=>e.code==='INVALID_JSON'&&!e.message.includes('VERY_SECRET'));
});
test('transport enforces request upper bound even outside collector',async()=>{
 let count=0;const t=createNodeTransport('https://node.invalid',{fetchImpl:async()=>{count++;return new Response('{"jsonrpc":"2.0","id":1,"result":"0x61"}');}});
 for(let i=0;i<LIMITS.maxRequests;i++)await t.request(payload);await assert.rejects(()=>t.request(payload),e=>e.code==='REQUEST_BUDGET_EXCEEDED');assert.equal(count,7);
});
test('transaction methods are rejected before any network dispatch',async()=>{
 let count=0;const t=createNodeTransport('https://node.invalid',{fetchImpl:async()=>{count++;throw Error('unexpected');}});await assert.rejects(()=>t.request({...payload,method:'eth_sendRawTransaction'}),e=>e.code==='READ_ONLY_METHOD_REQUIRED');assert.equal(count,0);
});
describe('BSC Registry node observation synthetic',()=>{for(const {name,fn} of tests)it(name,fn);});
