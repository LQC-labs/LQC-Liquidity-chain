// Stored bytes only. No harness, provider, RPC, deployment or Anvil imports.
import fs from 'node:fs';
import {ethers} from 'ethers';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {verifyRepeatedConsumption,verifyRepeatedStep,decodeStored,FIXED_ABI_SHA256} from './verify-repeated-consumption.mjs';
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

function mutate(first,second,id,abiBytes){
 const documents=[JSON.parse(first),JSON.parse(second)],originals=[JSON.parse(first),JSON.parse(second)];
 const g=graph(documents[1]),operations=[];let order=[0,1],operands;
 const prop=(node,key)=>g.resolve(node).properties[key];
 function change(node,key,after){const path=[...g.locations.get(node),'properties',key];operations.push({document:1,operation:'replace',path,before:node.properties[key],after});node.properties[key]=after;}
 function altered(hash){assert.match(hash,/^0x[0-9a-fA-F]{64}$/);return hash.slice(0,-1)+(hash.endsWith('0')?'1':'0');}
 if(id==='V02'){
  order=[1,0];operations.push({operation:'input-order',before:[0,1],after:order});operands={actualDecimal:'2',expectedDecimal:'1'};
 }else if(id==='V03'){
  const label='specifications/'+g.at('previousSpecification')+'/used',queries=g.at('before','queries'),observations=g.at('queryObservations'),rows=g.values(observations),tag=g.at('before','startBlock','number');
  assert(Object.hasOwn(queries.properties,label),'PREPARATION_OLD_USED_QUERY');
  const semantic=rows.filter(x=>{const q=g.resolve(prop(x,'request'));return prop(q,'kind')==='contract'&&prop(q,'label')===label&&prop(q,'blockTag')===tag;});
  assert.equal(semantic.length,2);assert.equal(prop(semantic[0],'state'),'REQUESTED');assert.equal(prop(semantic[1],'state'),'SUCCESS');
  const begin=rows.indexOf(semantic[0]),end=rows.indexOf(semantic[1]);assert(begin<end);
  const raw=rows.slice(begin+1,end).filter(x=>{const q=g.resolve(prop(x,'request'));return prop(q,'kind')==='rpc'&&prop(g.resolve(prop(q,'request')),'method')==='eth_call';});
  assert.equal(raw.length,2);assert.equal(prop(raw[0],'state'),'REQUESTED');assert.equal(prop(raw[1],'state'),'SUCCESS');
  operations.push({document:1,operation:'remove',path:[...g.locations.get(queries),'properties',label],before:queries.properties[label]});delete queries.properties[label];
  const removed=new Set([...semantic,...raw]),next={};let index=0;
  for(let n=0;n<rows.length;n++)if(!removed.has(rows[n]))next[index++]=observations.properties[n];next.length=index;
  assert.equal(removed.size,4);assert.equal(rows.length-index,4);
  operations.push({document:1,operation:'replace',path:[...g.locations.get(observations),'properties'],before:observations.properties,after:next,removedEvents:[...removed].map(x=>({graphId:x.$id,requestId:prop(x,'id'),state:prop(x,'state')}))});observations.properties=next;
 }else if(id==='V04'){
  const transactions=g.at('intermediateTransactions');assert.equal(transactions.properties.length,2);
  // Preserve the first transaction, remove exactly the second definition.
  const after={'0':transactions.properties['0'],length:1};operations.push({document:1,operation:'replace',path:[...g.locations.get(transactions),'properties'],before:transactions.properties,after});transactions.properties=after;
  operands={actualDecimal:'1',expectedDecimal:'2'};
 }else if(id==='V05'){
  const saved=decodeStored(JSON.parse(second)),fixed=JSON.parse(abiBytes),iface=new ethers.Interface(fixed.contracts.LocalFuturesSettlementCoordinator.abi);
  const transactions=g.values(g.at('intermediateTransactions')),transaction=g.resolve(prop(transactions[1],'transaction'));
  const args=[saved.pid,saved.keys.settlementId.value,2n,10n],expected=iface.encodeFunctionData('recordIntegerSpecification',args);assert.equal(prop(transaction,'input').toLowerCase(),expected.toLowerCase(),'PREPARATION_INTEGER_CALL');
  args[3]=0n;const actual=iface.encodeFunctionData('recordIntegerSpecification',args);change(transaction,'input',actual);operands={actualHex:actual.toLowerCase(),expectedHex:expected.toLowerCase()};
 }else if(id==='V06'){
  const transactions=g.values(g.at('intermediateTransactions')),block=g.resolve(prop(transactions[0],'block')),expected=prop(block,'parentHash');
  assert.equal(expected.toLowerCase(),decodeStored(JSON.parse(first)).block.hash.toLowerCase(),'PREPARATION_PARENT');const actual=altered(expected);change(block,'parentHash',actual);operands={actualHex:actual.toLowerCase(),expectedHex:expected.toLowerCase()};
 }else throw Error('UNKNOWN_MUTATION');
 const count={V02:1,V03:2,V04:1,V05:1,V06:1}[id];assert.equal(operations.length,count,'MUTATION_COUNT');
 // Independent declared-operation replay includes input ordering, with no implicit edit.
 const replay=[JSON.parse(first),JSON.parse(second)];let replayOrder=[0,1];
 for(const op of operations){
  if(op.operation==='input-order'){assert.deepEqual(replayOrder,op.before);replayOrder=op.after.slice();continue;}
  let parent=replay[op.document];for(const key of op.path.slice(0,-1))parent=parent[key];const key=op.path.at(-1);assert.deepEqual(parent[key],op.before);
  if(op.operation==='remove')delete parent[key];else parent[key]=op.after;
 }
 assert.deepEqual(replay,documents,'UNDECLARED_EDIT');assert.deepEqual(replayOrder,order,'UNDECLARED_ORDER');
 for(const doc of documents){graph(doc);decodeStored(doc);} // Preparation errors are never expected rejections.
 // A pure order mutation preserves both original byte strings exactly.
 const ordered=id==='V02'?[second,first]:[first,Buffer.from(JSON.stringify(documents[1]))];
 assert.notDeepEqual(ordered.map(hash),[hash(Buffer.from(JSON.stringify(originals[0]))),hash(Buffer.from(JSON.stringify(originals[1])))]);
 return {bytes:ordered,order,operations,operands};
}
function targetError(error,item,operands){
 assert(error instanceof assert.AssertionError,'TARGET_ASSERTION_REQUIRED');assert.equal(error.name,'AssertionError');assert.equal(error.code,'ERR_ASSERTION');assert.equal(error.operator,item.targetOperator);
 if(item.targetMessage)assert.equal(error.message.split('\n')[0],item.targetMessage,'TARGET_MESSAGE');
 for(const k of ['actual','expected']){
  if(item[k+'Decimal'])assert.equal(error[k].toString(10),item[k+'Decimal'],'TARGET_DECIMAL:'+k);
  if(operands?.[k+'Hex'])assert.equal(error[k].toLowerCase(),operands[k+'Hex'],'TARGET_HEX:'+k);
 }
 const location='verify-repeated-consumption.mjs:'+item.assertionLine+':';assert(typeof error.stack==='string');assert(error.stack.split('\n').some(line=>/^\s+at /.test(line)&&line.includes(location)&&/:\d+\)?$/.test(line)),'TARGET_LOCATION');
 return {name:error.name,code:error.code,message:error.message,stack:error.stack,operator:error.operator,actual:errorRecord(error.actual),expected:errorRecord(error.expected),assertionLocation:location};
}
const firstArg=process.argv[2],secondArg=process.argv[3],out=process.argv[4],plan=JSON.parse(fs.readFileSync(checkedFile(root,'repeated-tamper-plan.json')));
const state={schema:'LQC_REPEATED_TAMPER_RESULT_1',state:'RUNNING',required:plan.cases.map(x=>x.id),actual:[],unique:[],cases:[],originalReplay:'NOT_RUN',amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
let primary,files,abiFile,initialHashes,bytes,abiBytes;
try{
 assert.equal(process.argv.length,5);assert(firstArg&&secondArg&&out);files=[checkedInput(firstArg),checkedInput(secondArg)];assert.notEqual(files[0],files[1]);abiFile=checkedFile(root,'normal-evidence-abi.json');
 bytes=files.map(f=>fs.readFileSync(f));abiBytes=fs.readFileSync(abiFile);initialHashes={inputs:bytes.map(hash),abi:hash(abiBytes)};assert.equal(initialHashes.abi,FIXED_ABI_SHA256);assert.equal(initialHashes.abi,plan.abiSHA256);
 for(const b of bytes){graph(JSON.parse(b));decodeStored(JSON.parse(b));}
 const initial=verifyRepeatedConsumption(bytes[0],bytes[1],abiBytes);state.input={paths:[firstArg,secondArg],sha256:initialHashes.inputs,abiSHA256:initialHashes.abi};record(root,out,'input.json',{...state.input,baseline:initial});
 for(const item of plan.cases){
  const result={id:item.id,title:item.title,state:'RUNNING',preparation:'NOT_RUN',target:item.targetMessage??null,assertionLine:item.assertionLine??null};state.actual.push(item.id);state.cases.push(result);let caseError;
  try{
   if(item.id==='V01'){result.preparation='READY';result.verification=initial;result.mutations=[];}
   else{
    const changed=mutate(bytes[0],bytes[1],item.id,abiBytes);result.preparation='READY';result.mutations=changed.operations;result.inputOrder=changed.order;result.mutatedSHA256=changed.bytes.map(hash);result.targetOperands=changed.operands??null;
    record(root,out,item.id+'.mutation.json',{id:item.id,originalSHA256:initialHashes.inputs,mutatedSHA256:result.mutatedSHA256,inputOrder:changed.order,operations:changed.operations,targetOperands:result.targetOperands});
    // V02/4/5/6 must retain two individually valid steps, isolating the pair check.
    if(item.id!=='V03'){for(const b of changed.bytes)verifyRepeatedStep(b,abiBytes);result.individualSteps='PASS';}
    let rejected=false;
    try{verifyRepeatedConsumption(changed.bytes[0],changed.bytes[1],abiBytes);}catch(error){rejected=true;result.rejection=errorRecord(error);result.observed=targetError(error,item,changed.operands);}
    assert(rejected,'EXPECTED_TARGET_REJECTION');
   }
   for(let i=0;i<2;i++)assert.equal(hash(fs.readFileSync(files[i])),initialHashes.inputs[i],'ORIGINAL_CHANGED:'+i);assert.equal(hash(fs.readFileSync(abiFile)),initialHashes.abi);result.state='PASS';
  }catch(error){caseError=error;result.state='FAIL';if(result.preparation!=='READY')result.preparation='FAIL';result.error=errorRecord(error);}
  try{record(root,out,item.id+'.json',result);}catch(recording){try{fs.writeSync(2,JSON.stringify({primary:errorRecord(caseError),recording:errorRecord(recording),result})+'\n');}catch{}throw caseError??recording;}
  if(caseError)throw caseError;
 }
 state.unique=[...new Set(state.actual)];assert.equal(state.unique.length,state.actual.length);assert.deepEqual(state.actual,state.required);
 assert.deepEqual(verifyRepeatedConsumption(fs.readFileSync(files[0]),fs.readFileSync(files[1]),fs.readFileSync(abiFile)),initial);state.originalReplay='PASS';state.state='PASS';
}catch(error){primary=error;state.error=errorRecord(error);state.state='FAIL';process.exitCode=1;}
finally{
 if(initialHashes)for(const [kind,file,expected]of [['first',files[0],initialHashes.inputs[0]],['second',files[1],initialHashes.inputs[1]],['abi',abiFile,initialHashes.abi]]){
  try{assert.equal(hash(fs.readFileSync(file)),expected);(state.finalInputIntegrity??={})[kind]='UNCHANGED';}
  catch(error){(state.finalizationErrors??=[]).push(errorRecord(error));if(!primary){primary=error;state.error=errorRecord(error);}state.state='FAIL';process.exitCode=1;}
 }
 state.unique=[...new Set(state.actual)];state.notRun=state.required.filter(id=>!state.actual.includes(id));
 try{record(root,out,'cases.json',state);}catch(recording){process.exitCode=1;try{fs.writeSync(2,JSON.stringify({primary:errorRecord(primary),recording:errorRecord(recording),state})+'\n');}catch{}}
 if(primary)try{fs.writeSync(2,JSON.stringify({primary:errorRecord(primary)})+'\n');}catch{}
}
