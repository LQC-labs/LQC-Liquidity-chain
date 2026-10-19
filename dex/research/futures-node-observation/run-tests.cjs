const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=__dirname,sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const EXPECTED_PLAN_SHA256='c4711c650750acc9e339f553dcff70834877f369596b05813945fd1dfb521344';
function main(){
 assert.equal(sha(root+'/test-plan.json'),EXPECTED_PLAN_SHA256,'TEST_PLAN_HASH_MISMATCH');
 const plan=JSON.parse(fs.readFileSync(root+'/test-plan.json'));
 assert(plan.fullTitles.length>0&&new Set(plan.fullTitles).size===plan.fullTitles.length,'INVALID_TEST_IDENTITIES');
 assert.equal(sha(root+'/'+plan.file),plan.sha256,'TEST_SOURCE_HASH_MISMATCH');
 const base=root+'/.results';fs.mkdirSync(base,{recursive:true});const out=path.join(base,crypto.randomUUID());fs.mkdirSync(out);
 const syntax=[];
 for(const file of ['collector.mjs','transport.mjs','journal.mjs','collect.mjs','run-tests.cjs',plan.file,'../../scripts/verify-futures-deployment-lineage.mjs']){
  const p=cp.spawnSync(process.execPath,['--check',path.resolve(root,file)],{encoding:'utf8',windowsHide:true});syntax.push({file,exitCode:p.status,sha256:sha(path.resolve(root,file))});assert(!p.error&&!p.signal&&p.status===0,'SYNTAX_FAILED:'+file);
 }
 fs.writeFileSync(out+'/syntax.json',JSON.stringify(syntax,null,2));
 const report=out+'/mocha.json',p=cp.spawnSync(process.execPath,['--require',root+'/../futures-evaluation/offline-guard.cjs',require.resolve('mocha/bin/mocha.js'),'--no-config','--no-package','--bail','--timeout','10000','--reporter','json','--reporter-option','output='+report,root+'/'+plan.file],{cwd:root,windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024,env:{...process.env,NODE_OPTIONS:'',BSC_TESTNET_RPC_URL:''}});
 fs.writeFileSync(out+'/stdout.log',p.stdout||'');fs.writeFileSync(out+'/stderr.log',p.stderr||'');assert(!p.error&&!p.signal,'TEST_PROCESS_FAILED');
 const r=JSON.parse(fs.readFileSync(report)),aggregation=require('../futures-evaluation/report-validation.cjs')(r,p.status,{fullTitles:plan.fullTitles});
 const summary={...aggregation,exitCode:p.status,stats:r.stats,output:out};fs.writeFileSync(out+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));assert.equal(aggregation.status,'PASS');
 for(const x of syntax)assert.equal(sha(path.resolve(root,x.file)),x.sha256,'IMPLEMENTATION_CHANGED_DURING_TEST');
}
try{main();}catch(e){console.error(e.message);process.exitCode=1;}
