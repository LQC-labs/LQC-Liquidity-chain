
import assert from 'node:assert/strict';
import {getAddress,keccak256,toUtf8Bytes} from 'ethers';
import {argsFor,canonical,uint,hash32} from './candidate-schema-v3.mjs';
export function callMeaning(iface,q,chainId){
 assert.equal(q.rpc,'eth_call');const f=iface.getFunction(q.method);
 const args=argsFor(iface,q.method,q.args);uint(chainId);hash32(q.queryBlockHash);
 return {schema:'LQC_ABI_CALL_MEANING_V1',chainId,target:getAddress(q.target),caller:getAddress(q.caller),signature:f.format('sighash'),selector:f.selector,inputTypes:f.inputs.map(p=>p.format('sighash')),args,queryBlock:{number:BigInt(q.blockTag).toString(),hash:q.queryBlockHash.toLowerCase()}};
}
export const semanticCallCommitment=(iface,q,chainId)=>keccak256(toUtf8Bytes(canonical(callMeaning(iface,q,chainId))));
export function candidateSemanticCommitment(state,history,interfaces){
 const queries=new Map();
 for(const [id,q]of state.journalState.requests){
  if(q.rpc==='eth_call'){
   const meaning=callMeaning(interfaces.get(q.target.toLowerCase()),q,state.scope.chainId),key=canonical(meaning),old=queries.get(key);
   const responseHash=keccak256(state.journalState.responses.get(id));
   if(old){assert.equal(old.responseHash,responseHash,'SEMANTIC_RESPONSE_CONFLICT');old.count++;}
   else queries.set(key,{meaning,responseHash,count:1});
  }
 }
 const payload={schema:'LQC_LOCAL_CANDIDATE_MEANING_V1',chainId:state.scope.chainId,
 queryBlock:{number:state.scope.queryBlock.number,hash:state.scope.queryBlock.hash},
 contracts:state.scope.contracts.map(({role,address,runtimeHash})=>({role,address:getAddress(address),runtimeHash})),
 queries:[...queries].sort(([a],[b])=>a.localeCompare(b)).map(([,v])=>v),
 transactions:state.scope.receipts.map(r=>({hash:r.raw.transactionHash,block:BigInt(r.raw.blockNumber).toString(),blockHash:r.raw.blockHash,timestamp:r.blockTimestamp,status:r.raw.status})),
 history};
 return keccak256(toUtf8Bytes(canonical(payload)));
}
