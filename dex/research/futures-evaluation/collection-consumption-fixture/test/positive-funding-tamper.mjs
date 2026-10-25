// Stored bytes only. No harness, provider, RPC, deployment or Anvil imports.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {verifyPositiveFunding,decodeStored,FIXED_ABI_SHA256} from './verify-positive-funding.mjs';
import support from './stored-tamper-io.cjs';
const {record,errorRecord,checkedFile,checkedInput}=support;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const root=fileURLToPath(new URL('../',import.meta.url));

function graph(document){
 const ids=new Map(),locations=new Map(),refs=[];
 function walk(value,parts=[]){
  if(!value||typeof value!=='object')return;
  locations.set(value,parts);
  if(Object.hasOwn(value,'$id')){assert(!ids.has(value.$id),'PREPARATION_DUPLICATE_GRAPH_ID');ids.set(value.$id,value);locations.set(value,parts);}
  if(Object.hasOwn(value,'$ref'))refs.push(value.$ref);
  for(const [key,item]of Object.entries(value))walk(item,[...parts,key]);
 }
 walk(document);for(const id of refs)assert(ids.has(id),'PREPARATION_DANGLING_GRAPH_REFERENCE');
 const resolve=value=>value&&typeof value==='object'&&Object.hasOwn(value,'$ref')?ids.get(value.$ref):value;
 const at=(...keys)=>keys.reduce((node,key)=>{node=resolve(node);assert(node?.properties&&Object.hasOwn(node.properties,key),'PREPARATION_PATH:'+keys.join('/'));return resolve(node.properties[key]);},document);
 const values=node=>{node=resolve(node);assert.equal(node.$type,'array');return Array.from({length:node.properties.length},(_,i)=>resolve(node.properties[i]));};
 return {ids,locations,resolve,at,values};
}
function mutation(bytes,id){
 const document=JSON.parse(bytes),g=graph(document),original=JSON.parse(bytes),operations=[];
 const query=g.at('before','queries','consumed'),observations=g.at('queryObservations');
 const rows=g.values(observations),prop=(node,key)=>g.resolve(node).properties[key];
 function set(node,key,value){
  const parts=[...g.locations.get(node),'properties',key];
  operations.push({operation:'replace',path:parts,before:node.properties[key],after:value});node.properties[key]=value;
 }
 function field(node,key,value){const parts=[...g.locations.get(node),key];operations.push({operation:'replace',path:parts,before:node[key],after:value});node[key]=value;}
 function changedHash(value){assert.match(value,/^0x[0-9a-fA-F]{64}$/);return value.slice(0,-1)+(value.endsWith('0')?'1':'0');}
 function rawPair(label,side='before'){
  const tag=g.at(side,'startBlock','number');
  const semantic=rows.filter(x=>{const q=g.resolve(prop(x,'request'));return prop(q,'kind')==='contract'&&prop(q,'label')===label&&prop(q,'blockTag')===tag;});
  assert.equal(semantic.length,2,'PREPARATION_SEMANTIC_PAIR');
  assert.equal(prop(semantic[0],'state'),'REQUESTED');assert.equal(prop(semantic[1],'state'),'SUCCESS');
  const begin=rows.indexOf(semantic[0]),end=rows.indexOf(semantic[1]);assert(begin<end);
  const raw=rows.slice(begin+1,end).filter(x=>{const q=g.resolve(prop(x,'request'));return prop(q,'kind')==='rpc'&&prop(g.resolve(prop(q,'request')),'method')==='eth_call';});
  assert.equal(raw.length,2,'PREPARATION_RAW_PAIR');assert.equal(prop(raw[0],'state'),'REQUESTED');assert.equal(prop(raw[1],'state'),'SUCCESS');
  return {semantic,raw};
 }
 if(id==='P02'||id==='P03'){
  const spec=g.at('specification'),label='specifications/'+spec+'/'+(id==='P02'?'used':'integer'),queries=g.at('before','queries'),pair=rawPair(label);
  const parts=[...g.locations.get(queries),'properties',label];
  assert(Object.hasOwn(queries.properties,label));operations.push({operation:'remove',path:parts,before:queries.properties[label]});delete queries.properties[label];
  const removed=new Set([...pair.semantic,...pair.raw]),kept=rows.filter(x=>!removed.has(x));
  const next={};let n=0;for(let i=0;i<rows.length;i++)if(!removed.has(rows[i]))next[n++]=observations.properties[i];next.length=n;
  operations.push({operation:'replace',path:[...g.locations.get(observations),'properties'],before:observations.properties,after:next,removedEvents:[...removed].map(x=>({graphId:x.$id,requestId:prop(x,'id'),state:prop(x,'state')}))});
  observations.properties=next;
  assert.equal(removed.size,4);assert.equal(rows.length-kept.length,4);
  // All retained event objects/refs stay byte-identical; array indexes alone shift.
  const oldGraph=graph(original),oldRows=oldGraph.values(oldGraph.at('queryObservations'));
  assert.deepEqual(kept,oldRows.filter(x=>!new Set([...removed].map(x=>x.$id)).has(x.$id)));
 }else if(id==='P04')set(query,'method','linkedPending(uint256)');
 else if(id==='P05')set(query,'address',g.at('context','roles','funding','address'));
 else if(id==='P06'){
  const args=g.resolve(query.properties.args),pid=g.resolve(args.properties[0]);assert.equal(pid.$type,'bigint');
  // Preserve the BigInt record and decimal representation; change only its value.
  const parts=[...g.locations.get(args),'properties','0','decimal'];
  const value=(BigInt(pid.decimal)+1n).toString(10);operations.push({operation:'replace',path:parts,before:pid.decimal,after:value});pid.decimal=value;
 }else if(id==='P07')set(query,'blockTag','0x'+(BigInt(query.properties.blockTag)+1n).toString(16));
 else if(id==='P08'){const {raw}=rawPair('consumed');assert.match(raw[1].properties.value,/^0x(?:[0-9a-fA-F]{2})+$/);set(raw[1],'value',raw[1].properties.value+'00'.repeat(32));}
 else if(id==='P09'){
  const snapshot=g.at('before','snapshot'),value=g.at('before','snapshot','consumed');assert.equal(value.$type,'bigint');
  const next=(BigInt(value.decimal)+1n).toString(10),parts=[...g.locations.get(snapshot),'properties','consumed','decimal'];
  operations.push({operation:'replace',path:parts,before:value.decimal,after:next});value.decimal=next;
 }else if(id==='P10'){
  const executor=g.at('context','roles','executor','address'),logs=g.values(g.at('receipt','logs')).filter(x=>prop(x,'address').toLowerCase()===executor.toLowerCase());assert.equal(logs.length,1,'PREPARATION_COLLECTED_LOG');
  const data=prop(logs[0],'data');assert.equal(data.length,130);assert.equal(BigInt('0x'+data.slice(-64)),20n);set(logs[0],'data',data.slice(0,-64)+(600020n).toString(16).padStart(64,'0'));
 }else if(id==='P11'){
  const value=g.at('collected','amount');assert.equal(value.$type,'bigint');assert.equal(value.decimal,'20');field(value,'decimal','600020');
 }else if(id==='P12'){
  const block=g.at('block');set(block,'parentHash',changedHash(prop(block,'parentHash')));
 }else if(id==='P13'){
  const receipt=g.at('receipt');set(receipt,'transactionHash',changedHash(prop(receipt,'transactionHash')));
 }else if(id==='P14'){
  const {semantic,raw}=rawPair('collected','after'),value=g.at('after','snapshot','collected'),returned=g.resolve(prop(semantic[1],'value'));
  assert.equal(value.$type,'bigint');assert.equal(value.decimal,'20');assert.equal(returned.$type,'bigint');assert.equal(returned.decimal,'20');
  field(value,'decimal','21');if(returned!==value)field(returned,'decimal','21');
  assert.equal(BigInt(prop(raw[1],'value')),20n);set(raw[1],'value','0x'+(21n).toString(16).padStart(64,'0'));
 }else throw new Error('UNKNOWN_MUTATION');
 assert.equal(operations.length,id==='P02'||id==='P03'?2:id==='P14'?3:1,'SINGLE_LOGICAL_MUTATION');
 // Independently replay the declared edits. Any undeclared graph change fails preparation.
 const replay=JSON.parse(bytes);
 for(const op of operations){let parent=replay;for(const part of op.path.slice(0,-1))parent=parent[part];const key=op.path.at(-1);assert.deepEqual(parent[key],op.before);if(op.operation==='remove')delete parent[key];else parent[key]=op.after;}
 assert.deepEqual(document,replay,'UNDECLARED_MUTATION');
 const result=Buffer.from(JSON.stringify(document));assert.notEqual(hash(result),hash(bytes));
 graph(document);decodeStored(document); // Preparation failure is outside the target-rejection catch.
 return {bytes:result,operations};
}

function targetError(error,item){
 assert(error instanceof assert.AssertionError,'TARGET_MUST_BE_ASSERTION');
 assert.equal(error.name,item.targetErrorName,'TARGET_ERROR_NAME');
 assert.equal(error.code,'ERR_ASSERTION','TARGET_ERROR_CODE');
 if(item.targetMessage)assert.equal(error.message.split('\n')[0],item.targetMessage,'TARGET_MESSAGE');
 if(item.targetOperator)assert.equal(error.operator,item.targetOperator,'TARGET_OPERATOR');
 if(item.actualDecimal)assert.equal(error.actual.toString(10),item.actualDecimal,'TARGET_ACTUAL');
 if(item.expectedDecimal)assert.equal(error.expected.toString(10),item.expectedDecimal,'TARGET_EXPECTED');
 if(item.actualLastDecimal){assert(Array.isArray(error.actual)&&Array.isArray(error.expected),'TARGET_ARRAY_OPERANDS');assert.equal(error.actual.at(-1).toString(10),item.actualLastDecimal);assert.equal(error.expected.at(-1).toString(10),item.expectedLastDecimal);}
 assert(typeof error.stack==='string','TARGET_STACK_REQUIRED');
 const location='verify-positive-funding.mjs:'+item.assertionLine+':';
 assert(error.stack.split('\n').some(line=>/^\s+at /.test(line)&&line.includes(location)&&/:\d+\)?$/.test(line)),'TARGET_ASSERTION_LOCATION');
 return {name:error.name,code:error.code,message:error.message,stack:error.stack,operator:error.operator,actual:errorRecord(error.actual),expected:errorRecord(error.expected),assertionLocation:location};
}

const input=process.argv[2],out=process.argv[3],plan=JSON.parse(fs.readFileSync(checkedFile(root,'positive-tamper-plan.json')));
const state={schema:'LQC_POSITIVE_TAMPER_RESULT_1',state:'RUNNING',required:plan.cases.map(x=>x.id),actual:[],unique:[],cases:[],originalReplay:'NOT_RUN',amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
let primary,originalBytes,abiBytes,inputFile,abiFile,initialHashes;
try{
 assert(input&&out,'ARGUMENTS_REQUIRED');inputFile=checkedInput(input);abiFile=checkedFile(root,'normal-evidence-abi.json');
 originalBytes=fs.readFileSync(inputFile);abiBytes=fs.readFileSync(abiFile);
 initialHashes={input:hash(originalBytes),abi:hash(abiBytes)};
 assert.equal(hash(abiBytes),FIXED_ABI_SHA256,'INPUT_ABI_PIN');assert.equal(hash(abiBytes),plan.abiSHA256,'PLAN_ABI_PIN');
 graph(JSON.parse(originalBytes));decodeStored(JSON.parse(originalBytes));
 state.input={path:input,sha256:hash(originalBytes),abiSHA256:hash(abiBytes)};
 const initial=verifyPositiveFunding(originalBytes,abiBytes); // Input failure is never an expected negative result.
 record(root,out,'input.json',{...state.input,baseline:initial});
 for(const item of plan.cases){
  const result={id:item.id,title:item.title,state:'RUNNING',preparation:'NOT_RUN',target:item.targetMessage??null,assertionLine:item.assertionLine??null};state.actual.push(item.id);state.cases.push(result);
  let caseError;
  try{
   if(item.id==='P01'){
    result.preparation='READY';result.verification=initial;result.mutations=[];
   }else{
    const changed=mutation(originalBytes,item.id);result.preparation='READY';result.mutations=changed.operations;result.mutatedSHA256=hash(changed.bytes);
    record(root,out,item.id+'.mutation.json',{id:item.id,originalSHA256:state.input.sha256,mutatedSHA256:result.mutatedSHA256,operations:changed.operations});
    let thrown=false;
    try{verifyPositiveFunding(changed.bytes,abiBytes);}catch(error){thrown=true;result.rejection=errorRecord(error);result.observed=targetError(error,item);}
    assert(thrown,'EXPECTED_TARGET_REJECTION');
   }
   assert.equal(hash(fs.readFileSync(inputFile)),state.input.sha256,'ORIGINAL_INPUT_CHANGED');
   assert.equal(hash(fs.readFileSync(abiFile)),state.input.abiSHA256,'ORIGINAL_ABI_CHANGED');
   result.state='PASS';
  }catch(error){caseError=error;result.state='FAIL';if(result.preparation!=='READY')result.preparation='FAIL';result.error=errorRecord(error);}
  try{record(root,out,item.id+'.json',result);}catch(recording){
   try{fs.writeSync(2,JSON.stringify({primary:errorRecord(caseError),recording:errorRecord(recording),result})+'\n');}catch{}
   throw caseError??recording;
  }
  if(caseError)throw caseError;
 }
 state.unique=[...new Set(state.actual)];assert.equal(state.unique.length,state.actual.length,'DUPLICATE_CASE');assert.deepEqual(state.actual,state.required,'MISSING_OR_UNEXPECTED_CASE');
 assert.deepEqual(verifyPositiveFunding(fs.readFileSync(inputFile),fs.readFileSync(abiFile)),initial,'ORIGINAL_REPLAY_CHANGED');state.originalReplay='PASS';state.state='PASS';
}catch(error){primary=error;state.state='FAIL';state.error=errorRecord(error);process.exitCode=1;}
finally{
 if(initialHashes)for(const [kind,file]of [['input',inputFile],['abi',abiFile]]){
  try{assert.equal(hash(fs.readFileSync(file)),initialHashes[kind],'FINAL_ORIGINAL_BYTES:'+kind);(state.finalInputIntegrity??={})[kind]='UNCHANGED';}
  catch(error){(state.finalizationErrors??=[]).push(errorRecord(error));if(!primary){primary=error;state.error=errorRecord(error);}state.state='FAIL';process.exitCode=1;}
 }
 state.unique=[...new Set(state.actual)];state.notRun=state.required.filter(id=>!state.actual.includes(id));
 try{record(root,out,'cases.json',state);}catch(recording){process.exitCode=1;try{fs.writeSync(2,JSON.stringify({primary:errorRecord(primary),recording:errorRecord(recording),state})+'\n');}catch{}}
 if(primary)try{fs.writeSync(2,JSON.stringify({primary:errorRecord(primary)})+'\n');}catch{}
}
