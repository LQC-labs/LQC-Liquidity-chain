#!/usr/bin/env node
'use strict';
const fs = require('fs');

function result(pass, reason, extra={}) {
  return { stage:'3/1', gate:'proof-artifact-dependency', pass, activationAuthorized:false, reason, ...extra };
}
function evaluate(x) {
  if (!x || typeof x !== 'object') return result(false,'INVALID_INPUT');
  const required=['pinnedCommit','lockfileHash','compiler','bestExecutionProof','proofGateway','executionRouter','registry'];
  const missing=required.filter(k=>!x[k]);
  if (missing.length) return result(false,'MISSING_INPUT',{missing});
  const bad=[];
  for (const name of ['bestExecutionProof','proofGateway']) {
    const a=x[name];
    if (!a.creationHash || !a.runtimeHash) bad.push({item:name,reason:'MISSING_ARTIFACT_HASH'});
    if (a.reviewed !== true) bad.push({item:name,reason:'NOT_REVIEWED'});
  }
  if (x.proofGateway.executionRouter !== x.executionRouter.address)
    bad.push({item:'proofGateway',reason:'EXECUTION_ROUTER_BINDING_MISMATCH'});
  if (x.proofGateway.registry !== x.registry.address)
    bad.push({item:'proofGateway',reason:'REGISTRY_BINDING_MISMATCH'});
  if (x.executionRouter.redeploy === true)
    bad.push({item:'executionRouter',reason:'FULL_ROUTER_REDEPLOY_FORBIDDEN'});
  if (x.historicalPacket && x.historicalPacket.authorizesDeployment === true)
    bad.push({item:'historicalPacket',reason:'STALE_PACKET_CANNOT_AUTHORIZE'});
  if (x.chainSpecificCoreAssumption === true)
    bad.push({item:'portability',reason:'CHAIN_SPECIFIC_CORE_ASSUMPTION'});
  return bad.length ? result(false,'REVALIDATION_FAILED',{findings:bad}) :
    result(true,'REVALIDATED',{pinnedCommit:x.pinnedCommit});
}
if (require.main===module) {
  const p=process.argv[2];
  if(!p){ console.error(JSON.stringify(result(false,'INPUT_FILE_REQUIRED'))); process.exit(2); }
  const r=evaluate(JSON.parse(fs.readFileSync(p,'utf8')));
  console.log(JSON.stringify(r,null,2)); process.exit(r.pass?0:1);
}
module.exports={evaluate};
