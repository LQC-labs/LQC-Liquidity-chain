import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {collectRegistryObservation} from './collector.mjs';
import {createNodeTransport} from './transport.mjs';
import {openJournal} from './journal.mjs';

// Explicit manual entry point only. CI imports/tests mocks, never this live path.
async function main(){
 if(process.argv.length!==3||!process.env.BSC_TESTNET_RPC_URL)throw Error('EXPLICIT_OUTPUT_AND_RPC_REQUIRED');
 const runId=randomUUID(),directory=path.resolve(process.argv[2]);
 const transport=createNodeTransport(process.env.BSC_TESTNET_RPC_URL),journal=openJournal(directory);
 try{
  const result=await collectRegistryObservation({request:transport.request,persist:journal.persist,runId,node:transport.descriptor});
  const root=fileURLToPath(new URL('./',import.meta.url));
  result.implementation={files:Object.fromEntries(['collector.mjs','transport.mjs','journal.mjs','collect.mjs','../../scripts/verify-futures-deployment-lineage.mjs'].map(f=>[f,createHash('sha256').update(fs.readFileSync(path.resolve(root,f))).digest('hex')])),limits:'File hashes identify implementation bytes, not correctness or independent chain truth.'};
  journal.finish(result);
  console.log(JSON.stringify({runId,status:result.status,evidenceLevel:result.evidenceLevel,trustStatus:result.trustStatus,requestCount:result.requestCount,Q:result.Q,blockers:result.blockers}));
  if(!result.collectionComplete)process.exitCode=1;
 }finally{journal.close();}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('COLLECTION_ENTRY_FAILED_NO_RETRY');process.exitCode=1;});
