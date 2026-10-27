// Stored-data child only: no harness, provider, build helper or chain imports.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {ethers} from 'ethers';
import {decodeStoredGraph,verifyStoredWithdrawal} from './verify-protected-withdrawal.mjs';
import evidence from './failure-evidence.cjs';
import io from './stored-tamper-io.cjs';
const root=fileURLToPath(new URL('../',import.meta.url)),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const copy=x=>JSON.parse(JSON.stringify(x)),flip=x=>{assert.match(x,/^0x[0-9a-fA-F]{64}$/);return x.slice(0,-1)+(x.endsWith('0')?'1':'0');};
function graph(document){
 const ids=new Map(),locations=new Map(),refs=[];
 function walk(x,parts=[]){if(!x||typeof x!=='object')return;locations.set(x,parts);if(Object.hasOwn(x,'$id')){assert(!ids.has(x.$id),'PREPARATION_DUPLICATE_ID');ids.set(x.$id,x);}if(Object.hasOwn(x,'$ref'))refs.push(x.$ref);for(const [k,v]of Object.entries(x))walk(v,[...parts,k]);}
 walk(document);for(const id of refs)assert(ids.has(id),'PREPARATION_DANGLING_REFERENCE');
 const resolve=x=>x&&typeof x==='object'&&Object.hasOwn(x,'$ref')?ids.get(x.$ref):x;
 const at=(...keys)=>keys.reduce((x,k)=>{x=resolve(x);assert(x?.properties&&Object.hasOwn(x.properties,k),'PREPARATION_PATH:'+keys.join('/'));return resolve(x.properties[k]);},document);
 const list=x=>{x=resolve(x);assert.equal(x.$type,'array');return Array.from({length:x.properties.length},(_,i)=>resolve(x.properties[i]));};
 return {at,list,resolve,locations};
}
function mutation(bytes,item,abiBytes){
 const original=JSON.parse(bytes),changed=copy(original),g=graph(changed),d=decodeStoredGraph(bytes),ops=[];
 const iface=new ethers.Interface(JSON.parse(abiBytes).contracts.LocalFuturesPartialV11.abi);
 const replace=(node,key,value)=>{assert(Object.hasOwn(node.properties,key),'PREPARATION_PROPERTY');const route=[...g.locations.get(node),'properties',key];ops.push({operation:'replace',path:route,before:copy(node.properties[key]),after:copy(value)});node.properties[key]=value;};
 const query=label=>{const rows=g.list(g.at('before','queries')).filter(x=>x.properties.label===label);assert.equal(rows.length,1,'PREPARATION_QUERY');return rows[0];};
 const def={role:'partial',address:d.scope.addresses.partial,method:'linkedConsumed',args:[d.scope.pid],blockTag:d.before.block.number};
 let actual,expected;
 switch(item.id){
 case 'T04':{
  const arr=g.at('before','queries'),old=arr.properties,rows=g.list(arr),index=rows.findIndex(x=>x.properties.label==='consumed');assert(index>=0);const next={};let n=0;for(let i=0;i<rows.length;i++)if(i!==index)next[n++]=old[i];next.length=n;
  ops.push({operation:'replace',path:[...g.locations.get(arr),'properties'],before:copy(old),after:copy(next)});arr.properties=next;actual=72;expected=73;break;
 }
 case 'T05':case 'T06':case 'T07':case 'T08':{
  const q=query('consumed');actual={...def,args:[...def.args]};expected={...def,args:[...def.args]};
  if(item.id==='T05'){replace(q,'method','linkedHeld');actual.method='linkedHeld';}
  if(item.id==='T06'){replace(q,'address',d.scope.addresses.funding);actual.address=d.scope.addresses.funding;}
  if(item.id==='T07'){replace(g.resolve(q.properties.args),'0',{$type:'bigint',decimal:String(d.scope.longPid)});actual.args=[d.scope.longPid];}
  if(item.id==='T08'){const tag=ethers.toQuantity(BigInt(d.before.block.number)+1n);replace(q,'blockTag',tag);actual.blockTag=tag;}break;
 }
 case 'T09':{const q=query('consumed'),raw=q.properties.raw;replace(q,'raw',raw+'00'.repeat(32));actual=raw.toLowerCase();expected=(raw+'00'.repeat(32)).toLowerCase();break;}
 case 'T10':{replace(g.at('before','values'),'consumed',{$type:'bigint',decimal:String(d.before.values.consumed+1n)});actual=d.before.values.consumed+1n;expected=d.before.values.consumed;break;}
 case 'T11':{assert.equal(d.amount,20n);replace(g.at(),'amount',{$type:'bigint',decimal:'10'});actual=d.link.transaction.input;expected=iface.encodeFunctionData('withdrawProtected',[d.scope.id,d.scope.rights,d.sequence,10n]);break;}
 case 'T12':{replace(g.at('link','transaction'),'from',d.scope.O);actual=d.scope.O.toLowerCase();expected=d.scope.L.toLowerCase();break;}
 case 'T13':{const input=iface.encodeFunctionData('withdrawProtected',[d.scope.id,flip(d.scope.rights),d.sequence,d.amount]);replace(g.at('link','transaction'),'input',input);actual=input;expected=d.link.transaction.input;break;}
 case 'T14':{assert.equal(d.sequence,1n);replace(g.at(),'sequence',{$type:'bigint',decimal:'2'});actual=d.link.transaction.input;expected=iface.encodeFunctionData('withdrawProtected',[d.scope.id,d.scope.rights,2n,d.amount]);break;}
 case 'T15':{expected=flip(d.link.transaction.hash);replace(g.at('link','transaction'),'hash',expected);actual=d.link.hash;break;}
 case 'T16':{expected=flip(d.link.receipt.transactionHash);replace(g.at('link','receipt'),'transactionHash',expected);actual=d.link.hash;break;}
 case 'T17':{
  const logs=g.list(g.at('link','receipt','logs')),index=d.link.receipt.logs.findIndex(x=>x.address.toLowerCase()===d.scope.addresses.partial.toLowerCase());assert(index>=0);
  const parsed=iface.parseLog(d.link.receipt.logs[index]);assert.equal(parsed.name,'ProtectedWithdrawn');const args=Array.from(parsed.args);expected=args.slice();args[5]+=1n;actual=args;
  const encoded=iface.encodeEventLog(parsed.fragment,args);assert.deepEqual(encoded.topics,Array.from(d.link.receipt.logs[index].topics));replace(logs[index],'data',encoded.data);break;
 }
 case 'T18':{actual=flip(d.link.block.parentHash);replace(g.at('link','block'),'parentHash',actual);expected=d.before.endBlock.hash;break;}
 case 'T19':{
  const arr=g.list(g.at('after','queries')),q=arr.find(x=>x.properties.label==='withdrawalReceipt1');assert(q);const value=flip(d.after.values.withdrawalReceipt1);
  replace(q,'raw',ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'],[value]));replace(q,'value',value);replace(g.at('after','values'),'withdrawalReceipt1',value);
  actual=value;expected=ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32','address','bytes32','uint256','uint256','uint256'],[d.before.values.withdrawalPolicy,d.scope.addresses.token,d.scope.rights,d.sequence,d.amount,d.after.values.withdrawal[0]]));assert.equal(expected,d.after.values.withdrawalReceipt1);break;
 }
 default:throw Error('PREPARATION_UNKNOWN_CASE');
 }
 assert.equal(ops.length,item.operations,'PREPARATION_OPERATION_COUNT');
 // Reconstruct from the original with only declared paths; no graph normalization.
 const replay=copy(original);for(const op of ops){let x=replay;for(const k of op.path.slice(0,-1))x=x[k];const k=op.path.at(-1);assert.deepEqual(x[k],op.before);x[k]=copy(op.after);}assert.deepEqual(replay,changed,'UNDECLARED_MUTATION');
 graph(changed);const mutated=Buffer.from(JSON.stringify(changed));decodeStoredGraph(mutated);assert.notEqual(hash(mutated),hash(bytes),'UNCHANGED_MUTATION');
 assert(!item.targetMessage||typeof item.targetMessage==='string');return {mutated,operations:ops,actual,expected};
}
function target(error,item,operands){
 assert(error instanceof assert.AssertionError,'TARGET_NOT_ASSERTION');assert.equal(error.code,'ERR_ASSERTION');assert.equal(error.operator,item.operator,'TARGET_OPERATOR');
 assert.equal(error.generatedMessage,!item.targetMessage,'TARGET_MESSAGE_KIND');assert.equal(error.message,item.targetMessage??new assert.AssertionError({actual:operands.actual,expected:operands.expected,operator:item.operator}).message,'TARGET_MESSAGE');
 assert.deepEqual(error.actual,operands.actual,'TARGET_ACTUAL');assert.deepEqual(error.expected,operands.expected,'TARGET_EXPECTED');
 assert.equal(typeof error.stack,'string','TARGET_STACK');const location=new RegExp('verify-protected-withdrawal\\.mjs:(\\d+):(\\d+)').exec(error.stack);assert(location,'TARGET_LOCATION_MISSING');assert.equal(Number(location[1]),item.line,'TARGET_LINE');assert.equal(Number(location[2]),item.column,'TARGET_COLUMN');
 return {name:error.name,code:error.code,message:error.message,operator:error.operator,actual:evidence.encode(error.actual),expected:evidence.encode(error.expected),line:Number(location[1]),column:Number(location[2]),error:io.errorRecord(error)};
}
const state={state:'FAIL',required:[],actual:[],unique:[],notRun:[],cases:[],originalReplay:'NOT_REACHED',amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'},recordingErrors=[];let primary,ready=false,out;
function save(name,value){try{io.record(root,out,name,value);return true;}catch(error){recordingErrors.push({file:name,error:io.errorRecord(error)});try{fs.writeSync(2,JSON.stringify({kind:'recording',file:name,error:io.errorRecord(error)})+'\n');}catch{}return false;}}
try{
 assert.equal(process.argv.length,6);assert.equal(process.version,'v22.23.3');out=process.argv[5];assert.equal(out,'results/withdrawal-tamper');io.checkedDirectory(root,out);ready=true;
 const started=performance.now(),plan=JSON.parse(fs.readFileSync(io.checkedFile(root,'withdrawal-tamper-plan.json'))),pins=JSON.parse(fs.readFileSync(io.checkedFile(root,'withdrawal-tamper-pins.json'))),checkBudget=()=>assert(performance.now()-started<plan.workBudgetMs,'TAMPER_WORK_DEADLINE');
 const planBytes=fs.readFileSync(io.checkedFile(root,'withdrawal-tamper-plan.json'));assert.equal(hash(planBytes),pins.planSHA256);for(const [name,h]of Object.entries(pins.sourceHashes))assert.equal(hash(fs.readFileSync(io.checkedFile(root,name))),h,'CHILD_SOURCE_PIN');
 const inputPaths=plan.inputs.map(x=>io.checkedFile(root,x.path));assert.deepEqual(process.argv.slice(2,5),inputPaths,'FIXED_SAME_RUN_INPUTS');
 const originals=inputPaths.map(x=>fs.readFileSync(x)),inputHashes=originals.map(hash),abiBytes=fs.readFileSync(io.checkedFile(root,'withdrawal-abi.json')),abiHash=hash(abiBytes);assert.equal(abiHash,plan.abiSHA256);
 state.required=plan.cases.map(x=>x.id);state.notRun=state.required.slice();assert.deepEqual(state.required,Array.from({length:19},(_,i)=>'T'+String(i+1).padStart(2,'0')));assert.equal(new Set(plan.cases.map(x=>x.title)).size,19);
 // Input parsing/normal controls are outside each expected-error catch.
 for(let i=0;i<originals.length;i++){checkBudget();graph(JSON.parse(originals[i]));const d=decodeStoredGraph(originals[i]);assert.equal(d.amount,BigInt(plan.inputs[i].amount));assert.equal(d.sequence,BigInt(plan.inputs[i].sequence));verifyStoredWithdrawal(d,abiBytes,plan.abiSHA256);}
 for(const item of plan.cases){
  const result={id:item.id,title:item.title,state:'FAIL',preparation:'STARTED',target:item.targetMessage??null,line:item.line??null,column:item.column??null};state.actual.push(item.id);state.unique=[...new Set(state.actual)];state.notRun=state.required.filter(x=>!state.actual.includes(x));
  try{
   checkBudget();if(item.input!==undefined){result.preparation='READY';result.validation=verifyStoredWithdrawal(decodeStoredGraph(originals[item.input]),abiBytes,plan.abiSHA256);}
   else{
    const prepared=mutation(originals[0],item,abiBytes);result.preparation='READY';result.mutations=prepared.operations;result.declaredPaths=prepared.operations.map(x=>x.path);result.mutatedSHA256=hash(prepared.mutated);result.operands={actual:evidence.encode(prepared.actual),expected:evidence.encode(prepared.expected)};
    result.mutationRecord=save(item.id+'.mutation.json',{id:item.id,originalSHA256:inputHashes[0],mutatedSHA256:result.mutatedSHA256,declaredPaths:result.declaredPaths,operations:prepared.operations})?'RECORDED':'WRITE_FAILED';assert.equal(recordingErrors.length,0,'MUTATION_RECORD_FAILED');
    let rejection;try{verifyStoredWithdrawal(decodeStoredGraph(prepared.mutated),abiBytes,plan.abiSHA256);}catch(error){rejection=error;}assert(rejection,'MUTATION_NOT_REJECTED');
    result.actualRejection=io.errorRecord(rejection);
    try{result.observed=target(rejection,item,prepared);}catch(error){result.targetValidationError=io.errorRecord(error);throw error;}
   }
   result.state='PASS';
  }catch(error){result.error=io.errorRecord(error);if(primary===undefined)primary=error;}
  state.cases.push(result);save(item.id+'.json',result);if(result.state!=='PASS'||recordingErrors.length)break;
 }
 // Always attempt original replay separately, including after an expected-target failure.
 state.originalReplay='STARTED';const replay=[];for(let i=0;i<originals.length;i++){const entry={input:plan.inputs[i].path,expectedSHA256:inputHashes[i],sha256:null,state:'FAIL'};try{entry.sha256=hash(fs.readFileSync(inputPaths[i]));assert.equal(entry.sha256,inputHashes[i],'INPUT_BYTES_CHANGED');verifyStoredWithdrawal(decodeStoredGraph(originals[i]),abiBytes,plan.abiSHA256);entry.state='PASS';}catch(error){entry.error=io.errorRecord(error);if(primary===undefined)primary=error;}replay.push(entry);}
 let replayAbi=null,abiError=null;try{replayAbi=hash(fs.readFileSync(io.checkedFile(root,'withdrawal-abi.json')));assert.equal(replayAbi,abiHash,'ABI_BYTES_CHANGED');}catch(error){abiError=io.errorRecord(error);if(primary===undefined)primary=error;}
 state.originalReplay=replay.every(x=>x.state==='PASS')&&abiError===null?'PASS':'FAIL';save('original-replay.json',{state:state.originalReplay,inputs:replay,expectedAbiSHA256:abiHash,abiSHA256:replayAbi,abiError});
 assert.deepEqual(state.actual,state.required,'TAMPER_EXACT_LIST');assert.deepEqual(state.unique,state.required,'TAMPER_UNIQUE_LIST');assert(state.cases.every(x=>x.state==='PASS'),'TAMPER_CASE_FAILED');assert.equal(state.originalReplay,'PASS');assert.equal(recordingErrors.length,0,'TAMPER_RECORDING_FAILED');if(primary)throw primary;state.state='PASS';
}catch(error){if(primary===undefined)primary=error;state.error=io.errorRecord(primary);process.exitCode=1;}
finally{state.recordingErrors=recordingErrors;if(ready)save('cases.json',state);if(primary||recordingErrors.length){process.exitCode=1;try{fs.writeSync(2,JSON.stringify({primary:io.errorRecord(primary),recordingErrors,state})+'\n');}catch{}}}
