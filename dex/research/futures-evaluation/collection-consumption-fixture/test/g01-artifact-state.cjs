// Shared collector policy. Data-only IO; no fs, provider, timers or fixture imports.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
class G01ArtifactError extends Error {
 constructor(code,file,cause){super(code+': '+file,{cause});this.name='G01ArtifactError';this.code=code;this.file=file;this.assertion=code+':'+file;}
}
function assessG01Artifacts({summary,plan:positivePlan,io}){
 const positivePrefix='results/positive-fee/',required=new Set(),errors=[];
 const executionStates={positiveFee:'UNKNOWN',feeObservation:'UNKNOWN',feeValidation:'UNKNOWN'};
 const need=files=>files.forEach(file=>required.add(file)),exists=file=>io.exists(file),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 const readText=file=>{try{return io.readBytes(file).toString('utf8');}catch(error){throw new G01ArtifactError(error.code==='ENOENT'?'G01_REQUIRED_MISSING':'G01_READ_FAILED',file,error);}};
 const recorded=file=>{const text=readText(file);try{const value=JSON.parse(text);assert(value&&typeof value==='object'&&!Array.isArray(value),'EVIDENCE_RECORD_OBJECT_REQUIRED');return value;}catch(error){throw new G01ArtifactError('G01_JSON_INVALID',file,error);}};
 let primary;
 try{
   const positivePhase=summary.phases['positive-fee'];
   executionStates.positiveFee='UNKNOWN';executionStates.feeObservation='UNKNOWN';executionStates.feeValidation='UNKNOWN';
   if(positivePhase.calls){
    executionStates.positiveFee='UNKNOWN';assert.equal(summary.phases['positive-tamper'].state,'PASS','POSITIVE_REQUIRES_PRIOR_PHASE_SUCCESS');
    need(positivePlan.artifacts.always.map(file=>positivePrefix+file));
    const runner=recorded(positivePrefix+'runner-summary.json');assert([0,1].includes(runner.calls));assert.deepEqual(runner.required,['G01']);
    assert(Array.isArray(runner.actual)&&Array.isArray(runner.unique));assert.equal(new Set(runner.actual).size,runner.actual.length);assert.deepEqual(runner.unique,[...new Set(runner.actual)]);
    if(runner.calls){
     assert.equal(runner.execution,'EXECUTED');
     need(positivePlan.artifacts.attempted.map(file=>positivePrefix+file));
     if([...positivePlan.artifacts.observationAttempted,...positivePlan.artifacts.validationPassed,...positivePlan.artifacts.observationFailed].some(file=>io.exists(positivePrefix+file)))need(positivePlan.artifacts.observationAttempted.map(file=>positivePrefix+file));
     const terminal=recorded(positivePrefix+'case-state.json');assert.equal(terminal.id,'G01');assert(['PASS','FAIL'].includes(terminal.state));
     const observed=terminal.observation;assert(observed&&typeof observed.started==='boolean','POSITIVE_OBSERVATION_STATE_REQUIRED');
     assert.deepEqual(Object.keys(observed).sort(),['started','stage','validation','collectionState'].sort(),'POSITIVE_OBSERVATION_FIELDS');
     // Register every known requirement before reading any other fallible record.
     if(observed.started)need(positivePlan.artifacts.observationAttempted.map(file=>positivePrefix+file));
     if(observed.validation==='PASS')need(positivePlan.artifacts.validationPassed.map(file=>positivePrefix+file));
     if(observed.collectionState==='FAILURE')need(positivePlan.artifacts.observationFailed.map(file=>positivePrefix+file));
     if(terminal.state==='FAIL')need(positivePlan.artifacts.failure.map(file=>positivePrefix+file));
     const typed=file=>{
      const document=recorded(positivePrefix+file),ids=new Map();
      try{
       assert.equal(document.$type,'object','POSITIVE_TYPED_ROOT');
       const decode=node=>{
        if(node===null||typeof node!=='object')return node;
        if(Object.hasOwn(node,'$ref')){assert(ids.has(node.$ref),'POSITIVE_UNKNOWN_REF');return ids.get(node.$ref);}
        if(node.$type==='bigint'){assert.match(node.decimal,/^-?(0|[1-9][0-9]*)$/);return BigInt(node.decimal);}
        if(node.$type==='undefined')return undefined;
        if(!['object','array','error'].includes(node.$type))return node; // Inert error markers; no getters or code evaluated.
        assert(Number.isInteger(node.$id)&&node.$id>0,'POSITIVE_TYPED_ID');assert(node.properties&&typeof node.properties==='object','POSITIVE_TYPED_PROPERTIES');assert(!ids.has(node.$id),'POSITIVE_DUPLICATE_TYPED_ID');const value=node.$type==='array'?[]:Object.create(null);ids.set(node.$id,value);
        for(const [key,item]of Object.entries(node.properties)){if(Array.isArray(value)&&key==='length')continue;Object.defineProperty(value,key,{value:decode(item),enumerable:true});}return value;
       };return decode(document);
      }catch(error){errors.push({path:positivePrefix+file,error});throw new G01ArtifactError('G01_TYPED_INVALID',positivePrefix+file,error);}
     };
     const start=typed('case-started.json'),partial=typed('case-partial.json');assert.equal(start.id,'G01');assert.equal(start.state,'STARTED');assert.equal(partial.id,'G01');
     assert(partial.observation&&typeof partial.observation==='object','POSITIVE_PARTIAL_OBSERVATION_REQUIRED');
     assert.deepEqual(JSON.parse(JSON.stringify(partial.observation)),observed,'POSITIVE_PARTIAL_TERMINAL_CONFLICT');
     const report=recorded(positivePrefix+'mocha.json'),title=positivePlan.cases[0].fullTitle;
     assert.equal(report.reporter?.state,'COMPLETE');for(const field of ['tests','passes','failures','pending'])assert(Array.isArray(report[field]));
     assert.deepEqual(report.tests.map(x=>x.fullTitle),[title],'POSITIVE_MOCHA_TEST_LIST');assert.equal(report.stats.tests,1);
     assert.deepEqual(runner.actual,['G01'],'POSITIVE_RUNNER_MOCHA_LIST_CONFLICT');assert.deepEqual(runner.unique,['G01']);
     assert.equal(report.stats.passes,report.passes.length);assert.equal(report.stats.failures,report.failures.length);assert.equal(report.stats.pending,report.pending.length);assert.deepEqual(report.pending,[]);
     assert.deepEqual(report[terminal.state==='PASS'?'passes':'failures'].map(x=>x.fullTitle),[title],'POSITIVE_MOCHA_TERMINAL_CONFLICT');assert.deepEqual(report[terminal.state==='PASS'?'failures':'passes'],[]);
     const observationFiles=positivePlan.artifacts.observationAttempted;
     if(observed.started){
      need(observationFiles.map(file=>positivePrefix+file));
      assert(['STARTED','OBSERVED'].includes(observed.stage));assert(['NOT_RUN','FAIL','PASS'].includes(observed.validation),'POSITIVE_VALIDATION_UNCONFIRMED');assert(['SUCCESS','FAILURE'].includes(observed.collectionState),'POSITIVE_COLLECTION_UNCONFIRMED');
      if(observed.validation!=='NOT_RUN')assert.equal(observed.stage,'OBSERVED','POSITIVE_VALIDATION_BEFORE_OBSERVATION');
      const begun=recorded(positivePrefix+'positive-started.json'),collection=recorded(positivePrefix+'positive-state.json');assert.equal(begun.caseId,'G01');assert.equal(begun.state,'STARTED');assert.equal(collection.caseId,'G01');
      assert.equal(collection.state,observed.collectionState,'POSITIVE_COLLECTION_STATE_CONFLICT');assert.deepEqual(collection.observation,observed,'POSITIVE_OBSERVATION_TERMINAL_CONFLICT');
      const funding=typed('positive-fee.json');assert.equal(funding.schema,'LQC_POSITIVE_FEE_1');assert(['PARTIAL','COLLECTED'].includes(funding.status));assert.equal(funding.status==='COLLECTED',observed.stage==='OBSERVED');
      const journalFile=positivePrefix+'positive-queries.jsonl';
      try{const lines=readText(journalFile).split('\n');assert.equal(lines.pop(),'','POSITIVE_JOURNAL_UNTERMINATED');for(const line of lines){const entry=JSON.parse(line);assert(entry&&typeof entry==='object'&&entry.$type==='object','POSITIVE_JOURNAL_RECORD');}}
      catch(error){errors.push({path:journalFile,error});throw new G01ArtifactError('G01_JOURNAL_INVALID',journalFile,error);}
      if(observed.validation==='PASS'){
       need(positivePlan.artifacts.validationPassed.map(file=>positivePrefix+file));const validation=typed('positive-validation.json');assert.equal(observed.stage,'OBSERVED');assert.equal(validation.caseId,'G01');assert.equal(validation.state,'PASS');assert.equal(validation.evidenceSHA256,hash(io.readBytes(positivePrefix+'positive-fee.json')),'POSITIVE_VALIDATION_BYTES_CONFLICT');
      }else assert(!io.exists(positivePrefix+'positive-validation.json'),'POSITIVE_UNCONFIRMED_VALIDATION_ARTIFACT');
      if(observed.collectionState==='SUCCESS'){assert.equal(observed.stage,'OBSERVED');assert.equal(observed.validation,'PASS');assert(!io.exists(positivePrefix+'positive-failure.json'),'POSITIVE_SUCCESS_FAILURE_CONFLICT');}
      else{need(positivePlan.artifacts.observationFailed.map(file=>positivePrefix+file));const failure=typed('positive-failure.json');assert(Array.isArray(failure.failures)&&failure.failures.length>0,'POSITIVE_FAILURE_RECORD_REQUIRED');}
     }else{
      assert.equal(observed.stage,'NOT_STARTED');assert.equal(observed.validation,'NOT_RUN');assert.equal(observed.collectionState,'NOT_RUN');assert.equal(terminal.state,'FAIL','POSITIVE_SETUP_FAILURE_REQUIRED');
      for(const file of [...observationFiles,...positivePlan.artifacts.validationPassed,...positivePlan.artifacts.observationFailed])assert(!io.exists(positivePrefix+file),'POSITIVE_SETUP_OBSERVATION_CONFLICT:'+file);
     }
     if(terminal.state==='PASS')need(positivePlan.artifacts.success.map(file=>positivePrefix+file));
     else need(positivePlan.artifacts.failure.map(file=>positivePrefix+file));
     if(terminal.state==='PASS'){assert.equal(observed.started,true);assert.equal(observed.collectionState,'SUCCESS');assert.equal(observed.validation,'PASS');}
     else{const failure=typed('case-failure.json');assert.equal(failure.id,'G01');assert(Array.isArray(failure.failures)&&failure.failures.length>0);}
     executionStates.feeObservation=observed.started?observed.collectionState:'NOT_RUN';executionStates.feeValidation=observed.validation;
    }else{
     assert.equal(runner.execution,'NOT_RUN');assert.equal(runner.state,'FAIL');assert.deepEqual(runner.actual,[]);for(const file of [...positivePlan.artifacts.attempted,...positivePlan.artifacts.observationAttempted,...positivePlan.artifacts.validationPassed,...positivePlan.artifacts.observationFailed])assert(!io.exists(positivePrefix+file),'POSITIVE_NOT_RUN_WITH_CASE_EVIDENCE');
     executionStates.feeObservation='NOT_RUN';executionStates.feeValidation='NOT_RUN';
    }
    if(positivePhase.state==='PASS'){
     assert.equal(runner.calls,1);assert.equal(runner.state,'PASS');assert.equal(runner.exitCode,0);assert.equal(runner.recordingErrors.length,0);assert.deepEqual(runner.actual,['G01']);assert.deepEqual(runner.unique,['G01']);
     const terminal=recorded(positivePrefix+'case-state.json');assert.equal(terminal.state,'PASS');need(positivePlan.artifacts.success.map(file=>positivePrefix+file));
    }
    executionStates.positiveFee=positivePhase.state;
   }else{
    assert.equal(positivePhase.state,'NOT_RUN');assert(!io.exists(positivePrefix),'POSITIVE_OUTPUT_WITH_NOT_RUN');
    need(['results/linux-once/initial.json']);const initial=recorded('results/linux-once/initial.json');assert.equal(initial.phases?.['positive-fee']?.calls,0);assert.equal(initial.phases?.['positive-fee']?.state,'NOT_RUN');
    executionStates.positiveFee='NOT_RUN';executionStates.feeObservation='NOT_RUN';executionStates.feeValidation='NOT_RUN';
   }
 }catch(error){primary=error;errors.push({kind:'judgment',error});}
 // Missing evidence is a policy failure even if no branch needed to parse it.
 for(const file of required)if(!io.exists(file)){const error=new G01ArtifactError('G01_REQUIRED_MISSING',file);if(!primary)primary=error;errors.push({kind:'required',file,error});}
 if(primary){executionStates.positiveFee='UNKNOWN';executionStates.feeObservation='UNKNOWN';executionStates.feeValidation='UNKNOWN';}
 return {ok:!primary,states:executionStates,required:[...required].sort(),primary,errors,scope:'LOCAL_ARTIFACT_CONSISTENCY_ONLY'};
}
module.exports={assessG01Artifacts,G01ArtifactError};
