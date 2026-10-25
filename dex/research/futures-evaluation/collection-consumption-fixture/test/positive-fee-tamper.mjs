// Stored bytes only. No harness, provider, RPC, deployment or Anvil imports.
import fs from 'node:fs';
import {ethers} from 'ethers';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {verifyPositiveFee,decodeStored,FIXED_ABI_SHA256} from './verify-positive-fee.mjs';
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
function mutation(bytes,id,abiBytes){
 const document=JSON.parse(bytes),g=graph(document),original=JSON.parse(bytes),operations=[];
 const observations=g.at('queryObservations');
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
 // Fixed ABI defines tuple field indexes and output encoding; submitted labels do not define semantics.
 const fixed=JSON.parse(abiBytes),coreABI=fixed.contracts.LocalFuturesCore.abi,coordABI=fixed.contracts.LocalFuturesSettlementCoordinator.abi;
 const domainFragment=new ethers.Interface(coreABI).getFunction('domain'),domainFields=domainFragment.outputs[0].components;
 const cfgIndex=domainFields.findIndex(x=>x.name==='cfg'),cfgFields=domainFields[cfgIndex].components;
 const feeIndex=cfgFields.findIndex(x=>x.name==='feeBps'),policyIndex=cfgFields.findIndex(x=>x.name==='policyDigest');
 const integerFragment=new ethers.Interface(coordABI).getFunction('integerSpecification'),integerFields=integerFragment.outputs[0].components;
 const targetIndex=integerFields.findIndex(x=>x.name==='feeTarget');assert(cfgIndex>=0&&feeIndex>=0&&policyIndex>=0&&targetIndex>=0,'PREPARATION_FIXED_FIELDS');
 function snapshotNode(side,label){
  if(label.startsWith('specifications/')){const entry=g.values(g.at(side,'snapshot','specifications')).find(x=>prop(x,'0')===g.at('specification'));assert(entry);return g.resolve(prop(entry,'2'));}
  return g.at(side,'snapshot',label);
 }
 function savedValue(saved,side,label){return label.startsWith('specifications/')?saved[side].snapshot.specifications.find(x=>x[0]===saved.specification)[2]:saved[side].snapshot[label];}
 function changeLeaf(node,indexes,before,after){
  for(const index of indexes.slice(0,-1))node=g.resolve(prop(node,String(index)));
  const key=String(indexes.at(-1)),leaf=g.resolve(prop(node,key));
  if(typeof before==='bigint'){assert.equal(leaf.$type,'bigint');assert.equal(leaf.decimal,before.toString());field(leaf,'decimal',after.toString());}
  else{assert.equal(leaf,before);set(node,key,after);}
 }
 function coherent(side,label,role,method,indexes,before,after){
  const pair=rawPair(label,side),snapshot=snapshotNode(side,label),returned=g.resolve(prop(pair.semantic[1],'value'));
  // Distinct capture representations are expected for this pinned observer, not inferred from the mutation.
  assert.notEqual(snapshot,returned,'PREPARATION_SEPARATE_SAVED_AND_SEMANTIC_VALUES');
  const i=new ethers.Interface(fixed.contracts[role].abi),fragment=i.getFunction(method);
  const prior=savedValue(decodeStored(JSON.parse(JSON.stringify(document))),side,label);
  assert.equal(prop(pair.raw[1],'value').toLowerCase(),i.encodeFunctionResult(fragment,[prior]).toLowerCase(),'PREPARATION_ORIGINAL_RAW_ENCODING');
  changeLeaf(snapshot,indexes,before,after);changeLeaf(returned,indexes,before,after);
  const next=savedValue(decodeStored(JSON.parse(JSON.stringify(document))),side,label);
  set(pair.raw[1],'value',i.encodeFunctionResult(fragment,[next]));
 }
 if(id==='S02'){
  const label='domain',queries=g.at('before','queries'),pair=rawPair(label),parts=[...g.locations.get(queries),'properties',label];
  assert(Object.hasOwn(queries.properties,label));operations.push({operation:'remove',path:parts,before:queries.properties[label]});delete queries.properties[label];
  const removed=new Set([...pair.semantic,...pair.raw]),kept=rows.filter(x=>!removed.has(x));
  const next={};let n=0;for(let i=0;i<rows.length;i++)if(!removed.has(rows[i]))next[n++]=observations.properties[i];next.length=n;
  operations.push({operation:'replace',path:[...g.locations.get(observations),'properties'],before:observations.properties,after:next,removedEvents:[...removed].map(x=>({graphId:x.$id,requestId:prop(x,'id'),state:prop(x,'state')}))});observations.properties=next;
  assert.equal(removed.size,4);assert.equal(rows.length-kept.length,4);
  const oldGraph=graph(original),oldRows=oldGraph.values(oldGraph.at('queryObservations'));assert.deepEqual(kept,oldRows.filter(x=>!new Set([...removed].map(x=>x.$id)).has(x.$id)));
 }else if(id==='S03'){
  for(const side of ['before','after'])coherent(side,'domain','LocalFuturesCore','domain',[cfgIndex,feeIndex],1n,2n);
 }else if(id==='S04'){
  const expected=ethers.id('POSITIVE_FEE_TWO_ACCOUNTS');for(const side of ['before','after'])coherent(side,'domain','LocalFuturesCore','domain',[cfgIndex,policyIndex],expected,changedHash(expected));
 }else if(id==='S05'){
  const originalPool=decodeStored(JSON.parse(bytes)).before.snapshot.pool;const oldAfter=decodeStored(JSON.parse(bytes)).after.snapshot.pool;
  assert.equal(oldAfter[7]-originalPool[7],300n,'PREPARATION_FEE_BUCKET_DELTA');coherent('after','pool','LocalFuturesPartialV11','partialPool',[7],oldAfter[7],oldAfter[7]+1n);
 }else if(id==='S06'){
  const label='specifications/'+g.at('specification')+'/integer';for(const side of ['before','after'])coherent(side,label,'LocalFuturesSettlementCoordinator','integerSpecification',[targetIndex],300n,0n);
 }else throw new Error('UNKNOWN_MUTATION');
 assert.equal(operations.length,{S02:2,S03:6,S04:6,S05:3,S06:6}[id],'DECLARED_LOGICAL_MUTATION_COUNT');
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
 const location='verify-positive-fee.mjs:'+item.assertionLine+':';
 assert(error.stack.split('\n').some(line=>/^\s+at /.test(line)&&line.includes(location)&&/:\d+\)?$/.test(line)),'TARGET_ASSERTION_LOCATION');
 return {name:error.name,code:error.code,message:error.message,stack:error.stack,operator:error.operator,actual:errorRecord(error.actual),expected:errorRecord(error.expected),assertionLocation:location};
}

const input=process.argv[2],out=process.argv[3],plan=JSON.parse(fs.readFileSync(checkedFile(root,'positive-fee-tamper-plan.json')));
const state={schema:'LQC_POSITIVE_FEE_TAMPER_RESULT_1',state:'RUNNING',required:plan.cases.map(x=>x.id),actual:[],unique:[],cases:[],originalReplay:'NOT_RUN',amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
let primary,originalBytes,abiBytes,inputFile,abiFile,initialHashes;
try{
 assert(input&&out,'ARGUMENTS_REQUIRED');inputFile=checkedInput(input);abiFile=checkedFile(root,'normal-evidence-abi.json');
 originalBytes=fs.readFileSync(inputFile);abiBytes=fs.readFileSync(abiFile);
 initialHashes={input:hash(originalBytes),abi:hash(abiBytes)};
 assert.equal(hash(abiBytes),FIXED_ABI_SHA256,'INPUT_ABI_PIN');assert.equal(hash(abiBytes),plan.abiSHA256,'PLAN_ABI_PIN');
 graph(JSON.parse(originalBytes));decodeStored(JSON.parse(originalBytes));
 state.input={path:input,sha256:hash(originalBytes),abiSHA256:hash(abiBytes)};
 const initial=verifyPositiveFee(originalBytes,abiBytes); // Input failure is never an expected negative result.
 record(root,out,'input.json',{...state.input,baseline:initial});
 for(const item of plan.cases){
  const result={id:item.id,title:item.title,state:'RUNNING',preparation:'NOT_RUN',target:item.targetMessage??null,assertionLine:item.assertionLine??null};state.actual.push(item.id);state.cases.push(result);
  let caseError;
  try{
   if(item.id==='S01'){
    result.preparation='READY';result.verification=initial;result.mutations=[];
   }else{
    const changed=mutation(originalBytes,item.id,abiBytes);result.preparation='READY';result.mutations=changed.operations;result.mutatedSHA256=hash(changed.bytes);
    record(root,out,item.id+'.mutation.json',{id:item.id,originalSHA256:state.input.sha256,mutatedSHA256:result.mutatedSHA256,operations:changed.operations});
    let thrown=false;
    try{verifyPositiveFee(changed.bytes,abiBytes);}catch(error){thrown=true;result.rejection=errorRecord(error);result.observed=targetError(error,item);}
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
 assert.deepEqual(verifyPositiveFee(fs.readFileSync(inputFile),fs.readFileSync(abiFile)),initial,'ORIGINAL_REPLAY_CHANGED');state.originalReplay='PASS';state.state='PASS';
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
