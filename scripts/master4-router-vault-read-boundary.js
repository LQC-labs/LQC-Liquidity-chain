#!/usr/bin/env node
'use strict';
const fs=require('fs');
function audit(){
 const iface=fs.readFileSync('dex/contracts/vault/interfaces/ILQCVaultRead.sol','utf8');
 const integration=fs.readFileSync('dex/test/vault-router-risk-integration.test.mjs','utf8');
 const forbidden=['deposit(','withdraw(','redeem(','allocateToStrategy(','recallFromStrategy(','setStrategy(','approve('];
 const exposed=forbidden.filter(x=>iface.includes('function '+x));
 if(exposed.length)return {stage:'4/6',pass:false,activationAuthorized:false,reason:'MUTATION_EXPOSED',exposed};
 const required=['availableLiquidity()','accountedAssets()','strategyDebt()','depositsPaused()','allocationsPaused()','isInsolvent()'];
 const missing=required.filter(x=>!iface.includes(x));
 if(missing.length)return {stage:'4/6',pass:false,activationAuthorized:false,reason:'READ_SURFACE_MISSING',missing};
 for(const evidence of ['routerAllowance','adapterAllowance','keeps Vault principal and share accounting unchanged','keeps actively deployed strategy assets isolated'])
  if(!integration.includes(evidence)) return {stage:'4/6',pass:false,activationAuthorized:false,reason:'ISOLATION_EVIDENCE_MISSING',evidence};
 return {stage:'4/6',pass:true,activationAuthorized:false,readSurface:'ILQCVaultRead'};
}
if(require.main===module){const r=audit();console.log(JSON.stringify(r,null,2));process.exit(r.pass?0:1);}
module.exports={audit};
