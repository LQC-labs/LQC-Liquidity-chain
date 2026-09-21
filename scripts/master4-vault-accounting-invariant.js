#!/usr/bin/env node
'use strict';
function fail(reason){return {stage:'4/5',pass:false,activationAuthorized:false,reason};}
function evaluate(s){
 try{
  for(const k of ['accountedAssets','strategyDebt','actualIdle']) if(!/^(0|[1-9]\d*)$/.test(String(s?.[k]))) throw new Error('INVALID_'+k.toUpperCase());
  if(s.futuresStateUsed||s.lendingStateUsed||s.intentStateUsed) throw new Error('NON_VAULT_STATE_USED');
  const a=BigInt(s.accountedAssets),d=BigInt(s.strategyDebt),idle=BigInt(s.actualIdle);
  if(d>a) throw new Error('DEBT_EXCEEDS_ACCOUNTED_ASSETS');
  const accountedIdle=a-d;
  const available=idle<accountedIdle?idle:accountedIdle;
  return {stage:'4/5',pass:true,activationAuthorized:false,accountedIdleAssets:accountedIdle.toString(),availableLiquidity:available.toString()};
 }catch(e){return fail(e.message||'VAULT_INVARIANT_FAILURE');}
}
module.exports={evaluate};
