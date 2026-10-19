import { REQUIRED_PLAN, validatePlan } from './required-plan.mjs';
import { ZERO_ARG_PUBLIC, assertPublicQuery, describeAllowlist } from './public-queries.mjs';
import { createJournal, persistJson } from './query-journal.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url)),OUT=path.join(ROOT,'candidate');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2);
const plain=x=>JSON.parse(json(x));
const header=(b)=>{assert(b&&b.number&&b.hash&&b.timestamp,'MISSING_BLOCK_HEADER');return {number:BigInt(b.number).toString(),hex:b.number,hash:b.hash,parentHash:b.parentHash,timestamp:BigInt(b.timestamp).toString(),stateRoot:b.stateRoot};};
const CORE_NAMES=['LocalFuturesTradingCore','LocalFuturesFundingV11','LocalFuturesPartialV11','LocalFuturesExposureLedger','LocalFuturesAttribution','LocalFuturesSettlementCoordinator','LocalFuturesCollectionExecutor','LocalFuturesPayoutSpecification','LocalFuturesPayoutExecutor','LocalFuturesWithdrawalVerifier','LocalFuturesReleaseVerifier','LocalFuturesLinkedExposureVerifier'];
export function preflightCollector43(artifact){
 const metadata=JSON.parse(fs.readFileSync(path.join(ROOT,'run-metadata.json')));assert.equal(metadata.schema,'LQC_LOCAL_CHAIN_SCOPE_EVIDENCE');assert.equal(metadata.schemaVersion,'3');assert(metadata.runId);
 const files=['scope-evidence.json','contract-code.json','review-candidate-manifest.json','collection-progress.json'];
 for(const f of files){const p=path.resolve(OUT,f);assert.equal(path.dirname(p),path.resolve(OUT));assert(!fs.existsSync(p),'EXISTING_COLLECTION_OUTPUT');}
 const interfaces={};for(const name of [...CORE_NAMES,'LocalFuturesModularTradingDomainRegistry','LocalFuturesPreparedStateVerifier','LocalFuturesTradingOperationPolicy','LocalFuturesTradingPreflightVerifier','LocalVNextToken','LocalVNextOracle'])interfaces[name]=new ethers.Interface(artifact(name).abi);
 for(const [name,method]of [['LocalFuturesTradingCore','coreExposureContext'],['LocalFuturesPartialV11','linkedExit'],['LocalFuturesAttribution','transition'],['LocalFuturesModularTradingDomainRegistry','peers']])assert(interfaces[name].getFunction(method));
 const collectionPlan=validatePlan(artifact);persistJson(path.join(OUT,'required-query-plan.json'),collectionPlan);const allowlist=describeAllowlist(artifact);assert(!allowlist.some(q=>q.method==='validatePeers'));
 persistJson(path.join(OUT,'public-query-allowlist.json'),{schema:'LQC_PUBLIC_QUERY_ALLOWLIST_V1',runId:metadata.runId,queries:allowlist,registryOnlyValidation:{directValidatePeers:'PROHIBITED_NOT_CALLED',normalRegistryPath:'Existing Fixture recordPreparation/activateTrading evidence is separate; not a new direct validatePeers test'}});
 const probe={runId:metadata.runId,pathCheck:'PASS',abiCheck:'PASS',anvilStarts:0,rpcCalls:0,scenarioExecutions:0};fs.writeFileSync(path.join(OUT,'preflight-path-check.json'),json(probe));return probe;
}
export async function beginScopeCapture43({rpc,coreAddress}){
 const metadata=JSON.parse(fs.readFileSync(path.join(ROOT,'run-metadata.json'))),journal=createJournal(path.join(OUT,'query-journal.jsonl'),metadata.runId);
 const invoke=(method,params,phase,blockTag=null)=>journal.invoke({phase,rpc:method,params,caller:null,blockTag,required:true},()=>rpc.request({method,params}));
 const beforeRaw=await invoke('eth_chainId',[],'CHAIN_BEFORE');assert(/^0x[0-9a-f]+$/i.test(beforeRaw));assert.equal(BigInt(beforeRaw),31337n);persistJson(path.join(OUT,'chain-before.json'),{runId:metadata.runId,rpc:'eth_chainId',raw:beforeRaw,decimal:BigInt(beforeRaw).toString()});
 const genesisRaw=await invoke('eth_getBlockByNumber',['0x0',false],'GENESIS','0x0');header(genesisRaw);persistJson(path.join(OUT,'genesis-header.json'),genesisRaw);
 const oldCode=await invoke('eth_getCode',[coreAddress,'0x0'],'CAPABILITY_PROBE','0x0');assert.equal(oldCode,'0x','FIXED_HISTORICAL_CODE_QUERY_NOT_SUPPORTED');
 const clientVersion=await invoke('web3_clientVersion',[],'CLIENT_VERSION');
 const record={runId:metadata.runId,schema:metadata.schema,schemaVersion:metadata.schemaVersion,status:'STARTED',chainBeforeRaw:beforeRaw,genesis:header(genesisRaw),clientVersion,historicalCodeProbe:{address:coreAddress,blockTag:'0x0',result:oldCode,status:'PASS'}};
 Object.defineProperty(record,'journal',{value:journal});persistJson(path.join(OUT,'collection-progress.json'),record);return record;
}
export async function freezeFinalQueryScope43({rpc,begin,contracts,artifact,actors}){
 assert(!begin.finalScope,'FINAL_SCOPE_ALREADY_SELECTED');const journal=begin.journal,original=rpc.request.bind(rpc);
 const qRaw=await journal.invoke({phase:'Q_SELECTION',rpc:'eth_getBlockByNumber',params:['latest',false],caller:null,blockTag:'latest_SELECTION_ONLY',required:true},()=>original({method:'eth_getBlockByNumber',params:['latest',false]})),Q=header(qRaw),routed=[];
 persistJson(path.join(OUT,'q-before.json'),{runId:begin.runId,header:qRaw,scope:Q});
 const targets=new Map();function add(name,address){targets.set(ethers.getAddress(address).toLowerCase(),{name,address:ethers.getAddress(address),iface:new ethers.Interface(artifact(name).abi)});}
 for(let i=0;i<12;i++)add(CORE_NAMES[i],contracts.peers[i]);add('LocalFuturesModularTradingDomainRegistry',contracts.registry);add('LocalVNextToken',contracts.token);add('LocalVNextOracle',contracts.oracle);add('LocalVNextOracle',contracts.market);
 async function discover(name,address,method){assertPublicQuery(name,method);const iface=new ethers.Interface(artifact(name).abi),data=iface.encodeFunctionData(method,[]);const value=await journal.invoke({phase:'FINAL_DISCOVERY',rpc:'eth_call',target:address,artifact:name,method,args:[],caller:ethers.ZeroAddress,blockTag:Q.hex,queryBlockHash:Q.hash,required:true},()=>original({method:'eth_call',params:[{to:address,from:ethers.ZeroAddress,data},Q.hex]}));return iface.decodeFunctionResult(method,value)[0];}
 add('LocalFuturesPreparedStateVerifier',await discover('LocalFuturesModularTradingDomainRegistry',contracts.registry,'preparedStateVerifier'));
 add('LocalFuturesTradingOperationPolicy',await discover('LocalFuturesModularTradingDomainRegistry',contracts.registry,'operationPolicy'));
 add('LocalFuturesTradingPreflightVerifier',await discover('LocalFuturesTradingCore',contracts.peers[0],'tradingPreflight'));
 const callers=new Set([ethers.ZeroAddress,...actors].map(a=>ethers.getAddress(a).toLowerCase()));
 begin.finalScope={qRaw,Q,routed};persistJson(path.join(OUT,'collection-progress.json'),{...begin,status:'Q_SELECTED',queryBlock:{number:Q.number,hash:Q.hash,blockTag:Q.hex}});
 rpc.request=async function({method,params=[]}){try{return await route({method,params});}catch(error){journal.append({event:'REJECTED_OR_FAILED',request:{rpc:method,target:params[0]?.to??params[0]??null,args:params,blockTag:Q.hex,required:true},error:{message:error.message}});throw error;}};
 async function route({method,params=[]}){
  if(['eth_sendTransaction','eth_sendRawTransaction','evm_mine','evm_setNextBlockTimestamp','anvil_setBlockTimestampInterval'].includes(method))throw Error('STATE_MUTATION_AFTER_QUERY_SCOPE');
  const actual=[...params];let descriptor={phase:'FINAL_METADATA',rpc:method,caller:null,blockTag:null,required:true};
  if(method==='eth_call'){
   const tx={...actual[0]},target=targets.get(ethers.getAddress(tx.to).toLowerCase());assert(target,'UNKNOWN_FINAL_QUERY_TARGET');const parsed=target.iface.parseTransaction({data:tx.data});assert(parsed);assertPublicQuery(target.name,parsed.name);const caller=ethers.getAddress(tx.from??ethers.ZeroAddress);assert(callers.has(caller.toLowerCase()),'UNAPPROVED_QUERY_CALLER');tx.from=caller;actual[0]=tx;actual[1]=Q.hex;
   descriptor={phase:'FINAL_STATE',rpc:method,target:target.address,artifact:target.name,method:parsed.name,args:plain(parsed.args.toArray(true)),caller,blockTag:Q.hex,queryBlockHash:Q.hash,required:true};
  }else if(method==='eth_getCode'){
   const target=targets.get(ethers.getAddress(actual[0]).toLowerCase());assert(target,'UNKNOWN_CODE_QUERY_TARGET');actual[1]=Q.hex;descriptor={phase:'FINAL_CODE',rpc:method,target:target.address,artifact:target.name,args:[target.address],caller:null,blockTag:Q.hex,queryBlockHash:Q.hash,required:true};
  }else if(['eth_getBalance','eth_getStorageAt','eth_getTransactionCount'].includes(method)){
   actual[method==='eth_getStorageAt'?2:1]=Q.hex;descriptor={phase:'FINAL_STATE',rpc:method,args:actual,caller:null,blockTag:Q.hex,queryBlockHash:Q.hash,required:true};
  }else{if(method==='eth_getBlockByNumber'&&actual[0]==='latest')actual[0]=Q.hex;descriptor.params=actual;if(method==='eth_getBlockByNumber')descriptor.blockTag=actual[0];}
  if(['FINAL_STATE','FINAL_CODE'].includes(descriptor.phase))routed.push({rpc:method,method:descriptor.method??null,target:descriptor.target??null,caller:descriptor.caller,blockTag:Q.hex,queryBlockHash:Q.hash,required:true});
  return journal.invoke(descriptor,()=>original({method,params:actual}));
 };
 return {number:Q.number,hash:Q.hash,blockTag:Q.hex};
}
export async function finishScopeCapture43({rpc,begin,evidence,z,actors,contracts,artifact}){
 const metadata=JSON.parse(fs.readFileSync(path.join(ROOT,'run-metadata.json')));assert.equal(begin.runId,metadata.runId);
 assert(begin.finalScope,'EXPLICIT_FINAL_SCOPE_REQUIRED');
 const {qRaw,Q}=begin.finalScope,tag=Q.hex;
 assert.notEqual(tag,'latest');assert.notEqual(tag,'pending');
 const calls=[],code=[],views=[],sets=new Map(),interfaces=new Map();
 function add(role,name,address,expectedHash=null){const a=ethers.getAddress(address);assert.notEqual(a,ethers.ZeroAddress);if(sets.has(role))throw Error('DUPLICATE_CONTRACT_ROLE');sets.set(role,{role,name,address:a,expectedHash});interfaces.set(role,new ethers.Interface(artifact(name).abi));}
 for(let i=0;i<12;i++)add(CORE_NAMES[i],CORE_NAMES[i],contracts.peers[i],contracts.hashes[i]);
 add('Registry','LocalFuturesModularTradingDomainRegistry',contracts.registry);
 add('Token','LocalVNextToken',contracts.token);add('CollateralOracle','LocalVNextOracle',contracts.oracle);add('MarketOracle','LocalVNextOracle',contracts.market);
 async function read(role,method,args=[]){const c=sets.get(role),iface=interfaces.get(role),f=iface.getFunction(method);assert(f&&['view','pure'].includes(f.stateMutability),'NON_VIEW_QUERY');try{assertPublicQuery(c.name,method);}catch(error){begin.journal.append({event:'REJECTED_BEFORE_RPC',request:{target:c.address,artifact:c.name,method,args:plain(args),caller:ethers.ZeroAddress,blockTag:tag,required:true},error:{message:error.message}});throw error;}const encoded=iface.encodeFunctionData(f,args);const raw=await rpc.request({method:'eth_call',params:[{to:c.address,from:ethers.ZeroAddress,data:encoded},tag]});const decoded=iface.decodeFunctionResult(f,raw).toArray(true);const row={role,address:c.address,method,args:plain(args),rpc:'eth_call',blockTag:tag,queryBlockHash:Q.hash,result:plain(decoded),resultKeccak:ethers.keccak256(raw)};views.push(row);calls.push({rpc:'eth_call',role,method,blockTag:tag,queryBlockHash:Q.hash});return decoded;}
 const executedPlanIds=new Set();async function readPlan(id,args=[]){executedPlanIds.add(id);const q=REQUIRED_PLAN.find(q=>q.id===id);assert(q,'UNKNOWN_PLAN_ID');return read(q.role,q.method,args);}
 const prepared=(await readPlan('q0'))[0],operation=(await readPlan('q1'))[0],preflight=(await readPlan('q2'))[0];
 add('PreparedStateVerifier','LocalFuturesPreparedStateVerifier',prepared,(await readPlan('q3'))[0]);
 add('OperationPolicy','LocalFuturesTradingOperationPolicy',operation,(await readPlan('q4'))[0]);
 add('TradingPreflightVerifier','LocalFuturesTradingPreflightVerifier',preflight,(await readPlan('q5'))[0]);
 const links={core:contracts.peers[0],funding:contracts.peers[1],partialSettlement:contracts.peers[2],exposureLedger:contracts.peers[3],attribution:contracts.peers[4],coordinator:contracts.peers[5],collectionCoordinator:contracts.peers[5],collectionExecutor:contracts.peers[6],payoutSpecification:contracts.peers[7],payoutExecutor:contracts.peers[8],withdrawalVerifier:contracts.peers[9],releaseVerifier:contracts.peers[10],linkedExposureVerifier:contracts.peers[11],registry:contracts.registry};
 for(const [role,c]of sets){
  const runtime=await rpc.request({method:'eth_getCode',params:[c.address,tag]});assert(/^0x[0-9a-f]+$/i.test(runtime)&&runtime.length>2,'EMPTY_FIXED_BLOCK_CODE');const runtimeHash=ethers.keccak256(runtime);if(c.expectedHash)assert.equal(runtimeHash.toLowerCase(),c.expectedHash.toLowerCase(),'RUNTIME_PIN_MISMATCH');code.push({...c,rpc:'eth_getCode',blockTag:tag,queryBlockHash:Q.hash,runtimeHash,runtimeCode:runtime});calls.push({rpc:'eth_getCode',role,blockTag:tag,queryBlockHash:Q.hash});
  for(const method of ZERO_ARG_PUBLIC[c.name]??[]){
   const v=await read(role,method);if(links[method])assert.equal(ethers.getAddress(v[0]),ethers.getAddress(links[method]),'CONNECTION_MISMATCH:'+role+'.'+method);
  }
 }
 const registryCode=code.find(c=>c.role==='Registry').runtimeHash,coreCode=code.find(c=>c.role==='LocalFuturesTradingCore').runtimeHash,attrCode=code.find(c=>c.role==='LocalFuturesAttribution').runtimeHash;
 assert.equal((await readPlan('q6'))[0],registryCode);assert.equal((await readPlan('q7'))[0],coreCode);assert.equal((await readPlan('q8'))[0],attrCode);
 for(let i=0;i<12;i++){assert.equal(ethers.getAddress((await readPlan('q9',[i]))[0]),ethers.getAddress(contracts.peers[i]));assert.equal((await readPlan('q10',[i]))[0],code.find(c=>c.role===CORE_NAMES[i]).runtimeHash);}
 const domain=(await readPlan('q11',[z.id]))[0];await readPlan('q12',[z.id]);
 await readPlan('q13',[z.id]);await readPlan('q14',[z.id]);await readPlan('q15',[z.id]);
 await readPlan('q16',[z.id,z.p.sid]);await readPlan('q17',[z.id,z.p.sid,1]);await readPlan('q18',[contracts.token]);await readPlan('q19',[z.epochKey]);
 await readPlan('q20',[z.id,z.p.sid]);
 await readPlan('q21',[z.id]);await readPlan('q22',[z.id]);await readPlan('q23',[z.id]);await readPlan('q24',[z.id]);await readPlan('q25',[contracts.token]);await readPlan('q26',[z.id]);
 const history=[];
 for(const pid of z.pids){
  const pos=(await readPlan('q27',[pid]))[0]??null;
  const ctx=await readPlan('q28',[pid]),owner=ctx[0],v=ctx[1],policy=ctx[2];assert.equal(v[0],z.id);assert.equal(v[1],BigInt(z.p.sid));assert.equal(v[3]+v[4],0n);
  const key=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address','address','uint256','uint256','address','uint256','bytes32'],[contracts.peers[0],contracts.peers[1],z.id,z.p.sid,owner,pid,policy]));
  await readPlan('q29',[key]);await readPlan('q30',[pid]);await readPlan('q31',[pid]);await readPlan('q32',[pid]);await readPlan('q33',[pid]);
  const ak=(await readPlan('q34',[z.id,owner]))[0],log=await readPlan('q35',[ak]);assert(log[0]>=2n&&log[0]<=256n);const rows=[];
  for(let ordinal=1n;ordinal<=log[0];ordinal++){const t=(await readPlan('q36',[z.id,owner,ordinal]))[0];assert.equal(t[1],pid,'UNSUPPORTED_MULTIPOSITION_HISTORY');rows.push(plain(t));}
  assert.equal(log[0],v[2]);for(let sequence=0n;sequence<=v[2];sequence++){await readPlan('q37',[pid,sequence,false]);await readPlan('q38',[pid,sequence,true]);}
  await readPlan('q39',[z.id,z.p.sid,owner,pid]);await readPlan('q40',[pid]);await readPlan('q41',[pid]);await readPlan('q42',[pid]);history.push({pid:pid.toString(),account:owner,accountKey:ak,count:log[0].toString(),finalSequence:v[2].toString(),transitions:rows});
 }
 for(const actor of actors){await readPlan('q43',[actor]);await readPlan('q44',[z.id,actor]);await readPlan('q45',[z.id,z.p.sid,actor]);await readPlan('q46',[z.id,z.p.sid,1,actor]);await readPlan('q47',[z.id,actor]);await readPlan('q48',[actor,contracts.peers[2]]);await readPlan('q49',[actor,contracts.peers[0]]);}
 for(const a of contracts.peers.slice(0,3))await readPlan('q50',[a]);
 const receipts=[];for(const item of evidence.timedTransactions){const raw=await rpc.request({method:'eth_getTransactionReceipt',params:[item.hash]});assert(raw&&raw.status==='0x1','MISSING_SUCCESS_RECEIPT');assert.equal(raw.transactionHash.toLowerCase(),item.hash.toLowerCase());assert(BigInt(raw.blockNumber)<=BigInt(tag));const b=await rpc.request({method:'eth_getBlockByNumber',params:[raw.blockNumber,false]});assert.equal(b.hash,raw.blockHash);assert.equal(BigInt(b.timestamp).toString(),item.timestamp.toString());assert.equal(b.transactions[Number(BigInt(raw.transactionIndex))].toLowerCase(),item.hash.toLowerCase());receipts.push({label:item.label,rpc:'eth_getTransactionReceipt',raw,blockHeader:b,blockTimestamp:BigInt(b.timestamp).toString()});}
 const qAfter=await rpc.request({method:'eth_getBlockByNumber',params:[tag,false]});persistJson(path.join(OUT,'q-after.json'),{runId:begin.runId,header:qAfter});assert.equal(qAfter.hash,Q.hash,'QUERY_BLOCK_HASH_CHANGED');assert.equal(qAfter.number,qRaw.number);
 const afterRaw=await rpc.request({method:'eth_chainId',params:[]});persistJson(path.join(OUT,'chain-after.json'),{runId:begin.runId,rpc:'eth_chainId',raw:afterRaw,decimal:BigInt(afterRaw).toString()});assert.equal(afterRaw,begin.chainBeforeRaw,'CHAIN_ID_CHANGED');
 assert(calls.length>0&&calls.every(c=>c.blockTag===tag&&c.queryBlockHash===Q.hash));
 assert.equal(executedPlanIds.size,REQUIRED_PLAN.length,'UNEXECUTED_REQUIRED_CALL_SITE');persistJson(path.join(OUT,'required-plan-completion.json'),{required:REQUIRED_PLAN.length,executed:[...executedPlanIds],missing:REQUIRED_PLAN.filter(q=>!executedPlanIds.has(q.id))});const journalSummary=begin.journal.summary();assert.equal(journalSummary.errors,0);assert.equal(journalSummary.pending,0);assert.equal(journalSummary.requests,journalSummary.responses);
 const record={journalSummary,registryOnlyValidation:{directValidatePeers:'NOT_CALLED',normalRegistryPath:'Existing Fixture Registry recordPreparation/activateTrading evidence; not a new direct validation test'},schema:metadata.schema,schemaVersion:metadata.schemaVersion,runId:metadata.runId,reviewCandidateOnly:true,status:'COLLECTED',pastRunReproduction:false,chainId:BigInt(afterRaw).toString(),chain:{beforeRaw:begin.chainBeforeRaw,afterRaw,unchanged:true},genesis:begin.genesis,clientVersion:begin.clientVersion,queryBlock:{number:Q.number,hash:Q.hash,blockTag:tag,timestamp:Q.timestamp},queryHeaderBefore:qRaw,queryHeaderAfter:qAfter,queryHashUnchanged:true,historicalCodeProbe:begin.historicalCodeProbe,toolsAndSettings:metadata,contracts:code.map(({runtimeCode,...c})=>c),fixedBlockCalls:calls,scenarioFinalReads:plain(begin.finalScope.routed),finalViews:views,history,receipts,scenarioEvidence:evidence,policyEvidence:null,priceApprovalEvidence:null,prices:'LOCAL_MOCK_NOT_APPROVED',fundsAuthority:false,settlementAuthorized:false};
 const evidenceBytes=Buffer.from(json(record)),codeBytes=Buffer.from(json({schema:'LQC_FIXED_BLOCK_CODE_V1',runId:metadata.runId,queryBlock:record.queryBlock,contracts:code}));fs.writeFileSync(path.join(OUT,'scope-evidence.json'),evidenceBytes);fs.writeFileSync(path.join(OUT,'contract-code.json'),codeBytes);
 const artifacts={};for(const c of code)artifacts[c.name]=sha(Buffer.from(json(artifact(c.name))));
 const candidate={manifestSchema:'LQC_REVIEW_CANDIDATE_MANIFEST_V1',runId:metadata.runId,reviewStatus:'CANDIDATE_NOT_TRUSTED_OR_ACTIVATED',scope:{chainId:record.chainId,evidenceSchema:record.schema,schemaVersion:record.schemaVersion,queryBlock:record.queryBlock,contracts:record.contracts.map(c=>({role:c.role,address:c.address,runtimeHash:c.runtimeHash}))},files:{scopeEvidence:{path:'scope-evidence.json',sha256:sha(evidenceBytes)},contractCode:{path:'contract-code.json',sha256:sha(codeBytes)},runMetadata:{path:'../run-metadata.json',sha256:sha(fs.readFileSync(path.join(ROOT,'run-metadata.json')))}},artifactContentHashes:artifacts,sourceFileHashes:JSON.parse(fs.readFileSync(path.join(ROOT,'collection-source-hashes.json'))),policyApproved:false,priceApproved:false,autoTrustRegistration:false,queryJournal:{path:'query-journal.jsonl',sha256:sha(fs.readFileSync(path.join(OUT,'query-journal.jsonl')))},publicAllowlist:{path:'public-query-allowlist.json',sha256:sha(fs.readFileSync(path.join(OUT,'public-query-allowlist.json')))},requiredQueryPlan:{path:'required-query-plan.json',sha256:sha(fs.readFileSync(path.join(OUT,'required-query-plan.json')))},requiredQuerySummary:journalSummary};
 fs.writeFileSync(path.join(OUT,'review-candidate-manifest.json'),json(candidate));fs.writeFileSync(path.join(OUT,'collection-progress.json'),json({...begin,status:'COMPLETE',queryBlock:record.queryBlock,chainAfterRaw:afterRaw,finalReadCount:calls.length,receiptCount:receipts.length,contractCount:code.length}));
 return {status:'COLLECTED',queryBlock:record.queryBlock,chainBeforeRaw:begin.chainBeforeRaw,chainAfterRaw:afterRaw,finalReadCount:calls.length,receiptCount:receipts.length,contractCount:code.length};
}