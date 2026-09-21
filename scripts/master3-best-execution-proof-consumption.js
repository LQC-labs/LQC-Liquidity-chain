#!/usr/bin/env node
'use strict';
const crypto=require('crypto');
function fail(reason){return {stage:'3/9',pass:false,activationAuthorized:false,reason};}
function evaluate(input){
 try{
  if(!input||!input.proof||input.proof.stage!=='3/8'||input.proof.pass!==true) throw new Error('VALID_3_8_PROOF_REQUIRED');
  if(input.proof.activationAuthorized!==false) throw new Error('ACTIVATION_BOUNDARY_VIOLATION');
  if(!input.proof.canonicalPayload||!input.proof.proofDigest) throw new Error('INCOMPLETE_PROOF');
  const digest='sha256:'+crypto.createHash('sha256').update(input.proof.canonicalPayload,'utf8').digest('hex');
  if(digest!==input.proof.proofDigest) throw new Error('PROOF_DIGEST_MISMATCH');
  const p=JSON.parse(input.proof.canonicalPayload);
  const r=input.request||{};
  if(String(r.selectedRouteId)!==String(p.selectedRouteId)) throw new Error('ROUTE_MISMATCH');
  if(String(r.chainId)!==String(p.chainId)) throw new Error('CHAIN_MISMATCH');
  if(String(r.routerAddress).toLowerCase()!==String(p.routerAddress).toLowerCase()) throw new Error('ROUTER_MISMATCH');
  if(String(r.registryVersion)!==String(p.registryVersion)) throw new Error('REGISTRY_MISMATCH');
  if(String(r.quoteExpiry)!==String(p.quoteExpiry)) throw new Error('EXPIRY_MISMATCH');
  if(r.now!=null && BigInt(String(r.now))>=BigInt(String(p.quoteExpiry))) throw new Error('PROOF_EXPIRED');
  if(r.futuresStateUsed||r.lendingStateUsed||r.intentStateUsed) throw new Error('NON_DEX_STATE_USED');
  for(const k of ['candidates','adapterId','domain','canonicalPayload','proofDigest']) if(Object.prototype.hasOwnProperty.call(r,k)) throw new Error('PROOF_OVERRIDE_FORBIDDEN');
  return {stage:'3/9',pass:true,activationAuthorized:false,selectedRouteId:p.selectedRouteId,proofDigest:digest};
 }catch(e){return fail(e.message||'PROOF_CONSUMPTION_FAILURE');}
}
module.exports={evaluate};
