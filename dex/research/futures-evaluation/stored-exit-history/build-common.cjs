const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
const equal=(a,b,code)=>assert.equal(JSON.stringify(canonical(a)),JSON.stringify(canonical(b)),code);
const read=p=>JSON.parse(fs.readFileSync(p));
function requirements(root){
 const pins=require(path.join(root,'build-pins.cjs')),bytes=fs.readFileSync(path.join(root,'build-requirements.json'));
 assert.equal(sha(bytes),pins.requirementsSHA256,'REQUIREMENTS_PIN_MISMATCH');return {pins,req:JSON.parse(bytes)};
}
function sourceBytes(root,req){
 const sources={};for(const [p,h]of Object.entries(req.sources)){
  assert(!p.includes('..')&&!path.isAbsolute(p)&&p.endsWith('.sol'),'SOURCE_PATH');const file=path.join(root,p);
  assert(fs.existsSync(file),'SOURCE_MISSING:'+p);
  assert(fs.realpathSync(file).toLowerCase().startsWith(fs.realpathSync(root).toLowerCase()+path.sep),'SOURCE_OUTSIDE_ROOT');
  const bytes=fs.readFileSync(file);assert.equal(sha(bytes),h,'SOURCE_BYTES_MISMATCH:'+p);sources[p]={content:bytes.toString('utf8')};
 }
 for(const [p,s]of Object.entries(sources))for(const m of s.content.matchAll(/import\s+(?:[^;]*?from\s+)?["']([^"']+)["']/g)){
  assert(m[1].startsWith('.'),'EXTERNAL_IMPORT');const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(p),m[1]));assert(Object.hasOwn(sources,resolved),'IMPORT_CLOSURE_MISSING:'+resolved);
 }return sources;
}
function tools(root,req){
 const local=createRequire(path.join(root,'package.json'));
 for(const [file,hash]of Object.entries(req.lockFiles))assert.equal(sha(fs.readFileSync(path.join(root,file))),hash,'LOCK_FILE_MISMATCH:'+file);
 for(const [name,version]of Object.entries(req.dependencyVersions))assert.equal(read(path.join(root,'node_modules',name,'package.json')).version,version,'DEPENDENCY_VERSION_MISMATCH:'+name);
 const solc=local('solc');assert.equal(solc.version(),req.compiler.version,'COMPILER_VERSION_MISMATCH');assert.equal(sha(fs.readFileSync(local.resolve('solc/soljson.js'))),req.compiler.soljsonSHA256,'COMPILER_BYTES_MISMATCH');return {solc,local};
}
function makeInput(root,req){return {language:'Solidity',sources:sourceBytes(root,req),settings:req.settings};}
function validateBuild(root){
 root=path.resolve(root);const {pins,req}=requirements(root);tools(root,req);const sources=sourceBytes(root,req);
 const inputBytes=fs.readFileSync(path.join(root,'build/compiler-input.json')),input=JSON.parse(inputBytes),manifestBytes=fs.readFileSync(path.join(root,'build/manifest.json')),manifest=JSON.parse(manifestBytes);
 equal(manifest.compiler,req.compiler,'BUILD_COMPILER_MISMATCH');
 equal(input.settings.libraries,req.settings.libraries,'LIBRARIES_MISMATCH');equal(input.settings,req.settings,'BUILD_SETTINGS_MISMATCH');
 equal(Object.keys(input.sources).sort(),Object.keys(sources).sort(),'INPUT_SOURCE_SET_MISMATCH');
 for(const [p,s]of Object.entries(sources))equal(input.sources[p],s,'INPUT_SOURCE_BYTES_MISMATCH:'+p);
 equal(Object.keys(input).sort(),['language','settings','sources'],'INPUT_SCHEMA');assert.equal(input.language,'Solidity','INPUT_LANGUAGE');
 assert.equal(sha(inputBytes),manifest.inputSHA256,'INPUT_HASH_MISMATCH');
 assert.equal(sha(manifestBytes),pins.buildManifestSHA256,'BUILD_MANIFEST_PIN_MISMATCH');
 const outputBytes=fs.readFileSync(path.join(root,'build/compiler-output.json'));assert.equal(sha(outputBytes),manifest.outputSHA256,'OUTPUT_HASH_MISMATCH');
 const output=JSON.parse(outputBytes);assert(!(output.errors??[]).some(e=>e.severity==='error'),'BUILD_CONTAINS_ERRORS');
 equal(Object.keys(output.sources).sort(),Object.keys(sources).sort(),'OUTPUT_SOURCE_SET_MISMATCH');
 for(const [source,names]of Object.entries(req.settings.outputSelection)){
  if(source==='*')continue;for(const name of Object.keys(names)){assert(output.contracts[source]?.[name],'OUTPUT_CONTRACT_MISSING:'+name);const evm=output.contracts[source][name].evm;
   assert(evm.bytecode.object&&!evm.bytecode.object.includes('_'),'UNLINKED_CREATION');assert(evm.deployedBytecode.object&&!evm.deployedBytecode.object.includes('_'),'UNLINKED_RUNTIME');equal(evm.bytecode.linkReferences,{},'UNEXPECTED_LIBRARY_LINKS');
  }
 }
 return {root,req,output,manifest,level:'REVIEWED_LOCAL_BUILD_BYTES_NOT_CODE_CORRECTNESS_OR_CHAIN_AUTHENTICATION'};
}
// Both the real runner and isolated rejection checks enter through this gate.
function gate(root,launch){const verified=validateBuild(root);return launch(verified);}
module.exports={sha,canonical,equal,requirements,sourceBytes,tools,makeInput,validateBuild,gate};
