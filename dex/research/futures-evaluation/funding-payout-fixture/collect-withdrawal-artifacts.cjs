const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {checkedFile,checkedDirectory,createOutput,errorRecord}=require('./test/stored-tamper-io.cjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
// Called by the one-shot runner after its immutable summary has been written.
// Tests and collection have separate conclusions; either failure makes overall failure.
function stageWithdrawalArtifacts(root,plan,pins,summary,report){
 const out='results/protected-withdrawal',stage=out+'/artifact',required=new Set(plan.artifacts.runner),optional=new Set(),errors=[],states={},copied=[];
 const error=(file,e)=>errors.push({file,error:errorRecord(e)});
 const read=file=>JSON.parse(fs.readFileSync(checkedFile(root,file)));
 const actual=summary.actual??[],passed=report?.passes?.map(x=>x.fullTitle)??[],failed=report?.failures?.map(x=>x.fullTitle)??[];
 if(summary.calls===1)for(const name of plan.artifacts.child)required.add(name);
 else if(summary.calls!==0)error('runner-summary.json',Error('INVALID_CHILD_CALL_COUNT'));
 for(const item of plan.cases){
  states[item.id]='UNKNOWN';const relative=out+'/'+item.id,exists=fs.existsSync(path.join(root,relative)),executed=actual.includes(item.id);
  if(!exists&&!executed){
   const noChild=summary.calls===0&&summary.execution==='NOT_RUN'&&summary.state==='FAIL';
   const bailed=summary.calls===1&&report?.reporter?.state==='COMPLETE'&&report.failures?.length>0&&actual.every((id,index)=>plan.cases[index]?.id===id)&&!passed.includes(item.fullTitle)&&!failed.includes(item.fullTitle);
   if(noChild||bailed){states[item.id]='NOT_RUN';continue;}
   error(relative,Error('MISSING_CASE_NOT_PROVEN_NOT_RUN'));continue;
  }
  for(const name of plan.artifacts.attempted)required.add(item.id+'/'+name);
  try{
   checkedDirectory(root,relative);const s=read(relative+'/state.json');assert.equal(s.id,item.id);assert(['PASS','FAIL'].includes(s.state),'CASE_TERMINAL_STATE');assert(['NOT_RUN','STARTED','PASS','FAIL'].includes(s.validation),'CASE_VALIDATION_STATE');
   if(s.validation==='PASS')required.add(item.id+'/validation.json');
   assert(Array.isArray(s.withdrawals),'WITHDRAWAL_DOCUMENT_STATES');const seen=new Set();for(const entry of s.withdrawals){assert(/^withdrawal-[12]\.json$/.test(entry.document)&&!seen.has(entry.document),'DOCUMENT_NAME_OR_DUPLICATE');seen.add(entry.document);required.add(item.id+'/'+entry.document);assert(['NOT_RUN','STARTED','PASS'].includes(entry.validation),'DOCUMENT_VALIDATION_STATE');if(entry.validation==='PASS')required.add(item.id+'/'+entry.document.replace('.json','-validation.json'));}
   if(s.state==='PASS'){assert.equal(s.withdrawals.length,item.expectedDocuments,'EXPECTED_DOCUMENT_COUNT');assert(s.withdrawals.every(x=>x.validation==='PASS'),'SUCCESS_DOCUMENT_VALIDATION');}
   if(s.state==='FAIL')required.add(item.id+'/failure.json');
   if(s.state==='PASS'){assert.equal(s.setup,'PASS');assert.equal(s.validation,'PASS');assert.equal(s.terminationConfirmed,true);assert.equal(s.cleanupSettled,true);assert.equal(s.cleanupSucceeded,true);assert.equal(s.poisoned,false);assert(passed.includes(item.fullTitle),'CASE_MOCHA_PASS_CONFLICT');}
   else assert(failed.includes(item.fullTitle),'CASE_MOCHA_FAILURE_CONFLICT');
   states[item.id]=s.state;
  }catch(e){error(relative+'/state.json',e);required.add(item.id+'/failure.json');}
 }
 const select=new Map(),requiredDestinations=new Set();
 const addSelection=file=>{try{
  assert.equal(typeof file.required,'boolean');assert.equal(typeof file.destination,'string');assert(!path.posix.isAbsolute(file.destination)&&!file.destination.includes('\\'),'ARTIFACT_DESTINATION_RELATIVE');
  assert(file.destination.split('/').every(part=>part&&part!=='.'&&part!=='..'&&!['node_modules','.git','prepared'].includes(part)),'ARTIFACT_DESTINATION_PART');
  if(file.required)requiredDestinations.add(file.destination);const verifiedSource=checkedFile(root,file.source),prior=select.get(file.destination),origin={source:file.source,required:file.required};
  if(prior){assert.equal(prior.source,file.source,'ARTIFACT_DIFFERENT_SOURCE_COLLISION');assert.equal(prior.verifiedSource,verifiedSource,'ARTIFACT_VERIFIED_SOURCE_COLLISION');prior.required=prior.required||file.required;prior.selections.push(origin);}
  else select.set(file.destination,{...file,verifiedSource,selections:[origin]});
 }catch(e){error(file.source,e);}};
 for(const name of required)addSelection({source:out+'/'+name,destination:name,required:true});
 for(const file of Object.keys(pins.sourceHashes))addSelection({source:file,destination:'sources/'+file,required:true});
 for(const file of ['withdrawal-plan.json','withdrawal-pins.json'])addSelection({source:file,destination:'sources/'+file,required:true});
 for(const file of plan.artifacts.build){if(fs.existsSync(path.join(root,file)))addSelection({source:file,destination:file,required:true});else if(summary.calls===1)error(file,Error('REVIEWED_BUILD_FILE_MISSING'));}
 try{assert(!fs.existsSync(path.join(root,stage)),'PRIOR_ARTIFACT_STAGE');createOutput(root,stage);}catch(e){error(stage,e);return {state:'FAIL',states,errors,copied,required:[...required]};}
 for(const file of select.values())try{
  const source=checkedFile(root,file.source),destination=stage+'/'+file.destination,parent=path.posix.dirname(destination);createOutput(root,parent);
  // No directory walks, links, node_modules, junctions or unlisted helper material.
  assert(!file.destination.split('/').some(x=>['node_modules','.git','prepared'].includes(x)),'ARTIFACT_FORBIDDEN_COMPONENT');
  assert.equal(source,file.verifiedSource,'ARTIFACT_SOURCE_CHANGED');const bytes=fs.readFileSync(source);
  if(file.source.endsWith('.json'))JSON.parse(bytes);
  if(file.source.endsWith('.jsonl')){const text=bytes.toString();assert(!text||text.endsWith('\n'),'PARTIAL_JOURNAL_LINE');for(const line of text.split('\n').filter(Boolean))JSON.parse(line);}
  fs.writeFileSync(path.join(root,destination),bytes,{flag:'wx'});assert.equal(sha(fs.readFileSync(checkedFile(root,destination))),sha(bytes));copied.push({source:file.source,path:file.destination,required:file.required,selections:file.selections,bytes:bytes.length,sha256:sha(bytes)});
 }catch(e){error(file.source,e);}
 for(const destination of requiredDestinations)if(!copied.some(file=>file.path===destination))error(stage+'/'+destination,Error('ARTIFACT_REQUIRED_DESTINATION_MISSING'));
 const result={state:errors.length?'FAIL':'PASS',scope:'FILES_ONLY_NOT_EXECUTION_OR_RIGHTS_APPROVAL',states,required:[...required],requiredDestinations:[...requiredDestinations],copied,errors};
 try{fs.writeFileSync(path.join(root,stage,'manifest.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});}catch(e){error(stage+'/manifest.json',e);result.state='FAIL';}
 return result;
}
module.exports={stageWithdrawalArtifacts};
