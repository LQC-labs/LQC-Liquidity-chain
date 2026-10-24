const fs=require('node:fs');
const {encode,stringify,failureKinds}=require('./failure-evidence.cjs');
// No stock JSON reporter: its error serialization cannot encode BigInt.
module.exports=class EvidenceReporter{
 constructor(runner,options){
  const tests=[],passes=[],pending=[],failures=[];
  const item=t=>({title:t.title,fullTitle:t.fullTitle(),duration:t.duration,currentRetry:t.currentRetry()});
  runner.on('test end',t=>tests.push(item(t)));
  runner.on('pass',t=>passes.push(item(t)));
  runner.on('pending',t=>pending.push(item(t)));
  runner.on('fail',(t,error)=>failures.push({...item(t),kinds:failureKinds(error,t.type==='hook'?'hook':'test'),err:encode(error)}));
  runner.once('end',()=>{
   const report={stats:runner.stats,tests,passes,pending,failures,reporter:{state:'COMPLETE',encoding:'LQC_TYPED_ERROR_1'}};
   try{
    // Errors are already typed; keep the normal report envelope for runner validation.
    fs.writeFileSync(options.reporterOptions.output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
   }catch(error){
    process.exitCode=1;
    // Independent raw stderr fallback retains the report and the recording error.
    try{fs.writeSync(2,'LQC_REPORTER_FAILURE\n'+stringify({kind:'reporter',evidenceError:error,report}));}
    catch(fallback){process.exitCode=1;try{fs.writeSync(2,'LQC_REPORTER_FALLBACK_FAILED\n'+stringify({error,fallback,report}));}catch{}}
   }
  });
 }
};
