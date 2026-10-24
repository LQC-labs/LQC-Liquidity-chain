// Deliberately failing Mocha children. Never imported by the 17 Anvil tests.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {finalize}=require('./failure-evidence.cjs');
const mode=process.env.LQC_EVIDENCE_MOCK_CASE,dir=process.env.LQC_EVIDENCE_MOCK_DIR;
if(!['bigint','nested','evidence','cleanup','both','reporter-write'].includes(mode)||!dir)throw Error('MOCK_CASE_REQUIRED');
function writeIdentity(value){
 const root=path.resolve(__dirname,'..'),expected=path.join(root,'results/failure-evidence-mock',mode);
 assert.equal(dir,expected,'MOCK_IDENTITY_PATH');assert(!fs.lstatSync(root).isSymbolicLink(),'MOCK_IDENTITY_ROOT_LINK');
 let current=root;const base=fs.realpathSync(root);
 for(const part of ['results','failure-evidence-mock',mode]){current=path.join(current,part);const info=fs.lstatSync(current);assert(!info.isSymbolicLink()&&info.isDirectory(),'MOCK_IDENTITY_DIRECTORY');assert(fs.realpathSync(current).startsWith(base+path.sep),'MOCK_IDENTITY_ESCAPE');}
 fs.writeFileSync(path.join(dir,'identity.json'),JSON.stringify(value),{flag:'wx'});
}
const nested=()=>new AggregateError([Object.assign(new Error('nested-one'),{code:'NESTED_ONE'}),new Error('nested-two')],'nested-many',{cause:new Error('root-cause')});
describe('Failure evidence isolated mock',function(){
 it('controlled '+mode,function(){
  if(mode==='bigint'){
   try{assert.strictEqual(900719925474099312345n,900719925474099312346n,'BIGINT_EXACT');}
   catch(error){error.code='MOCK_BIGINT';error.cause=nested();throw error;}
  }
  if(mode==='nested')throw Object.assign(new Error('outer-error',{cause:nested()}),{code:'MOCK_NESTED'});
 });
 if(['evidence','cleanup','both'].includes(mode))after(async function(){
  const first=Object.freeze(Object.assign(new Error('evidence-write-failed',{cause:nested()}),{code:'MOCK_EVIDENCE'}));
  const cleanup=Object.assign(new Error('cleanup-failed',{cause:new Error('cleanup-root')}),{code:'MOCK_CLEANUP'});
  let cleanupCalls=0;
  try{await finalize(()=>{if(mode!=='cleanup')throw first;},async()=>{cleanupCalls++;if(mode!=='evidence')throw cleanup;});}
  catch(error){
   try{writeIdentity({firstSame:error===(mode==='cleanup'?cleanup:first),cleanupCalls});}
   catch(recording){process.exitCode=1;try{fs.writeSync(2,require('./failure-evidence.cjs').stringify({primary:error,recording}));}catch{}throw new AggregateError([error,recording],'MOCK_IDENTITY_RECORDING_FAILED',{cause:error});}
   throw error;
  }
 });
});
