#!/usr/bin/env node
'use strict';
const fs=require('fs');
function fail(reason,missing=[]){return {stage:'4/1',pass:false,activationAuthorized:false,reason,missing};}
function audit(source){
 const required=[
  'uint256 public accountedAssets','uint256 public strategyDebt','uint256 public strategyCap',
  'uint256 public depositCap','bool public depositsPaused','bool public allocationsPaused',
  'function deposit(','function withdraw(','function redeem(','function allocateToStrategy(',
  'function recallFromStrategy(','function emergencyRecallFromStrategy(','function reconcileStrategyLoss(',
  'function beginOwnershipTransfer(','function acceptOwnership(','modifier nonReentrant()',
  'function _requireFullyBacked()','ILQCStrategyAdapter'
 ];
 const missing=required.filter(x=>!source.includes(x));
 if(missing.length)return fail('REUSE_CAPABILITY_GAP',missing);
 const forbidden=['contracts/futures','contracts/lending','contracts/intent-v1'];
 const violations=forbidden.filter(x=>source.includes(x));
 if(violations.length)return fail('MODULE_BOUNDARY_VIOLATION',violations);
 return {stage:'4/1',pass:true,activationAuthorized:false,reuseCandidate:'dex/contracts/vault/LQCLiquidityVault.sol',capabilities:required.length};
}
if(require.main===module){
 const p=process.argv[2]||'dex/contracts/vault/LQCLiquidityVault.sol';
 const r=audit(fs.readFileSync(p,'utf8')); console.log(JSON.stringify(r,null,2)); process.exit(r.pass?0:1);
}
module.exports={audit};
