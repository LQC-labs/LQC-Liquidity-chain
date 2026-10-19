const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {validatePlanBytes,validateFileManifest,sha,EXPECTED_PLAN_SHA256}=require('./settlement-link-test-plan.cjs');
const root=__dirname,out=path.resolve(process.argv[2]||path.join(root,'.results/task-2-73')),group=process.argv[3]||'all';
assert(!fs.existsSync(out),'RESULT_EXISTS');fs.mkdirSync(out,{recursive:true});
function save(name,x){fs.writeFileSync(path.join(out,name),JSON.stringify(x,null,2)+'\n',{flag:'wx'});}
try{
 assert(['all','regression','new'].includes(group),'UNKNOWN_TEST_GROUP');
 const plan=validatePlanBytes(fs.readFileSync(root+'/settlement-link-test-plan.json'));
 const observed=plan.suites.filter(s=>fs.existsSync(root+'/'+s.file)).map(s=>({file:s.file,sha256:sha(fs.readFileSync(root+'/'+s.file))}));validateFileManifest(plan,observed);
 const suites=plan.suites.filter(s=>group==='all'||s.group===group),fullTitles=suites.flatMap(s=>s.fullTitles);assert(fullTitles.length>0,'EMPTY_SELECTED_PLAN');
 save('execution-plan.json',{group,planSHA256:EXPECTED_PLAN_SHA256,suites,fullTitles});
 const syntaxFiles=['lib/settlement-link-diagnosis.mjs','run-settlement-link-tests.cjs','settlement-link-test-plan.cjs',...suites.map(s=>s.file)];
 const syntax=[];for(const file of syntaxFiles){const p=cp.spawnSync(process.execPath,['--check',root+'/'+file],{encoding:'utf8',windowsHide:true,env:{...process.env,NODE_OPTIONS:''}});syntax.push({file,exitCode:p.status,signal:p.signal,stderr:p.stderr});}
 save('syntax.json',syntax);assert(syntax.every(x=>x.exitCode===0&&!x.signal),'SYNTAX_FAILED');
 const implementationFiles=[...new Set([...syntaxFiles,...fs.readdirSync(root+'/lib').filter(x=>x.endsWith('.mjs')).map(x=>'lib/'+x),'offline-guard.cjs','report-validation.cjs','settlement-link-test-plan.json','trusted-manifest.json','test-only-expectations.json'])];
 save('implementation-hashes.json',Object.fromEntries(implementationFiles.map(file=>[file,sha(fs.readFileSync(root+'/'+file))])));
 const p=cp.spawnSync(process.execPath,['--require',root+'/offline-guard.cjs',require.resolve('mocha/bin/mocha.js'),'--no-config','--no-package','--timeout','10000','--reporter','json','--reporter-option','output='+out+'/mocha.json',...suites.map(s=>root+'/'+s.file)],{cwd:root,encoding:'utf8',windowsHide:true,timeout:420000,maxBuffer:32*1024*1024,env:{...process.env,NODE_OPTIONS:'',LQC73_OUTPUT_DIR:out,LQC51_OUTPUT_DIR:out,LQC49_REJECTIONS:out+'/rejection-stages.json'}});
 fs.writeFileSync(out+'/stdout.log',p.stdout||'',{flag:'wx'});fs.writeFileSync(out+'/stderr.log',p.stderr||'',{flag:'wx'});save('exit-code.json',{exitCode:p.status,signal:p.signal,error:p.error?.code??null});
 assert(!p.error&&!p.signal,'TEST_PROCESS_ERROR');const report=JSON.parse(fs.readFileSync(out+'/mocha.json'));
 let aggregation;try{aggregation=require('./report-validation.cjs')(report,p.status,{fullTitles});}catch(e){save('aggregation-error.json',{message:e.message,stats:report.stats,exitCode:p.status});throw e;}
 save('summary.json',{aggregation,exitCode:p.status,stats:report.stats,groups:suites.map(s=>({file:s.file,group:s.group,executed:report.tests.filter(x=>s.fullTitles.includes(x.fullTitle)).length,passes:report.passes.filter(x=>s.fullTitles.includes(x.fullTitle)).length,failures:report.failures.filter(x=>s.fullTitles.includes(x.fullTitle)).length})),failures:report.failures});
 console.log(JSON.stringify({status:aggregation.status,counts:aggregation.counts,exitCode:p.status,groups:suites.map(s=>({file:s.file,count:s.fullTitles.length})),failures:report.failures.map(x=>({title:x.fullTitle,error:x.err.message}))},null,2));
 for(const [file,h]of Object.entries(JSON.parse(fs.readFileSync(out+'/implementation-hashes.json'))))assert.equal(sha(fs.readFileSync(root+'/'+file)),h,'IMPLEMENTATION_CHANGED_DURING_TEST');assert.equal(aggregation.status,'PASS','TESTS_NOT_PASS');
}catch(e){save('runner-error.json',{name:e.name,message:e.message,stack:e.stack});console.error(e.stack);process.exitCode=1;}
