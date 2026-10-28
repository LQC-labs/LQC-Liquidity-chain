// Stored data only. Import defines functions; the explicit child entry point is gated below.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ethers} from 'ethers';
import {decodeStoredGraph,verifyStoredWithdrawal,roleNames} from './verify-protected-withdrawal.mjs';
import evidence from './failure-evidence.cjs';
import io from './stored-tamper-io.cjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function verifyW09Link(first,second,abiBytes,abiPin,individual){
 // These calls are mandatory, including for every claimed link-negative case.
 const one=verifyStoredWithdrawal(first,abiBytes,abiPin);individual.push({input:0,state:'PASS',sequence:one.sequence});
 const two=verifyStoredWithdrawal(second,abiBytes,abiPin);individual.push({input:1,state:'PASS',sequence:two.sequence});
 assert.notEqual(first.link.hash,second.link.hash,'LINK_DISTINCT_TRANSACTION');
 assert.equal(first.sequence,1n,'LINK_FIRST_SEQUENCE');
 assert.equal(second.sequence,2n,'LINK_SECOND_SEQUENCE');
 assert.equal(first.amount,10n,'LINK_FIRST_AMOUNT');
 assert.equal(second.amount,10n,'LINK_SECOND_AMOUNT');
 assert.deepEqual(second.scope,first.scope,'LINK_SCOPE');
 assert.deepEqual(second.runtimeValues,first.runtimeValues,'LINK_IMMUTABLES');
 const codeView=side=>side.codes.map(({role,address,bytes,hash})=>({role,address,bytes,hash})).sort((a,b)=>a.role.localeCompare(b.role));
 assert.deepEqual(codeView(second.before),codeView(first.after),'LINK_RUNTIME');
 assert.deepEqual(second.before.values,first.after.values,'LINK_BOUNDARY_VALUES');
 assert.equal(Object.keys(first.after.values).length,73,'LINK_BOUNDARY_COUNT');
 assert(BigInt(first.link.block.number)<BigInt(second.before.block.number),'LINK_BLOCK_ORDER');
 assert(BigInt(first.link.block.number)<BigInt(second.link.block.number),'LINK_SUCCESS_ORDER');
 assert(BigInt(first.link.block.timestamp)<=BigInt(second.link.block.timestamp),'LINK_TIME_ORDER');
 // Deliberately no equality of observation metadata, inter-success adjacency or gap-history claim.
 const a=first.before.values,b=first.after.values,c=second.before.values,d=second.after.values;
 assert.deepEqual(a.withdrawal,[0n,0n],'LINK_INITIAL_WITHDRAWAL');
 assert.deepEqual(b.withdrawal,[10n,1n],'LINK_FIRST_WITHDRAWAL');
 assert.deepEqual(c.withdrawal,[10n,1n],'LINK_SECOND_BEFORE_WITHDRAWAL');
 assert.deepEqual(d.withdrawal,[20n,2n],'LINK_FINAL_WITHDRAWAL');
 assert.deepEqual([a.domainWithdrawn,b.domainWithdrawn,c.domainWithdrawn,d.domainWithdrawn],[0n,10n,10n,20n],'LINK_DOMAIN_TOTAL');
 assert.deepEqual([a.withdrawalState[2],b.withdrawalState[2],c.withdrawalState[2],d.withdrawalState[2]],[20n,10n,10n,0n],'LINK_AVAILABLE');
 assert.equal(b.withdrawalReceipt1,one.commitment,'LINK_RECEIPT1');
 assert.equal(c.withdrawalReceipt1,one.commitment,'LINK_RECEIPT1_RETAINED');
 assert.equal(d.withdrawalReceipt1,one.commitment,'LINK_RECEIPT1_FINAL');
 assert.equal(c.withdrawalReceipt2,ethers.ZeroHash,'LINK_RECEIPT2_ABSENT');
 assert.equal(d.withdrawalReceipt2,two.commitment,'LINK_RECEIPT2_ADDED');
 assert.equal(d.longToken-a.longToken,20n,'LINK_WALLET_TOTAL');
 for(const label of ['partialToken','accounted'])assert.equal(a[label]-d[label],20n,'LINK_DEBIT:'+label);
 for(const i of [0,5])assert.equal(a.pool[i]-d.pool[i],20n,'LINK_POOL_DEBIT:'+i);
 const changed=new Set(['withdrawal','withdrawalState','domainWithdrawn','longToken','partialToken','accounted','pool','withdrawalReceipt1','withdrawalReceipt2']);
 for(const label of Object.keys(a))if(!changed.has(label))assert.deepEqual(d[label],a[label],'LINK_UNCHANGED:'+label);
 for(let i=1;i<12;i++)if(i!==5)assert.equal(d.pool[i],a.pool[i],'LINK_POOL_UNCHANGED:'+i);
 return {state:'PASS',sequences:[1n,2n],amounts:[10n,10n],cumulative:[0n,10n,20n],transactions:[first.link.hash,second.link.hash],blocks:[first.link.block.number,second.link.block.number],meaning:'Selected stored observations only; not intermediate history or RPC truth',amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'};
}
function main(){
 const plan=JSON.parse(fs.readFileSync(io.checkedFile(root,'w09-link-plan.json'))),pins=JSON.parse(fs.readFileSync(io.checkedFile(root,'w09-link-pins.json')));
 const out=plan.resultRoot;let ready=false,primary;const recordErrors=[],report={state:'FAIL',required:plan.cases.map(x=>x.id),actual:[],unique:[],notRun:plan.cases.map(x=>x.id),cases:[],replay:'NOT_REACHED'};
 function save(name,value){try{assert(ready,'LINK_OUTPUT_NOT_READY');io.record(root,out,name,value);return true;}catch(error){recordErrors.push({file:name,error:io.errorRecord(error)});try{fs.writeSync(2,JSON.stringify({recordError:io.errorRecord(error),file:name})+'\n');}catch{}return false;}}
 let inputs,hashes,abi,abiHash;
 try{
  assert.equal(process.argv.length,2);assert.equal(process.platform,'linux');assert.equal(process.version,'v22.23.3');io.checkedDirectory(root,out);assert.deepEqual(fs.readdirSync(path.join(root,out)).sort(),['invocation.json'],'LINK_PRIOR_CHILD_RESULT');ready=true;
  assert.equal(hash(fs.readFileSync(io.checkedFile(root,'w09-link-plan.json'))),pins.planSHA256);
  inputs=plan.inputs.map(x=>fs.readFileSync(io.checkedFile(root,x)));hashes=inputs.map(hash);abi=fs.readFileSync(io.checkedFile(root,'withdrawal-abi.json'));abiHash=hash(abi);assert.equal(abiHash,plan.abiSHA256);
  save('preflight.json',{inputs:plan.inputs.map((file,i)=>({file,sha256:hashes[i]})),abiSHA256:abiHash,required:report.required});assert.equal(recordErrors.length,0);
  for(const item of plan.cases){
   const row={id:item.id,title:item.title,state:'FAIL',preparation:'STARTED',individual:[],operations:[],declaredPaths:item.paths,originalSHA256:hashes,rejectionState:'NOT_REACHED',targetAssessment:'NOT_REACHED'};report.actual.push(item.id);report.unique=[...new Set(report.actual)];report.notRun=report.required.filter(x=>!report.actual.includes(x));
   try{
    // Decode original bytes separately for every case. No prior mutation is reused.
    let first=decodeStoredGraph(inputs[0]),second=decodeStoredGraph(inputs[1]);const originalFirst=first,originalSecond=second;
    const replace=(object,key,value,route)=>{assert(Object.hasOwn(object,key),'LINK_MUTATION_FIELD');row.operations.push({path:route,before:evidence.encode(object[key]),after:evidence.encode(value)});object[key]=value;};
    let operands;
    if(item.kind==='reverse'){first=originalSecond;second=originalFirst;row.operations.push({operation:'swap-pair-order',path:['pair'],before:[0,1],after:[1,0]});operands={actual:2n,expected:1n};}
    if(item.kind==='duplicate'){second=decodeStoredGraph(inputs[0]);row.operations.push({operation:'replace-pair-input',path:['pair',1],before:1,after:0});operands={actual:first.link.hash,expected:first.link.hash};}
    if(item.kind==='boundary'){
     for(const sideName of ['before','after']){const side=second[sideName],q=side.queries.find(q=>q.label==='governanceToken');assert(q&&q.method==='balanceOf','LINK_MUTATION_PREPARATION');const value=side.values.governanceToken+1n,iface=new ethers.Interface(JSON.parse(abi).contracts.LocalVNextToken.abi);replace(side.values,'governanceToken',value,[1,sideName,'values','governanceToken']);replace(q,'value',value,[1,sideName,'queries','governanceToken','value']);replace(q,'raw',iface.encodeFunctionResult('balanceOf',[value]),[1,sideName,'queries','governanceToken','raw']);}
     operands={actual:second.before.values,expected:first.after.values};
    }
    if(item.kind==='scope'){
     const old=second.scope.O,value='0x1111111111111111111111111111111111111111';assert(![...Object.values(second.scope.addresses),second.scope.G,second.scope.L,old].some(x=>x.toLowerCase()===value.toLowerCase()),'LINK_SCOPE_MUTATION_COLLISION');replace(second.scope,'O',value,[1,'scope','O']);
     const fixed=JSON.parse(abi);for(const sideName of ['before','after'])for(const q of second[sideName].queries){const args=q.args.map(x=>x===old?value:x);if(args.some((x,i)=>x!==q.args[i])){const iface=new ethers.Interface(fixed.contracts[roleNames[q.role]].abi);replace(q,'args',args,[1,sideName,'queries',q.label,'args']);replace(q,'input',iface.encodeFunctionData(q.method,args),[1,sideName,'queries',q.label,'input']);}}
     operands={actual:second.scope,expected:first.scope};
    }
    assert.deepEqual(row.operations.map(x=>x.path),item.paths,'LINK_DECLARED_PATHS');
    if(['boundary','scope'].includes(item.kind)){
     const rebuilt=decodeStoredGraph(inputs[1]);
     for(const op of row.operations){let node=rebuilt;const route=op.path.slice(1);for(const key of route.slice(0,-1))node=Array.isArray(node)&&typeof key==='string'&&!/^\d+$/.test(key)?node.find(x=>x.label===key):node[key];const key=route.at(-1);assert.deepEqual(node[key],decodeStoredGraph(Buffer.from(JSON.stringify(op.before))),'LINK_OPERATION_BEFORE');node[key]=decodeStoredGraph(Buffer.from(JSON.stringify(op.after)));}
     assert.deepEqual(second,rebuilt,'LINK_UNDECLARED_MUTATION');
     assert.deepEqual(first,decodeStoredGraph(inputs[0]),'LINK_FIRST_UNCHANGED');
    }
    row.mutatedSHA256=[hash(Buffer.from(evidence.stringify(first))),hash(Buffer.from(evidence.stringify(second)))];row.preparation='READY';
    // Serialize+decode the independent graph copies before both verification layers.
    first=decodeStoredGraph(Buffer.from(evidence.stringify(first)));second=decodeStoredGraph(Buffer.from(evidence.stringify(second)));
    if(item.kind==='normal'){row.result=evidence.encode(verifyW09Link(first,second,abi,plan.abiSHA256,row.individual));}
    else{
     let actual;row.actualRejection=null;row.rejectionState='STARTED';try{verifyW09Link(first,second,abi,plan.abiSHA256,row.individual);row.rejectionState='ABSENT';}catch(error){actual=error;row.rejectionState='THROWN';row.actualRejection=io.errorRecord(error);}
     if(row.rejectionState==='ABSENT'){const error=Error('LINK_EXPECTED_REJECTION_ABSENT');row.expectedRejectionMissingError=io.errorRecord(error);row.targetAssessment='NOT_RUN';throw error;}
     row.operands={actual:evidence.encode(operands.actual),expected:evidence.encode(operands.expected)};
     row.targetAssessment='STARTED';
     try{assert.deepEqual(row.individual.map(x=>x.state),['PASS','PASS'],'LINK_INDIVIDUAL_PREREQUISITES');assert(actual instanceof assert.AssertionError,'LINK_TARGET_TYPE');assert.equal(actual.code,'ERR_ASSERTION');assert.equal(actual.generatedMessage,false);assert.equal(actual.message.split('\n')[0],item.targetMessage,'LINK_TARGET_MESSAGE');assert.equal(actual.operator,item.operator,'LINK_TARGET_OPERATOR');assert.deepEqual(actual.actual,operands.actual,'LINK_TARGET_ACTUAL');assert.deepEqual(actual.expected,operands.expected,'LINK_TARGET_EXPECTED');const pos=/w09-link\.mjs:(\d+):(\d+)/.exec(actual.stack);assert(pos,'LINK_TARGET_LOCATION');assert.equal(Number(pos[1]),item.line);assert.equal(Number(pos[2]),item.column);row.observed={name:actual.name,code:actual.code,generatedMessage:actual.generatedMessage,message:actual.message,operator:actual.operator,actual:evidence.encode(actual.actual),expected:evidence.encode(actual.expected),line:Number(pos[1]),column:Number(pos[2])};row.targetMatched=true;row.targetAssessment='PASS';}catch(error){row.targetAssessment='FAIL';row.targetValidationError=io.errorRecord(error);throw error;}
    }
    assert.equal(row.operations.length,item.operations,'LINK_MUTATION_OPERATION_COUNT');row.state='PASS';
   }catch(error){row.error=io.errorRecord(error);if(primary===undefined)primary=error;}
   const mutation={id:item.id,preparation:row.preparation,declaredPaths:item.paths,operations:row.operations,originalSHA256:hashes};if(Object.hasOwn(row,'mutatedSHA256'))mutation.mutatedSHA256=row.mutatedSHA256;
   row.mutationRecord=save(item.id+'.mutation.json',mutation)?'RECORDED':'WRITE_FAILED';
   report.cases.push(row);save(item.id+'.json',row);if(row.state!=='PASS'||recordErrors.length)break;
  }
 }catch(error){if(primary===undefined)primary=error;}
 finally{
  // Replay is attempted independently after failures; each original has its own result.
  const replay={state:'FAIL',inputs:[],abiSHA256:null,abiError:null},reread=[];
  if(ready&&inputs){report.replay='STARTED';try{const current=fs.readFileSync(io.checkedFile(root,'withdrawal-abi.json'));replay.abiSHA256=hash(current);assert.equal(replay.abiSHA256,plan.abiSHA256);}catch(error){replay.abiError=io.errorRecord(error);if(primary===undefined)primary=error;}
   for(let i=0;i<2;i++){const entry={input:plan.inputs[i],expectedSHA256:hashes[i],sha256:null,state:'FAIL'};try{const bytes=fs.readFileSync(io.checkedFile(root,plan.inputs[i]));reread[i]=bytes;entry.sha256=hash(bytes);assert.equal(entry.sha256,hashes[i],'LINK_ORIGINAL_CHANGED');verifyStoredWithdrawal(decodeStoredGraph(bytes),abi,plan.abiSHA256);entry.state='PASS';}catch(error){entry.error=io.errorRecord(error);if(primary===undefined)primary=error;}replay.inputs.push(entry);}
   try{assert(replay.inputs.every(x=>x.state==='PASS'),'LINK_REPLAY_INPUTS_FAILED');const pair=[];verifyW09Link(decodeStoredGraph(reread[0]),decodeStoredGraph(reread[1]),abi,plan.abiSHA256,pair);replay.pair='PASS';}catch(error){replay.pair='FAIL';replay.error=io.errorRecord(error);if(primary===undefined)primary=error;}
   replay.state=replay.inputs.every(x=>x.state==='PASS')&&replay.pair==='PASS'&&!replay.abiError?'PASS':'FAIL';report.replay=replay.state;save('original-replay.json',replay);
  }
  report.recordErrors=recordErrors;report.error=io.errorRecord(primary);report.state=!primary&&!recordErrors.length&&report.actual.length===plan.cases.length&&report.replay==='PASS'?'PASS':'FAIL';if(ready)save('cases.json',report);if(primary||recordErrors.length||report.state!=='PASS'){process.exitCode=1;try{fs.writeSync(2,JSON.stringify({primary:io.errorRecord(primary),recordErrors})+'\n');}catch{}}
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
