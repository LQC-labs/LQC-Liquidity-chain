'use strict';
const assert=require('assert');
const {evaluate}=require('../scripts/master3-router-proof-revalidation');
const base={
 pinnedCommit:'abc123', lockfileHash:'sha256:x', compiler:'solc-pinned',
 bestExecutionProof:{creationHash:'0x01',runtimeHash:'0x02',reviewed:true},
 proofGateway:{creationHash:'0x03',runtimeHash:'0x04',reviewed:true,executionRouter:'0xrouter',registry:'0xregistry'},
 executionRouter:{address:'0xrouter',redeploy:false},
 registry:{address:'0xregistry'},
 historicalPacket:{authorizesDeployment:false},
 chainSpecificCoreAssumption:false
};
assert.strictEqual(evaluate(base).pass,true);
assert.strictEqual(evaluate(base).activationAuthorized,false);
for(const k of ['pinnedCommit','lockfileHash','compiler','bestExecutionProof','proofGateway','executionRouter','registry']){
 const x=JSON.parse(JSON.stringify(base)); delete x[k]; assert.strictEqual(evaluate(x).pass,false);
}
{
 const x=JSON.parse(JSON.stringify(base)); x.proofGateway.executionRouter='0xother'; assert.strictEqual(evaluate(x).pass,false);
}
{
 const x=JSON.parse(JSON.stringify(base)); x.executionRouter.redeploy=true; assert.strictEqual(evaluate(x).pass,false);
}
{
 const x=JSON.parse(JSON.stringify(base)); x.historicalPacket.authorizesDeployment=true; assert.strictEqual(evaluate(x).pass,false);
}
{
 const x=JSON.parse(JSON.stringify(base)); x.chainSpecificCoreAssumption=true; assert.strictEqual(evaluate(x).pass,false);
}
console.log('Master 3/1 proof revalidation tests: PASS');
