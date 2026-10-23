const fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict'),crypto=require('crypto');
const root=__dirname,out=path.join(root,'results','anvil-lifecycle-'+Date.now()),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
fs.mkdirSync(out,{recursive:true});const save=(f,x)=>fs.writeFileSync(path.join(out,f),JSON.stringify(x,null,2)+'\n',{flag:'wx'});
try{
 const bytes=fs.readFileSync(path.join(root,'anvil-lifecycle-test-plan.json'));assert.equal(sha(bytes),'0ca1a4411c855bf0f74831f8dc78e768cf1f941f525be0bf7c922e763e2a5bc3','MOCK_PLAN_PIN');const plan=JSON.parse(bytes);assert.equal(plan.titles.length,16);assert.equal(new Set(plan.titles).size,16);
 for(const [f,h]of Object.entries(plan.sourceHashes))assert.equal(sha(fs.readFileSync(path.join(root,f))),h,'MOCK_SOURCE_PIN:'+f);save('plan.json',plan);
 const r=cp.spawnSync(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1','test/anvil-compat.test.mjs'],{cwd:root,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:2e6,env:{...process.env,NODE_OPTIONS:'',LQC_LIFECYCLE_RESULT_DIR:out}});
 fs.writeFileSync(path.join(out,'stdout.tap'),r.stdout??'');fs.writeFileSync(path.join(out,'stderr.log'),r.stderr??'');save('exit-code.json',{exit:r.status,signal:r.signal,error:r.error?.message??null});
 const actual=[...(r.stdout??'').matchAll(/^# Subtest: (.+)$/gm)].map(x=>x[1]);save('execution-inventory.json',{required:plan.titles,actual});assert.equal(r.status,0,'MOCK_TEST_EXIT');assert.deepEqual([...actual].sort(),[...plan.titles].sort(),'MOCK_EXECUTION_SET');assert.equal(new Set(actual).size,16);assert.match(r.stdout,/^# pass 16$/m);assert.match(r.stdout,/^# fail 0$/m);
 for(const [f,h]of Object.entries(plan.sourceHashes))assert.equal(sha(fs.readFileSync(path.join(root,f))),h,'MOCK_SOURCE_CHANGED:'+f);save('validated-summary.json',{passes:16,failures:0,actual,exit:0,realAnvilExecuted:false,fixedQ71Executed:false});console.log(JSON.stringify({result:'PASS_MOCK_ONLY',passes:16,failures:0,out}));
}catch(e){save('failure.json',{message:e.message,stack:e.stack});console.error(e.stack);process.exitCode=1;}
