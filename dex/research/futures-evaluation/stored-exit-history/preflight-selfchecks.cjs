const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{gate}=require('./build-common.cjs');
const root=__dirname,out=path.join(root,'results','preflight-'+Date.now());fs.mkdirSync(out,{recursive:true});
const req=JSON.parse(fs.readFileSync(path.join(root,'build-requirements.json')));
const files=[...Object.keys(req.sources),'package.json','package-lock.json','build-pins.cjs','build-requirements.json','build/compiler-input.json','build/compiler-output.json','build/manifest.json'];
function copy(name){const dst=path.join(out,name);fs.mkdirSync(dst);for(const p of files){const q=path.join(dst,p);fs.mkdirSync(path.dirname(q),{recursive:true});fs.copyFileSync(path.join(root,p),q,fs.constants.COPYFILE_EXCL);}fs.symlinkSync(path.join(root,'node_modules'),path.join(dst,'node_modules'),'junction');return dst;}
function json(root,p,change){const q=path.join(root,p),x=JSON.parse(fs.readFileSync(q));change(x);fs.writeFileSync(q,JSON.stringify(x));}
const cases=[
 ['source-no-recompile','SOURCE_BYTES_MISMATCH',d=>fs.appendFileSync(path.join(d,'contracts/StoredExitHistoryVerifier.sol'),'\n// stale-build test only\n')],
 ['input-settings','BUILD_SETTINGS_MISMATCH',d=>json(d,'build/compiler-input.json',x=>x.settings.optimizer.runs=201)],
 ['input-source','INPUT_SOURCE_BYTES_MISMATCH',d=>json(d,'build/compiler-input.json',x=>x.sources['contracts/StoredExitHistoryVerifier.sol'].content+='\n// changed input only')],
 ['input-path','INPUT_SOURCE_SET_MISMATCH',d=>json(d,'build/compiler-input.json',x=>{x.sources['contracts/renamed.sol']=x.sources['contracts/StoredExitHistoryVerifier.sol'];delete x.sources['contracts/StoredExitHistoryVerifier.sol'];})],
 ['output-tamper','OUTPUT_HASH_MISMATCH',d=>fs.appendFileSync(path.join(d,'build/compiler-output.json'),' ')],
 ['dependency-missing','SOURCE_MISSING',d=>fs.unlinkSync(path.join(d,'fixtures/local/contracts/futures/ILQCFuturesOracle.sol'))],
 ['library-mismatch','LIBRARIES_MISMATCH',d=>json(d,'build/compiler-input.json',x=>x.settings.libraries={'contracts/Foreign.sol':{Foreign:'0x0000000000000000000000000000000000000001'}})],
 ['compiler-mismatch','BUILD_COMPILER_MISMATCH',d=>json(d,'build/manifest.json',x=>x.compiler.version='0.8.29')],
 ['manifest-tamper','BUILD_MANIFEST_PIN_MISMATCH',d=>json(d,'build/manifest.json',x=>x.extra='not-approved')],
];
const results=[];let normalLaunches=0;gate(copy('normal'),()=>normalLaunches++);assert.equal(normalLaunches,1);results.push({case:'normal',status:'PASS',launchStub:1,anvilStarts:0});
for(const [name,expected,mutate]of cases){const d=copy(name);mutate(d);let launches=0,message;try{gate(d,()=>launches++);}catch(e){message=e.message;}assert(message?.includes(expected),name+': '+message);assert.equal(launches,0,name);results.push({case:name,status:'PASS',expected,actual:message.split('\n')[0],launchStub:launches,anvilStarts:0,testProcesses:0});}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({results,sharedProductionGate:'build-common.cjs gate',automaticPinsRegenerated:false},null,2),{flag:'wx'});console.log(JSON.stringify({result:'PASS',cases:results.length,negative:cases.length,anvilStarts:0,out}));
