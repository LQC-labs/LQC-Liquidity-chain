#!/usr/bin/env node
'use strict';
const fs=require('fs');
function audit(s){
 const required=[
  'if (accountedAssets + assets > depositCap) revert DepositCapExceeded()',
  'if (newCap < accountedAssets) revert DepositCapExceeded()',
  'if (strategyDebt + assets > strategyCap) revert StrategyCapExceeded()',
  'if (newStrategyCap < strategyDebt) revert StrategyCapExceeded()',
  'if (depositsPaused) revert DepositsPaused()','if (allocationsPaused) revert AllocationsPaused()',
  'function resumeAllocations() external onlyOwner','function resumeDeposits() external onlyOwner',
  'if (isInsolvent()) revert Insolvent()','_requireFullyBacked()'
 ];
 const missing=required.filter(x=>!s.includes(x));
 if(missing.length)return {stage:'4/8',pass:false,activationAuthorized:false,reason:'CAP_PAUSE_BOUNDARY_GAP',missing};
 return {stage:'4/8',pass:true,activationAuthorized:false,depositCapFailClosed:true,strategyCapFailClosed:true,ownerOnlyResume:true};
}
if(require.main===module){const r=audit(fs.readFileSync('dex/contracts/vault/LQCLiquidityVault.sol','utf8'));console.log(JSON.stringify(r,null,2));process.exit(r.pass?0:1);}
module.exports={audit};
