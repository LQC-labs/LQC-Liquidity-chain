const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {gate,sha}=require('./build-common.cjs'),pins=require('./fixed-q-test-pins.cjs');
const root=__dirname,out=path.join(root,'results','fixed-q-'+Date.now());fs.mkdirSync(out,{recursive:true});
const save=(f,x)=>fs.writeFileSync(path.join(out,f),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
let launches=0;
try{gate(root,()=>{
 const bytes=fs.readFileSync(path.join(root,'fixed-q-test-plan.json'));assert.equal(sha(bytes),pins.planSHA256,'FIXED_PLAN_PIN');const plan=JSON.parse(bytes);assert.equal(plan.titles.length,30);assert.equal(new Set(plan.titles).size,30);
 for(const [f,h]of Object.entries(plan.sourceHashes))assert.equal(sha(fs.readFileSync(path.resolve(root,f))),h,'SOURCE_PIN:'+f);
 const syntax=Object.keys(plan.sourceHashes).filter(f=>/\.(cjs|mjs)$/.test(f)).map(f=>{const r=cp.spawnSync(process.execPath,['--check',path.resolve(root,f)],{encoding:'utf8',windowsHide:true});return {file:f,exit:r.status,stderr:r.stderr};});save('syntax.json',syntax);assert(syntax.every(r=>r.exit===0),'SYNTAX');save('plan.json',plan);save('source-hashes.json',plan.sourceHashes);
 // Parent research helpers resolve packages from dex/node_modules, not this nested package.
 // Link only this job's gate-checked install; never replace an existing dependency tree.
 const sharedResolution=path.resolve(root,'../../../node_modules'),installed=fs.realpathSync(path.join(root,'node_modules'));
 let created=false;
 try{fs.lstatSync(sharedResolution);}catch(e){if(e.code!=='ENOENT')throw e;fs.symlinkSync(installed,sharedResolution,process.platform==='win32'?'junction':'dir');created=true;}
 assert.equal(fs.realpathSync(sharedResolution),installed,'PARENT_DEPENDENCY_TREE_MISMATCH');
 save('dependency-resolution.json',{created,sameCheckedInstall:true,parent:sharedResolution,installed,additionalInstall:false});
 launches++;const r=cp.spawnSync(process.execPath,[require.resolve('mocha/bin/mocha.js'),'--no-config','--no-package','--timeout','180000','--bail','--reporter','json','--reporter-option','output='+path.join(out,'mocha.json'),path.join(root,'test/fixed-q-bridge.test.mjs')],{cwd:root,windowsHide:true,encoding:'utf8',timeout:360000,maxBuffer:8e6,env:{...process.env,NODE_OPTIONS:'',LQC116_RESULT_DIR:out}});
 save('exit-code.json',{exit:r.status,signal:r.signal,error:r.error?.message??null});fs.writeFileSync(path.join(out,'stdout.log'),r.stdout??'');fs.writeFileSync(path.join(out,'stderr.log'),r.stderr??'');const report=JSON.parse(fs.readFileSync(path.join(out,'mocha.json')));save('raw-summary.json',{stats:report.stats,failures:report.failures});assert.equal(r.status,0,'TEST_EXIT');const actual=report.tests.map(x=>x.fullTitle);assert.equal(new Set(actual).size,actual.length,'DUPLICATE_EXECUTION');assert.deepEqual([...actual].sort(),[...plan.titles].sort(),'EXECUTION_SET');assert.equal(report.stats.passes,30);assert.equal(report.stats.failures,0);assert.equal(report.stats.pending,0);for(const [f,h]of Object.entries(plan.sourceHashes))assert.equal(sha(fs.readFileSync(path.resolve(root,f))),h,'SOURCE_CHANGED:'+f);save('validated-summary.json',{stats:report.stats,actual,exitCode:r.status});console.log(JSON.stringify({result:'PASS',stats:report.stats,exitCode:r.status,out}));
});}catch(e){save('failure.json',{message:e.message,stack:e.stack,launches});console.error(e.stack);process.exitCode=1;}
