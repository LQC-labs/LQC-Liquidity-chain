import {createHash} from 'node:crypto';
import {keccak256} from 'ethers';
import {DEPLOYER,OWNER,specs,normalizeRuntime} from '../../scripts/verify-futures-deployment-lineage.mjs';
import {NO_AUTHORITY} from '../futures-evaluation/lib/policy-v1-common.mjs';

export const LIMITS=Object.freeze({maxRequests:7,timeoutMs:15000,maxResponseBytes:524288});
const REGISTRY=Object.freeze({...specs.Registry});
const BLOCKERS=Object.freeze(['NODE_TRUST_UNAPPROVED','INDEPENDENT_CHAIN_AUTHENTICATION_UNVERIFIED','INDEPENDENT_FINALITY_UNVERIFIED',
 'DEPLOYMENT_CODE_MATCH_UNVERIFIED','HISTORICAL_STATE_UNVERIFIED','FULL_LOG_HISTORY_UNVERIFIED','PARTICIPANT_COMPLETENESS_UNVERIFIED',
 'TRANSACTION_PRICE_UNVERIFIED','NEW_V1_POLICY_SERIES_BINDING_UNVERIFIED','ACTUAL_CASH_UNVERIFIED','DURABLE_CONSUMPTION_UNVERIFIED','EXISTING_SERIES_NOT_V1_INPUT']);
function check(ok,code){if(!ok)throw new Error(code);}
const hex=x=>typeof x==='string'&&/^0x(?:[a-fA-F0-9]{2})*$/.test(x);
const hash=x=>typeof x==='string'&&/^0x[a-fA-F0-9]{64}$/.test(x);
const quantity=x=>typeof x==='string'&&/^0x(?:0|[1-9a-fA-F][a-fA-F0-9]*)$/.test(x);
const address=x=>typeof x==='string'&&/^0x[a-fA-F0-9]{40}$/.test(x);
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.toLowerCase()===b.toLowerCase();
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const SAFE_KEYS=new Set(['number','hash','parentHash','timestamp','stateRoot','receiptsRoot','transactionsRoot',
 'transactionHash','blockNumber','blockHash','transactionIndex','from','to','contractAddress','status',
 'logs','address','topics','data','logIndex','removed','gasUsed','cumulativeGasUsed','effectiveGasPrice','type','logsBloom']);
// Preserve raw code/call hex; project other RPC results to non-secret evidence fields.
// Unknown fields and arbitrary text are not copied into the journal.
function safeValue(x){
 if(x===null||typeof x==='boolean')return x;
 if(typeof x==='string')return /^0x[a-fA-F0-9]*$/.test(x)?x:'[OMITTED_NON_HEX_VALUE]';
 if(Array.isArray(x))return x.map(safeValue);
 if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).filter(([k])=>SAFE_KEYS.has(k)).map(([k,v])=>[k,safeValue(v)]));
 return '[OMITTED_VALUE]';
}
function header(x){
 check(x&&quantity(x.number)&&hash(x.hash)&&hash(x.parentHash)&&quantity(x.timestamp),'INVALID_BLOCK_HEADER');
 return {number:x.number,hash:x.hash,parentHash:x.parentHash,timestamp:x.timestamp};
}
export async function collectRegistryObservation({request,persist,runId,node}){
 check(typeof request==='function'&&typeof persist==='function','IO_REQUIRED');
 check(typeof runId==='string'&&/^[a-f0-9-]{36}$/.test(runId),'RUN_ID_REQUIRED');
 check(node&&Object.keys(node).sort().join(',')==='host,settingSource'&&typeof node.host==='string'&&/^[a-z0-9.-]+$/i.test(node.host)&&node.settingSource==='BSC_TESTNET_RPC_URL','SAFE_NODE_DESCRIPTOR_REQUIRED');
 const result={schema:'LQC_BSC_REGISTRY_NODE_OBSERVATION_V1',runId,evidenceLevel:'NODE_OBSERVED',trustStatus:'UNAPPROVED',
  independentChainAuthenticated:false,independentFinalityAuthenticated:false,collectionComplete:false,status:'PARTIAL',
  evaluationStatus:'NOT_EVALUATED',confirmedAmount:null,monetaryResult:null,v1InputAccepted:false,...NO_AUTHORITY,
  limits:LIMITS,node:{...node},requestCount:0,Q:null,code:null,owner:null,deployment:null,qUnchanged:false,
  expectations:{source:'dex/scripts/verify-futures-deployment-lineage.mjs',registry:REGISTRY.address,transaction:REGISTRY.tx,deployer:DEPLOYER,owner:OWNER,
   limits:'Repository deployment records are comparison inputs, not independent trust anchors or proof of current deployed-code identity.'},blockers:[...BLOCKERS]};
 let lastStage='START';
 async function read(method,params){
  check(result.requestCount<LIMITS.maxRequests,'REQUEST_BUDGET_EXCEEDED');
  const id=result.requestCount+1;lastStage=method;
  await persist({event:'REQUEST',runId,id,method,params});
  result.requestCount=id;
  let r;
  try{r=await request({jsonrpc:'2.0',id,method,params});}
  catch(e){const code=['TIMEOUT','HTTP_ERROR','RESPONSE_TOO_LARGE','INVALID_JSON','TRANSPORT_ERROR'].includes(e.code)?e.code:'TRANSPORT_ERROR';
   await persist({event:'ERROR',runId,id,code,httpStatus:Number.isInteger(e.httpStatus)?e.httpStatus:null});throw new Error(code);}
  await persist({event:'RESPONSE',runId,id,result:safeValue(r?.result),responseDigestSha256:digest(r??null),
   rpcError:r?.error?{code:Number.isInteger(r.error.code)?r.error.code:null}:null});
  check(r&&r.jsonrpc==='2.0'&&r.id===id,'RPC_ENVELOPE_MISMATCH');
  check(!r.error,'RPC_ERROR');check(Object.hasOwn(r,'result')&&r.result!==null,'REQUIRED_RESULT_MISSING');
  return r.result;
 }
 try{
  await persist({event:'START',runId,node:result.node,limits:LIMITS,trustStatus:'UNAPPROVED'});
  result.chainId=await read('eth_chainId',[]);check(result.chainId==='0x61','CHAIN_ID_MISMATCH');
  const q=header(await read('eth_getBlockByNumber',['finalized',false]));result.Q=q;
  const code=await read('eth_getCode',[REGISTRY.address,q.number]);
  check(hex(code)&&code!=='0x','REGISTRY_CODE_MISSING_OR_INVALID');
  result.code={address:REGISTRY.address,blockTag:q.number,queryBlockHash:q.hash,raw:code,runtimeHash:keccak256(normalizeRuntime(code)),
   presence:'PRESENT',deploymentCodeMatch:'UNVERIFIED',artifactComparison:'NOT_PERFORMED'};
  const raw=await read('eth_call',[{to:REGISTRY.address,data:'0x8da5cb5b'},q.number]);
  check(typeof raw==='string'&&/^0x0{24}[a-fA-F0-9]{40}$/.test(raw),'OWNER_ABI_INVALID');
  result.owner={raw,address:'0x'+raw.slice(-40),blockTag:q.number,queryBlockHash:q.hash,matchesRecord:same('0x'+raw.slice(-40),OWNER)};
  check(result.owner.matchesRecord,'OWNER_RECORD_MISMATCH');
  const r=await read('eth_getTransactionReceipt',[REGISTRY.tx]);
  check(r.status==='0x1'&&r.to===null&&same(r.transactionHash,REGISTRY.tx)&&same(r.contractAddress,REGISTRY.address)&&same(r.from,DEPLOYER),'DEPLOYMENT_RECEIPT_MISMATCH');
  check(quantity(r.blockNumber)&&hash(r.blockHash)&&quantity(r.transactionIndex)&&Array.isArray(r.logs)&&BigInt(r.blockNumber)<=BigInt(q.number),'RECEIPT_SCOPE_INVALID');
  result.deployment={receipt:safeValue(r),matchesRecord:true,block:null};
  const past=header(await read('eth_getBlockByNumber',[r.blockNumber,false]));
  check(same(past.number,r.blockNumber)&&same(past.hash,r.blockHash)&&BigInt(past.timestamp)<=BigInt(q.timestamp),'DEPLOYMENT_BLOCK_MISMATCH');result.deployment.block=past;
  const after=header(await read('eth_getBlockByNumber',[q.number,false]));
  check(same(after.number,q.number)&&same(after.hash,q.hash)&&same(after.parentHash,q.parentHash)&&same(after.timestamp,q.timestamp),'Q_CHANGED');
  result.qUnchanged=true;result.collectionComplete=true;result.status='COLLECTED';
  await persist({event:'COMPLETE',runId,requestCount:result.requestCount,Q:q});
 }catch(e){
  // Never serialize provider messages, URLs, credentials or stack traces.
  const reason=typeof e.message==='string'&&/^[A-Z][A-Z0-9_]+$/.test(e.message)?e.message:'COLLECTION_ERROR';
  result.status='PARTIAL';result.collectionComplete=false;result.blockers.push(reason);
  await persist({event:'STOP',runId,stage:lastStage,reason,requestCount:result.requestCount});
 }
 return result;
}
