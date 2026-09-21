'use strict';
const assert=require('assert'),fs=require('fs');
const {audit}=require('../scripts/master4-vault-reuse-audit');
const src=fs.readFileSync('dex/contracts/vault/LQCLiquidityVault.sol','utf8');
const r=audit(src);
assert.strictEqual(r.pass,true); assert.strictEqual(r.activationAuthorized,false);
assert.strictEqual(audit(src.replace('uint256 public strategyDebt','uint256 strategyDebt')).pass,false);
assert.strictEqual(audit(src+' contracts/futures').pass,false);
console.log('Master 4/1 Vault reuse audit: PASS');
