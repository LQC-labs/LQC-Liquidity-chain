'use strict';
const assert=require('assert');
const {audit}=require('../scripts/master4-router-vault-read-boundary');
const r=audit();
assert.strictEqual(r.pass,true); assert.strictEqual(r.activationAuthorized,false);
assert.strictEqual(r.readSurface,'ILQCVaultRead');
console.log('Master 4/6 Router/Vault read boundary: PASS');
