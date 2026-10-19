import { REQUIRED_PLAN, validatePlan } from './dex/test/support/required-plan.mjs';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { preflightCollector43 } from './dex/test/support/capture-scope.mjs';
import { assertPublicQuery, describeAllowlist } from './dex/test/support/public-queries.mjs';
import { createJournal, persistJson } from './dex/test/support/query-journal.mjs';
const ROOT=fileURLToPath(new URL('./',import.meta.url));
export async function runCollectionPreflight(){
 assert(!fs.existsSync(path.join(ROOT,'attempt-started.json')),'ALREADY_ATTEMPTED');
 const build='C:/Users/user/LQC-Integration/LQC-V11-Equivalence-Recheck-20261018/build';
 const artifact=n=>JSON.parse(fs.readFileSync(path.join(build,'artifacts/contracts/futures/'+(n.startsWith('LocalVNext')?'mocks/LocalVNextFixtures':'local-vnext/'+n)+'.sol/'+n+'.json')));
 let launches=0;const guarded=plan=>{validatePlan(artifact,plan);launches++;};assert.throws(()=>guarded(REQUIRED_PLAN.slice(1)),/MISSING_REQUIRED_CALL/);assert.equal(launches,0);validatePlan(artifact);const p=preflightCollector43(artifact),allowlist=describeAllowlist(artifact);assert(allowlist.length>0);assert(!allowlist.some(q=>q.method==='validatePeers'));
 assertPublicQuery('LocalFuturesTradingCore','domain');assert.throws(()=>assertPublicQuery('LocalFuturesPreparedStateVerifier','validatePeers'),/NOT_ALLOWLISTED/);assert.throws(()=>assertPublicQuery('LocalFuturesTradingCore','reduceExposureResearch'),/NOT_ALLOWLISTED/);
 const base=path.join(ROOT,'preflight-checks');fs.mkdirSync(base,{recursive:true});let n=1;while(fs.existsSync(path.join(base,'partial-'+n+'.jsonl')))n++;
 const file=path.join(base,'partial-'+n+'.jsonl'),journal=createJournal(file,'SYNTHETIC_PREFLIGHT_NO_CHAIN');let operations=0;
 persistJson(path.join(base,'q-before-'+n+'.json'),{kind:'SYNTHETIC_PREFLIGHT_ONLY',notChainEvidence:true});
 await journal.invoke({phase:'SYNTHETIC_PREFLIGHT',method:'publicReadA',target:'memory-only',args:[],caller:'none',blockTag:'synthetic',required:true},async()=>{operations++;assert.equal(fs.readFileSync(file,'utf8').trim().split('\n').length,1);return {syntheticResult:'A'};});
 await assert.rejects(journal.invoke({phase:'SYNTHETIC_PREFLIGHT',method:'publicReadB',target:'memory-only',args:[],caller:'none',blockTag:'synthetic',required:true},async()=>{operations++;throw Error('INTENTIONAL_PREFLIGHT_READ_FAILURE');}),/INTENTIONAL_PREFLIGHT_READ_FAILURE/);
 const rows=fs.readFileSync(file,'utf8').trim().split('\n').map(s=>JSON.parse(s));assert.deepEqual(rows.map(x=>x.event),['REQUEST','RESPONSE','REQUEST','ERROR']);assert.equal(rows[1].response.syntheticResult,'A');assert.equal(rows[3].error.message,'INTENTIONAL_PREFLIGHT_READ_FAILURE');assert.equal(journal.summary().requiredFailures,1);assert.equal(journal.summary().pending,0);assert.equal(operations,2);assert(fs.existsSync(path.join(base,'q-before-'+n+'.json')));
 const rejectDescriptor={target:'synthetic-attribution',args:['1'],blockTag:'synthetic-Q',required:true};assert.throws(()=>journal.reject(rejectDescriptor,Error('INTENTIONAL_BEFORE_RPC')),/INTENTIONAL_BEFORE_RPC/);assert.equal(journal.events.at(-1).event,'REJECTED_BEFORE_RPC');assert.deepEqual(journal.events.at(-1).request,rejectDescriptor);assert.equal(operations,2);
 const names=['dex/test/support/required-plan.mjs','run-metadata.json','run-safe-boundary.cjs','time-preflight.cjs','collection-preflight.mjs','preflight.cjs','preflight-manifest.json','dex/test/futures-v11-trading-core-protected-withdrawal.test.mjs','dex/test/support/capture-scope.mjs','dex/test/support/anvil-compat.mjs','dex/test/support/public-queries.mjs','dex/test/support/query-journal.mjs'],hashes={};
 for(const name of names)hashes[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,name))).digest('hex');
 persistJson(path.join(ROOT,'collection-source-hashes.json'),hashes);
 const result={...p,status:'PASS',missingRequiredCallSelfTest:{status:'PASS',anvilStarts:launches,scenarioExecutions:0,preRpcRejectionJournal:'PASS'},sourceFileCount:names.length,allowlistEntries:allowlist.length,registryOnlyDirectCalls:0,mutationQueriesAllowed:0,partialPersistence:{status:'PASS',requests:2,responses:1,errors:1,pending:0,thirdOperationExecuted:false,syntheticOnly:true},anvilStarts:0,rpcCalls:0,scenarioExecutions:0,finalCallsRequireExplicitBlockTag:true,latestFallback:false};
 persistJson(path.join(ROOT,'collection-preflight.json'),result);return result;
}