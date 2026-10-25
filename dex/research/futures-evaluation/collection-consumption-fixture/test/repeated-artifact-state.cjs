// Data-only artifact judgment shared by the R01 runner and Linux collector.
// This is not execution verification, a history terminal or RPC authentication.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
function assessRepeatedArtifacts({phase,plan,io}){
 const required=new Set(),errors=[],hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 let primary,state='UNKNOWN';
 const need=names=>names.forEach(n=>required.add(n));
 const read=name=>{try{const value=JSON.parse(io.readBytes(name).toString('utf8'));assert(value&&typeof value==='object');return value;}catch(cause){throw Object.assign(Error('R01_RECORD_INVALID:'+name,{cause}),{file:name,code:'R01_RECORD_INVALID'});}};
 const typed=name=>{
  const ids=new Map(),doc=read(name);
  const decode=x=>{
   if(x===null||typeof x!=='object')return x;
   if(Object.hasOwn(x,'$ref')){assert(ids.has(x.$ref),'R01_UNKNOWN_REF');return ids.get(x.$ref);}
   if(x.$type==='bigint'){assert.match(x.decimal,/^-?(0|[1-9][0-9]*)$/);return BigInt(x.decimal);}
   if(x.$type==='undefined')return undefined;
   assert(['array','object','error'].includes(x.$type),'R01_TYPED_KIND');assert(Number.isInteger(x.$id)&&x.$id>0&&!ids.has(x.$id),'R01_TYPED_ID');
   const out=x.$type==='array'?[]:Object.create(null);ids.set(x.$id,out);
   for(const [k,v]of Object.entries(x.properties)){if(Array.isArray(out)&&k==='length')continue;Object.defineProperty(out,k,{value:decode(v),enumerable:true});}return out;
  };
  try{return decode(doc);}catch(cause){throw Object.assign(Error('R01_TYPED_INVALID:'+name,{cause}),{file:name,code:'R01_TYPED_INVALID'});}
 };
 try{
  assert(phase&&[0,1].includes(phase.calls),'R01_PHASE_CALLS');
  if(!phase.calls){assert.equal(phase.state,'NOT_RUN');assert(!io.exists('runner-summary.json'),'R01_NOT_RUN_OUTPUT');state='NOT_RUN';}
  else{
   need(plan.artifacts.always);
   const runner=read('runner-summary.json');assert([0,1].includes(runner.calls));assert.deepEqual(runner.required,['R01']);assert.deepEqual(runner.unique,[...new Set(runner.actual)]);assert.equal(new Set(runner.actual).size,runner.actual.length);
   if(!runner.calls){assert.equal(runner.state,'FAIL');assert.equal(runner.execution,'NOT_RUN');assert.deepEqual(runner.actual,[]);for(const file of plan.artifacts.attempted)assert(!io.exists(file),'R01_UNEXECUTED_CASE_OUTPUT');}
   else{
    need(plan.artifacts.attempted);
    const terminal=read('case-state.json');assert.equal(terminal.id,'R01');assert(['PASS','FAIL'].includes(terminal.state));assert(Array.isArray(terminal.steps)&&terminal.steps.length<=2);
    // Requirements are registered before any later fallible parse.
    for(let n=1;n<=2;n++){
     const step=terminal.steps[n-1],prefix='step-'+n+'-';
     if(step){assert.equal(step.sequence,n);assert.equal(typeof step.started,'boolean');}
     const files=['positive-started.json','positive-queries.jsonl','positive-fee.json','positive-state.json'];
     const any=[...files,'positive-validation.json','positive-failure.json'].some(f=>io.exists(prefix+f));
     if(step?.started||any)need(files.map(f=>prefix+f));
     if(step?.validation==='PASS')need([prefix+'positive-validation.json']);
     if(step?.collectionState==='FAILURE')need([prefix+'positive-failure.json']);
    }
    if(terminal.state==='FAIL')need(plan.artifacts.failure);
    if(terminal.observation?.validation==='PASS')need(['repeated-validation.json']);
    const start=typed('case-started.json'),partial=typed('case-partial.json');assert.equal(start.id,'R01');assert.equal(start.state,'STARTED');assert.equal(partial.id,'R01');
    assert.deepEqual(JSON.parse(JSON.stringify(partial.steps)),terminal.steps,'R01_PARTIAL_TERMINAL_STEPS');
    const report=read('mocha.json'),title=plan.cases[0].fullTitle;assert.equal(report.reporter?.state,'COMPLETE');
    assert.deepEqual(report.tests.map(x=>x.fullTitle),[title]);assert.equal(report.stats.tests,1);assert.deepEqual(runner.actual,['R01']);
    for(const k of ['passes','failures','pending'])assert.equal(report.stats[k],report[k].length);
    assert.deepEqual(report.pending,[]);assert.deepEqual(report[terminal.state==='PASS'?'passes':'failures'].map(x=>x.fullTitle),[title]);assert.deepEqual(report[terminal.state==='PASS'?'failures':'passes'],[]);
    for(let n=1;n<=2;n++){
     const step=terminal.steps[n-1],prefix='step-'+n+'-';
     if(!step?.started){for(const f of [...plan.artifacts.observationAttempted,...plan.artifacts.validationPassed,...plan.artifacts.observationFailed].filter(x=>x.startsWith(prefix)))assert(!io.exists(f),'R01_UNSTARTED_STEP_OUTPUT:'+f);continue;}
     assert(['STARTED','OBSERVED'].includes(step.stage));assert(['NOT_RUN','FAIL','PASS'].includes(step.validation));assert(['SUCCESS','FAILURE'].includes(step.collectionState));
     const begun=read(prefix+'positive-started.json'),record=typed(prefix+'positive-fee.json'),done=read(prefix+'positive-state.json');
     assert.equal(begun.caseId,'R01');assert.equal(begun.state,'STARTED');assert.equal(record.schema,'LQC_REPEATED_STEP_1');assert.equal(record.sequence,BigInt(n));
     assert.equal(record.status==='COLLECTED',step.stage==='OBSERVED');assert.equal(done.caseId,'R01');assert.equal(done.state,step.collectionState);assert.deepEqual(done.observation,step);
     const lines=io.readBytes(prefix+'positive-queries.jsonl').toString('utf8').split('\n');assert.equal(lines.pop(),'','R01_JOURNAL_UNTERMINATED');for(const line of lines)assert.equal(JSON.parse(line).$type,'object','R01_JOURNAL_RECORD');
     if(step.validation==='PASS'){
      const validation=typed(prefix+'positive-validation.json');assert.equal(validation.state,'PASS');assert.equal(validation.caseId,'R01');assert.equal(validation.evidenceSHA256,hash(io.readBytes(prefix+'positive-fee.json')));assert.equal(step.stage,'OBSERVED');
     }else assert(!io.exists(prefix+'positive-validation.json'),'R01_UNCONFIRMED_VALIDATION');
     if(step.collectionState==='FAILURE'){const failed=typed(prefix+'positive-failure.json');assert(failed.failures.length>0);}
     else{assert.equal(step.validation,'PASS');assert(!io.exists(prefix+'positive-failure.json'),'R01_SUCCESS_FAILURE_CONFLICT');}
    }
    assert.deepEqual(JSON.parse(JSON.stringify(partial.observation)),terminal.observation,'R01_AGGREGATE_TERMINAL_CONFLICT');
    if(terminal.observation?.validation==='PASS'){
     assert.equal(terminal.steps.length,2);assert(terminal.steps.every(x=>x.started&&x.stage==='OBSERVED'&&x.validation==='PASS'&&x.collectionState==='SUCCESS'));
     const validation=typed('repeated-validation.json');assert.equal(validation.id,'R01');assert.equal(validation.state,'PASS');
     assert.equal(validation.firstSHA256,hash(io.readBytes('step-1-positive-fee.json')));assert.equal(validation.secondSHA256,hash(io.readBytes('step-2-positive-fee.json')));
     assert.equal(validation.amount,null);assert.equal(validation.authority,false);assert.equal(validation.consumptionLink,'UNVERIFIED');assert.equal(validation.rightsLink,'UNVERIFIED');
    }else assert(!io.exists('repeated-validation.json'),'R01_UNCONFIRMED_COMBINED_VALIDATION');
    if(terminal.state==='PASS'){
     need(plan.artifacts.success);assert(terminal.terminationConfirmed&&terminal.cleanupSettled);assert.equal(terminal.observation?.validation,'PASS');
    }else{const failure=typed('case-failure.json');assert.equal(failure.id,'R01');assert(failure.failures.length>0);}
   }
   if(phase.state==='PASS'){assert.equal(runner.calls,1);assert.equal(runner.state,'PASS');assert.equal(runner.exitCode,0);assert.deepEqual(runner.recordingErrors,[]);assert.deepEqual(runner.actual,['R01']);assert.deepEqual(runner.unique,['R01']);assert.equal(read('case-state.json').state,'PASS');need(plan.artifacts.success);}
   state=phase.state;
  }
 }catch(error){primary=error;errors.push({file:error.file,error});}
 for(const file of required)if(!io.exists(file)){const error=Object.assign(Error('R01_REQUIRED_MISSING:'+file),{file,code:'R01_REQUIRED_MISSING'});primary??=error;errors.push({file,error});}
 if(primary)state='UNKNOWN';return {ok:!primary,state,required:[...required].sort(),primary,errors};
}
module.exports={assessRepeatedArtifacts};
