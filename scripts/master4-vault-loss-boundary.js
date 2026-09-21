#!/usr/bin/env node
'use strict';
const fs=require('fs');
function audit(source){
 const required=[
  'MAX_CONFIGURED_LOSS_BPS = 2_000','if (newMaxLossBps > MAX_CONFIGURED_LOSS_BPS) revert InvalidLossLimit()',
  'if (!depositsPaused || !allocationsPaused) revert EmergencyModeRequired()',
  'if (emergencyMaxLossBps > BPS) revert InvalidLossLimit()',
  'if (loss * BPS > debtRepaid * lossLimitBps) revert LossLimitExceeded()',
  'strategyDebt -= debtRepaid','accountedAssets -= loss',
  'if (strategyDebt != 0) revert StrategyHasDebt()','_requireFullyBacked()'
 ];
 const missing=required.filter(x=>!source.includes(x));
 if(missing.length)return {stage:'4/7',pass:false,activationAuthorized:false,reason:'LOSS_BOUNDARY_GAP',missing};
 return {stage:'4/7',pass:true,activationAuthorized:false,normalMaxLossBps:2000,emergencyRequiresFullPause:true};
}
if(require.main===module){const s=fs.readFileSync('dex/contracts/vault/LQCLiquidityVault.sol','utf8');const r=audit(s);console.log(JSON.stringify(r,null,2));process.exit(r.pass?0:1);}
module.exports={audit};
