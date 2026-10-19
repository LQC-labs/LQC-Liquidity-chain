// Portable adaptation of task 2/66, not the original historical deployment script.
// Manual opt-in only: no downloads, installs, RPC, transaction or CI entry point.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),Module=require('node:module');
const assert=require('node:assert/strict'),root=__dirname;
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
assert.equal(process.argv.length,4,'USAGE: reproduce.cjs <exact-toolchain-root> <new-output-directory>');
const toolchain=fs.realpathSync(process.argv[2]),out=path.resolve(process.argv[3]);
assert(!fs.existsSync(out),'OUTPUT_ALREADY_EXISTS');
const provenance=JSON.parse(fs.readFileSync(root+'/provenance.json'));
const sums=JSON.parse(fs.readFileSync(root+'/SHA256SUMS.json'));
for(const name of ['compiler-input.json','observed-runtime.hex','provenance.json','reproduce.cjs'])assert.equal(sha(fs.readFileSync(path.join(root,name))),sums[name],'PUBLIC_FILE_HASH_MISMATCH:'+name);
const prefix=toolchain+path.sep,allowed=provenance.loadedCompilerFiles;
for(const [file,hash]of Object.entries(allowed)){
 const resolved=fs.realpathSync(path.join(toolchain,file));assert(resolved.startsWith(prefix),'TOOLCHAIN_PATH_ESCAPE');
 assert.equal(sha(fs.readFileSync(resolved)),hash,'TOOLCHAIN_FILE_HASH_MISMATCH:'+file);
}
// Refuse fallback into unrelated globally/locally installed packages.
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,...rest){
 const file=resolve.call(this,name,...rest);if(Module.isBuiltin(name))return file;
 const absolute=fs.realpathSync(file);assert(absolute.startsWith(prefix),'EXTERNAL_MODULE_FORBIDDEN');
 const relative=path.relative(toolchain,absolute).split(path.sep).join('/');
 assert(Object.hasOwn(allowed,relative),'UNRECORDED_COMPILER_MODULE:'+relative);
 assert.equal(sha(fs.readFileSync(absolute)),allowed[relative],'LOADED_MODULE_HASH_MISMATCH');return absolute;
};
const solc=require(path.join(toolchain,'node_modules/solc'));
assert.equal(solc.version(),provenance.compiler,'COMPILER_VERSION_MISMATCH');
const input=fs.readFileSync(root+'/compiler-input.json');
assert.equal(sha(input),provenance.originalEvidenceHashes.inputSha256,'INPUT_HASH_MISMATCH');
const parsed=JSON.parse(input);assert.deepEqual(parsed.settings,provenance.settings);
assert.deepEqual(Object.keys(parsed.sources),[provenance.sourceName]);
assert.equal(sha(Buffer.from(parsed.sources[provenance.sourceName].content)),provenance.candidateFiles['dex/'+provenance.sourceName].sha256);
const observed=Buffer.from(fs.readFileSync(root+'/observed-runtime.hex','utf8').trim().slice(2),'hex');
assert.equal(sha(observed),provenance.observation.runtimeSha256,'OBSERVATION_HASH_MISMATCH');
const keccak=require(path.join(toolchain,'node_modules/js-sha3')).keccak256;
assert.equal('0x'+keccak(observed),provenance.observation.runtimeKeccak256);
fs.mkdirSync(out); // Never overwrite any original evidence or existing Artifact.
const output=solc.compile(input.toString());
fs.writeFileSync(path.join(out,'compiler-output.json'),output,{flag:'wx'});
const result=JSON.parse(output),errors=(result.errors||[]).filter(e=>e.severity==='error');
assert.equal(errors.length,0,'COMPILATION_FAILED');
const hex=result.contracts[provenance.sourceName].LQCFuturesMarketRegistry.evm.deployedBytecode.object;
assert(/^(?:[a-fA-F0-9]{2})+$/.test(hex),'UNRESOLVED_RUNTIME');
const runtime=Buffer.from(hex,'hex');let first=null,differences=0;
for(let i=0;i<Math.max(runtime.length,observed.length);i++)if(runtime[i]!==observed[i]){first??=i;differences++;}
const report={status:differences?'RECONSTRUCTED_RUNTIME_MISMATCH':'RECONSTRUCTED_RUNTIME_MATCH',
 compiler:solc.version(),candidateCommit:provenance.candidateCommit,inputSha256:sha(input),outputSha256:sha(Buffer.from(output)),
 runtimeBytes:runtime.length,runtimeKeccak256:'0x'+keccak(runtime),runtimeSha256:sha(runtime),differenceCount:differences,firstMismatch:first,
 wholeRuntimeIncludingMetadata:true,maskingApplied:false,
 originalArtifactStatus:'REQUIRED_ARTIFACT_MISSING',actualWalletArtifactProvenance:'UNPROVEN',subsequentSixBuilds:'MISMATCH',
 independentChainAuthentication:false,contractSafetyEstablished:false,v1Approval:false,evaluationStatus:'NOT_EVALUATED',confirmedAmount:null,
 fundsAuthority:false,settlementAuthorized:false,createsClaim:false,consumesHistory:false,returnAuthorized:false,heldUseAuthorized:false,lpRecoveryAuthorized:false,rightsTransferAuthorized:false};
fs.writeFileSync(path.join(out,'comparison.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
assert.equal(report.outputSha256,provenance.originalEvidenceHashes.outputSha256,'RECORDED_COMPILER_OUTPUT_HASH_MISMATCH');
if(differences)process.exitCode=1;
