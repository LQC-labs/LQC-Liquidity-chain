'use strict';
const assert=require('assert'),fs=require('fs');
const {audit}=require('../scripts/master4-vault-loss-boundary');
const s=fs.readFileSync('dex/contracts/vault/LQCLiquidityVault.sol','utf8');
const r=audit(s);
assert.strictEqual(r.pass,true); assert.strictEqual(r.activationAuthorized,false);
assert.strictEqual(r.normalMaxLossBps,2000); assert.strictEqual(r.emergencyRequiresFullPause,true);
assert.strictEqual(audit(s.replaceAll('accountedAssets -= loss','accountedAssets += loss')).pass,false);
console.log('Master 4/7 Vault strategy loss boundary: PASS');
