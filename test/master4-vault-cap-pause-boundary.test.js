'use strict';
const assert=require('assert'),fs=require('fs');
const {audit}=require('../scripts/master4-vault-cap-pause-boundary');
const s=fs.readFileSync('dex/contracts/vault/LQCLiquidityVault.sol','utf8');
const r=audit(s);
assert.strictEqual(r.pass,true); assert.strictEqual(r.activationAuthorized,false);
assert.strictEqual(audit(s.replace('if (newCap < accountedAssets) revert DepositCapExceeded()','')).pass,false);
assert.strictEqual(audit(s.replace('function resumeDeposits() external onlyOwner','function resumeDeposits() external')).pass,false);
console.log('Master 4/8 Vault capacity/pause boundary: PASS');
