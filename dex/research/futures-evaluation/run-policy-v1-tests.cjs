const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=__dirname,sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const EXPECTED_PLAN_SHA256='f0b575765b894060459e289923aadf3c73807394ae828e3f27454d2564688fb7';
let failureOut=null;
async function main(){
 assert.equal(sha(root+'/suite-plan-policy-v1.json'),EXPECTED_PLAN_SHA256,'TEST_PLAN_HASH_MISMATCH');
 const plan=JSON.parse(fs.readFileSync(root+'/suite-plan-policy-v1.json')),fullTitles=plan.suites.flatMap(s=>s.fullTitles);
 assert(fullTitles.length>0&&new Set(fullTitles).size===fullTitles.length,'EMPTY_OR_DUPLICATE_TEST_PLAN');
 const out=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'.results',new Date().toISOString().replace(/[:.]/g,'-'));
 assert(!fs.existsSync(out),'RESULT_EXISTS');fs.mkdirSync(out,{recursive:true});failureOut=out;
 const syntaxFiles=fs.readdirSync(root+'/lib').filter(n=>n.endsWith('.mjs')).map(n=>'lib/'+n).concat(plan.suites.map(s=>s.file),['run-policy-v1-tests.cjs','offline-guard.cjs','report-validation.cjs']);
 const syntax=[];
 for(const s of plan.suites)assert.equal(sha(root+'/'+s.file),s.sha256,'TEST_FILE_HASH_MISMATCH:'+s.file);
 for(const f of syntaxFiles){
  const p=cp.spawnSync(process.execPath,['--check',path.join(root,f)],{encoding:'utf8',windowsHide:true,env:{...process.env,NODE_OPTIONS:''}});
  syntax.push({file:f,exitCode:p.status,stderr:p.stderr});fs.writeFileSync(out+'/syntax.json',JSON.stringify(syntax,null,2));assert(!p.error&&!p.signal&&p.status===0,'SYNTAX_FAILED:'+f);
 }
 const version=await import('./lib/evaluation-identity.mjs');
 const implementation={calculationVersion:version.CALCULATION_VERSION,hashAlgorithm:'SHA-256',files:Object.fromEntries(syntaxFiles.map(f=>[f,sha(root+'/'+f)])),limits:'Hashes identify tested bytes, not correctness, chain authenticity or policy approval.'};
 fs.writeFileSync(out+'/implementation-record.json',JSON.stringify(implementation,null,2));
 fs.writeFileSync(out+'/execution-plan.json',JSON.stringify({fullTitles,suites:plan.suites},null,2));
 const started=Date.now(),report=out+'/mocha.json',mocha=require.resolve('mocha/bin/mocha.js');
 const c=cp.spawnSync(process.execPath,['--require',root+'/offline-guard.cjs',mocha,'--no-config','--no-package','--bail','--timeout','10000','--reporter','json','--reporter-option','output='+report,...plan.suites.map(s=>root+'/'+s.file)],{cwd:root,encoding:'utf8',windowsHide:true,timeout:420000,maxBuffer:16*1024*1024,env:{...process.env,NODE_OPTIONS:'',LQC58_OUTPUT_DIR:out}});
 fs.writeFileSync(out+'/stdout.log',c.stdout||'');fs.writeFileSync(out+'/stderr.log',c.stderr||'');
 assert(!c.error&&!c.signal,'TEST_PROCESS_FAILED');
 const r=JSON.parse(fs.readFileSync(report)),aggregation=require('./report-validation.cjs')(r,c.status,{fullTitles});
 const groups=plan.suites.map(s=>({file:s.file,tests:r.tests.filter(t=>s.fullTitles.includes(t.fullTitle)).length,passes:r.passes.filter(t=>s.fullTitles.includes(t.fullTitle)).length,failures:r.failures.filter(t=>s.fullTitles.includes(t.fullTitle)).length}));
 const summary={status:aggregation.status,exitCode:c.status,wallMs:Date.now()-started,stats:r.stats,groups};
 fs.writeFileSync(out+'/summary.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary,null,2));assert.equal(aggregation.status,'PASS','TEST_NOT_PASS');
 for(const [f,h]of Object.entries(implementation.files))assert.equal(sha(root+'/'+f),h,'IMPLEMENTATION_CHANGED_DURING_TEST');
 const candidate=JSON.parse(fs.readFileSync(out+'/actual-policy-v1-candidate.json'));
 assert.equal(candidate.evaluationStatus,'NOT_EVALUATED');assert.equal(candidate.confirmedAmount,null);assert.equal(candidate.monetaryResult,null);
 for(const k of ['fundsAuthority','settlementAuthorized','createsClaim','consumesHistory'])assert.equal(candidate[k],false);
}
main().catch(e=>{if(failureOut){let report=null;try{report=JSON.parse(fs.readFileSync(failureOut+'/mocha.json'));}catch{}fs.writeFileSync(failureOut+'/runner-failure.json',JSON.stringify({message:e.message,stack:e.stack,stats:report?.stats,failures:report?.failures?.map(f=>({name:f.fullTitle,message:f.err.message}))},null,2));}console.error(e.stack);process.exitCode=1;});
