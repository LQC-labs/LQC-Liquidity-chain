const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=__dirname,{gate,sha}=require('./build-common.cjs'),pins=require('./test-pins.cjs'),local=createRequire(path.join(root,'package.json'));
const evidence=require('./test/failure-evidence.cjs');
const recordingFailures=[];
const out=path.join(root,'results','collection-'+Date.now());fs.mkdirSync(out,{recursive:true});
const save=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
function record(name,bytes){try{fs.writeFileSync(path.join(out,name),bytes,{flag:'wx'});}catch(error){recordingFailures.push({kind:'evidence',file:name,error});process.exitCode=1;}}
let launches=0;
function validate(report,exit,expected){
 assert.equal(exit,0,'TEST_PROCESS_EXIT');assert(report.tests.length>0,'ZERO_EXECUTED_TESTS');
 const actual=report.tests.map(x=>x.fullTitle);assert.equal(new Set(actual).size,actual.length,'DUPLICATE_EXECUTED_TITLE');assert.deepEqual([...actual].sort(),[...expected].sort(),'MISSING_OR_UNEXPECTED_TEST');
 assert.equal(report.stats.tests,expected.length);assert.equal(report.stats.passes,expected.length);assert.equal(report.stats.failures,0);assert.equal(report.stats.pending,0);assert.equal(report.passes.length,expected.length);assert.equal(report.failures.length,0);assert.equal(report.pending.length,0);return actual;
}
try{gate(root,verified=>{
 const bytes=fs.readFileSync(path.join(root,'test-plan.json'));assert.equal(sha(bytes),pins.planSHA256,'TEST_PLAN_PIN');const plan=JSON.parse(bytes),expected=plan.fullTitles;
 assert.equal(plan.cases.length,expected.length,'CASE_TITLE_COUNT');assert.equal(new Set(expected).size,expected.length,'DUPLICATE_REQUIRED_TITLE');
 assert.equal(plan.tests.length,12,'REQUIREMENT_COUNT');assert.equal(new Set(plan.tests.map(x=>x.id)).size,12);
 for(const requirement of plan.tests){const cases=plan.cases.filter(x=>x.requirementId===requirement.id);assert(cases.length>0,'UNIMPLEMENTED_REQUIREMENT');assert.deepEqual(cases.map(x=>x.caseId).sort(),[...requirement.caseIds].sort(),'REQUIREMENT_CASE_MAPPING');}
 assert.deepEqual(plan.cases.map(x=>x.fullTitle),expected,'EXACT_CASE_TITLE_MAPPING');
 for(const [file,hash]of Object.entries(pins.sourceHashes)){assert(!path.isAbsolute(file)&&!file.split(/[\\/]/).includes('..'),'SOURCE_PATH');assert.equal(sha(fs.readFileSync(path.join(root,file))),hash,'TEST_SOURCE_PIN:'+file);}
 const good={stats:{tests:1,passes:1,failures:0,pending:0},tests:[{fullTitle:'one'}],passes:[{}],failures:[],pending:[]};validate(good,0,['one']);
 for(const [r,names]of [[{...good,tests:[]},['one']],[good,['one','missing']],[{...good,tests:[{fullTitle:'one'},{fullTitle:'one'}]},['one']],[good,['other']]])assert.throws(()=>validate(r,0,names));
 save('runner-selfchecks.json',{validated:true,rejected:['zero','missing','duplicate','unexpected'],launches:0});
 save('preflight.json',{buildManifest:verified.manifest,level:verified.level,requiredTitles:expected,sourceHashes:pins.sourceHashes,launches:0,amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'});
 for(const file of [...Object.keys(pins.sourceHashes),'test-plan.json','test-pins.cjs']){const dest=path.join(out,'source-snapshot',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,file),dest,fs.constants.COPYFILE_EXCL);}
 launches++;
 const result=cp.spawnSync(process.execPath,[local.resolve('mocha/bin/mocha.js'),'--no-config','--no-package','--timeout','180000','--bail','--reporter',path.join(root,'test/evidence-reporter.cjs'),'--reporter-option','output='+path.join(out,'mocha.json'),path.join(root,plan.test)],{cwd:root,windowsHide:true,encoding:null,timeout:900000,maxBuffer:16*1024*1024,env:{...process.env,NODE_OPTIONS:'',LQC_COLLECTION_RESULT_DIR:out}});
 record('stdout.log',result.stdout??Buffer.alloc(0));record('stderr.log',result.stderr??Buffer.alloc(0));
 record('exit-code.json',evidence.stringify({exitCode:result.status,signal:result.signal,error:result.error??null,launches,automaticRetry:false}));
 let report;
 try{report=JSON.parse(fs.readFileSync(path.join(out,'mocha.json')));}catch(cause){const error=new Error('REPORTER_OUTPUT_MISSING_OR_INVALID',{cause});error.kind='reporter';throw error;}
 save('raw-summary.json',{stats:report.stats,failures:report.failures,reporter:report.reporter});
 save('failure-categories.json',{failures:report.failures.map(x=>({fullTitle:x.fullTitle,kinds:x.kinds})),reporter:report.reporter,recordingFailures:evidence.encode(recordingFailures)});
 assert.equal(report.reporter?.state,'COMPLETE','REPORTER_INCOMPLETE');
 assert.equal(recordingFailures.length,0,'EVIDENCE_RECORDING_FAILED');
 for(const [file,hash]of Object.entries(pins.sourceHashes))assert.equal(sha(fs.readFileSync(path.join(root,file))),hash,'SOURCE_CHANGED:'+file);
 assert.equal(sha(fs.readFileSync(path.join(root,'test-plan.json'))),pins.planSHA256,'PLAN_CHANGED');
 const actual=validate(report,result.status,expected);save('validated-summary.json',{stats:report.stats,actual,launches,amount:null,authority:false,consumptionLink:'UNVERIFIED',rightsLink:'UNVERIFIED'});console.log(JSON.stringify({result:'PASS',stats:report.stats,out}));
});}catch(error){
 process.exitCode=1;
 record('failure.json',evidence.stringify({kind:error.kind??'runner',error,recordingFailures,launches,automaticRetry:false}));
 try{fs.writeSync(2,evidence.stringify({primary:error,recordingFailures,launches}));}
 catch(fallback){process.exitCode=1;try{fs.writeSync(2,'LQC_RUNNER_FAILURE_RECORDING_FAILED\n'+evidence.stringify({primary:error,recordingFailures,fallback}));}catch{}}
}
