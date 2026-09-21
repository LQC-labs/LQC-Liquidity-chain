#!/usr/bin/env node
'use strict';
const crypto=require('crypto');

function fail(reason){return {stage:'3/8',pass:false,activationAuthorized:false,reason};}
function canonicalize(input){
  if(!input||input.stage!=='3/7'||!input.selectedRouteId||!Array.isArray(input.canonicalSelectionInput)) throw new Error('INVALID_SELECTION');
  if(!input.chainId||!input.routerAddress||!input.registryVersion||!input.quoteExpiry) throw new Error('MISSING_DOMAIN_IDENTITY');
  if(input.futuresStateUsed||input.lendingStateUsed||input.intentStateUsed) throw new Error('NON_DEX_STATE_USED');
  const rows=input.canonicalSelectionInput;
  if(!rows.length) throw new Error('EMPTY_CANDIDATES');
  const ids=new Set();
  for(const r of rows){
    if(!r.routeId||!r.adapterId||r.domain!=='DEX_FLOW') throw new Error('INVALID_CANDIDATE');
    if(ids.has(r.routeId)) throw new Error('DUPLICATE_ROUTE_ID');
    ids.add(r.routeId);
  }
  if(!ids.has(input.selectedRouteId)) throw new Error('SELECTED_ROUTE_MISSING');
  if(input.now!=null && BigInt(String(input.now))>=BigInt(String(input.quoteExpiry))) throw new Error('QUOTE_EXPIRED');
  return JSON.stringify({
    version:1,stage:'3/7',chainId:String(input.chainId),
    routerAddress:String(input.routerAddress).toLowerCase(),
    registryVersion:String(input.registryVersion),quoteExpiry:String(input.quoteExpiry),
    selectedRouteId:String(input.selectedRouteId),
    candidates:rows.map(r=>({
      routeId:String(r.routeId),adapterId:String(r.adapterId),domain:'DEX_FLOW',
      grossOut:String(r.grossOut),explicitCost:String(r.explicitCost),
      netOut:String(r.netOut),riskScore:String(r.riskScore)
    }))
  });
}
function evaluate(input){
  try{
    const payload=canonicalize(input);
    return {stage:'3/8',pass:true,activationAuthorized:false,selectedRouteId:input.selectedRouteId,
      proofDigest:'sha256:'+crypto.createHash('sha256').update(payload,'utf8').digest('hex'),canonicalPayload:payload};
  }catch(e){return fail(e.message||'PROOF_BINDING_FAILURE');}
}
module.exports={evaluate,canonicalize};
