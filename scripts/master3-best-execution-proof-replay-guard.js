#!/usr/bin/env node
'use strict';
const crypto=require('crypto');
function fail(reason){return {stage:'3/10',pass:false,activationAuthorized:false,reason};}
function replayKey(x){
 if(!x||x.stage!=='3/9'||x.pass!==true||x.activationAuthorized!==false) throw new Error('VALID_3_9_RESULT_REQUIRED');
 if(!x.proofDigest||!x.selectedRouteId||!x.chainId||!x.routerAddress) throw new Error('MISSING_CONTEXT');
 if(!/^(0|[1-9]\d*)$/.test(String(x.nonce))) throw new Error('INVALID_NONCE');
 if(x.futuresStateUsed||x.lendingStateUsed||x.intentStateUsed) throw new Error('NON_DEX_STATE_USED');
 const payload=JSON.stringify({proofDigest:String(x.proofDigest),selectedRouteId:String(x.selectedRouteId),chainId:String(x.chainId),routerAddress:String(x.routerAddress).toLowerCase(),nonce:String(x.nonce)});
 return 'sha256:'+crypto.createHash('sha256').update(payload,'utf8').digest('hex');
}
function evaluate(input){
 try{
  const key=replayKey(input);
  const consumed=new Set((input.consumedReplayKeys||[]).map(String));
  if(consumed.has(key)) throw new Error('PROOF_REPLAY_DETECTED');
  return {stage:'3/10',pass:true,activationAuthorized:false,replayKey:key,nextConsumedReplayKeys:[...consumed,key].sort()};
 }catch(e){return fail(e.message||'REPLAY_GUARD_FAILURE');}
}
module.exports={evaluate,replayKey};
