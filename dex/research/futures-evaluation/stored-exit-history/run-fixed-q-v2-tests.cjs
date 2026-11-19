// Execute the existing 71 fixed-Q checks against an explicitly versioned current
// calculator reference, without modifying or relabeling the immutable v1 plan.
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const assert=require('node:assert/strict');
const {gate,sha}=require('./build-common.cjs');
const historicalPins=require('./fixed-q-test-pins.cjs');
const currentPins=require('./fixed-q-v2-test-pins.cjs');

const root=__dirname;
const out=path.join(root,'results','fixed-q-v2-'+Date.now());
fs.mkdirSync(out,{recursive:true});
const save=(file,value)=>fs.writeFileSync(path.join(out,file),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
let launches=0;

try{
 gate(root,()=>{
  const originalBytes=fs.readFileSync(path.join(root,'fixed-q-test-plan.json'));
  assert.equal(sha(originalBytes),historicalPins.planSHA256,'HISTORICAL_PLAN_PIN');
  const plan=JSON.parse(originalBytes);
  const v2Bytes=fs.readFileSync(path.join(root,'fixed-q-v2-test-plan.json'));
  assert.equal(sha(v2Bytes),currentPins.planSHA256,'CURRENT_PLAN_PIN');
  assert.equal(sha(fs.readFileSync(__filename)),currentPins.runnerSHA256,'CURRENT_RUNNER_PIN');
  const version=JSON.parse(v2Bytes);
  assert.equal(version.schema,'LOCAL_FIXED_Q_TEST_PLAN_2');
  assert.deepEqual(Object.keys(version).sort(),['basePlanSHA256','currentCalculatorPin','expectedTestCount','replacedSourcePin','schema'].sort());
  assert.equal(version.basePlanSHA256,historicalPins.planSHA256,'BASE_PLAN_REFERENCE');
  assert.equal(version.expectedTestCount,71,'CURRENT_TEST_COUNT');
  assert.equal(plan.titles.length,version.expectedTestCount,'HISTORICAL_TEST_COUNT');
  assert.equal(new Set(plan.titles).size,version.expectedTestCount,'DUPLICATE_PLAN_TITLE');

  const replacement=version.replacedSourcePin;
  assert.deepEqual(Object.keys(replacement).sort(),['file','historicalSHA256','currentSHA256'].sort());
  assert.equal(replacement.file,'../lib/shared-evaluation-origin-reference.mjs','SINGLE_ALLOWED_SOURCE_PIN_CHANGE');
  assert.equal(plan.sourceHashes[replacement.file],replacement.historicalSHA256,'ORIGINAL_SOURCE_PIN');
  assert.notEqual(replacement.currentSHA256,replacement.historicalSHA256,'VERSIONED_SOURCE_CHANGE');
  const activeHashes={...plan.sourceHashes,[replacement.file]:replacement.currentSHA256};
  for(const [file,expected]of Object.entries(activeHashes)){
   assert.equal(sha(fs.readFileSync(path.resolve(root,file))),expected,'SOURCE_PIN:'+file);
  }
  const calc=version.currentCalculatorPin;
  assert.deepEqual(Object.keys(calc).sort(),['dependencyLockSHA256','recordSHA256'].sort());
  const calcRecordFile=path.resolve(root,'../shared-calculator-implementation-record.json');
  const calcRecordBytes=fs.readFileSync(calcRecordFile);
  assert.equal(sha(calcRecordBytes),calc.recordSHA256,'CURRENT_CALCULATOR_RECORD_PIN');
  assert.equal(JSON.parse(calcRecordBytes).dependencyLockSHA256,calc.dependencyLockSHA256,'CURRENT_CALCULATOR_LOCK_REFERENCE');
  assert.equal(sha(fs.readFileSync(path.resolve(root,'../../../package-lock.json'))),calc.dependencyLockSHA256,'CURRENT_CALCULATOR_LOCK_PIN');

  const syntax=[...new Set([...Object.keys(activeHashes).filter(file=>/\.(cjs|mjs)$/.test(file)),'run-fixed-q-v2-tests.cjs','fixed-q-v2-test-pins.cjs'])].map(file=>{
   const result=cp.spawnSync(process.execPath,['--check',path.resolve(root,file)],{encoding:'utf8',windowsHide:true});
   return {file,exit:result.status,stderr:result.stderr};
  });
  save('syntax.json',syntax);
  assert(syntax.every(result=>result.exit===0),'SYNTAX');
  save('base-plan.json',plan);
  save('versioned-plan.json',version);
  save('active-source-hashes.json',activeHashes);

  // The nested fixture's checked dependency tree also serves parent JS imports.
  const sharedResolution=path.resolve(root,'../../../node_modules');
  const installed=fs.realpathSync(path.join(root,'node_modules'));
  let created=false;
  try{fs.lstatSync(sharedResolution);}catch(error){
   if(error.code!=='ENOENT')throw error;
   fs.symlinkSync(installed,sharedResolution,process.platform==='win32'?'junction':'dir');
   created=true;
  }
  assert.equal(fs.realpathSync(sharedResolution),installed,'PARENT_DEPENDENCY_TREE_MISMATCH');
  save('dependency-resolution.json',{created,sameCheckedInstall:true,parent:sharedResolution,installed,additionalInstall:false});

  launches++;
  const result=cp.spawnSync(process.execPath,[require.resolve('mocha/bin/mocha.js'),'--no-config','--no-package','--timeout','180000','--bail','--reporter','json','--reporter-option','output='+path.join(out,'mocha.json'),path.join(root,'test/fixed-q-bridge.test.mjs')],{
   cwd:root,windowsHide:true,encoding:'utf8',timeout:360000,maxBuffer:8e6,
   env:{...process.env,NODE_OPTIONS:'',LQC116_RESULT_DIR:out}
  });
  save('exit-code.json',{exit:result.status,signal:result.signal,error:result.error?.message??null});
  fs.writeFileSync(path.join(out,'stdout.log'),result.stdout??'');
  fs.writeFileSync(path.join(out,'stderr.log'),result.stderr??'');
  const report=JSON.parse(fs.readFileSync(path.join(out,'mocha.json')));
  save('raw-summary.json',{stats:report.stats,failures:report.failures});
  assert.equal(result.status,0,'TEST_EXIT');
  const actual=report.tests.map(test=>test.fullTitle);
  assert.equal(new Set(actual).size,actual.length,'DUPLICATE_EXECUTION');
  assert.deepEqual([...actual].sort(),[...plan.titles].sort(),'EXECUTION_SET');
  assert.equal(report.stats.passes,version.expectedTestCount,'EXPECTED_PASSES');
  assert.equal(report.stats.failures,0,'EXPECTED_ZERO_FAILURES');
  assert.equal(report.stats.pending,0,'EXPECTED_ZERO_PENDING');
  for(const [file,expected]of Object.entries(activeHashes)){
   assert.equal(sha(fs.readFileSync(path.resolve(root,file))),expected,'SOURCE_CHANGED:'+file);
  }
  assert.equal(sha(fs.readFileSync(path.join(root,'fixed-q-v2-test-plan.json'))),currentPins.planSHA256,'CURRENT_PLAN_CHANGED');
  assert.equal(sha(fs.readFileSync(__filename)),currentPins.runnerSHA256,'CURRENT_RUNNER_CHANGED');
  save('validated-summary.json',{stats:report.stats,actual,exitCode:result.status,planSchema:version.schema});
  console.log(JSON.stringify({result:'PASS',stats:report.stats,exitCode:result.status,out}));
 });
}catch(error){
 save('failure.json',{message:error.message,stack:error.stack,launches});
 console.error(error.stack);
 process.exitCode=1;
}
