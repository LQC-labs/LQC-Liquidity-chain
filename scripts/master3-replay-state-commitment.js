#!/usr/bin/env node
'use strict';
const crypto=require('crypto');
function fail(reason){return {stage:'3/11',pass:false,activationAuthorized:false,reason};}
function evaluate(input){
 try{
  if(!input||input.stage!=='3/10'||input.pass!==true||input.activationAuthorized!==false) throw new Error('VALID_3_10_RESULT_REQUIRED');
  if(input.futuresStateUsed||input.lendingStateUsed||input.intentStateUsed) throw new Error('NON_DEX_STATE_USED');
  if(!Array.isArray(input.nextConsumedReplayKeys)||!input.nextConsumedReplayKeys.length) throw new Error('REPLAY_KEYS_REQUIRED');
  const keys=input.nextConsumedReplayKeys.map(String);
  const re=/^sha256:[0-9a-f]{64}$/;
  if(keys.some(k=>!re.test(k))) throw new Error('INVALID_REPLAY_KEY');
  if(new Set(keys).size!==keys.length) throw new Error('DUPLICATE_REPLAY_KEY');
  const sorted=[...keys].sort();
  const prior=input.priorStateRoot==null?null:String(input.priorStateRoot);
  if(prior!==null && !re.test(prior)) throw new Error('INVALID_PRIOR_ROOT');
  const payload=JSON.stringify({version:1,priorStateRoot:prior,count:sorted.length,replayKeys:sorted});
  const stateRoot='sha256:'+crypto.createHash('sha256').update(payload,'utf8').digest('hex');
  return {stage:'3/11',pass:true,activationAuthorized:false,stateRoot,count:sorted.length,canonicalStatePayload:payload};
 }catch(e){return fail(e.message||'STATE_COMMITMENT_FAILURE');}
}
module.exports={evaluate};
