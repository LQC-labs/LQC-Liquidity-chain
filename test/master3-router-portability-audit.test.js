'use strict';
const assert=require('assert');
const fs=require('fs');
const p='scripts/master3-router-portability-audit.js';
assert.ok(fs.existsSync(p));
const s=fs.readFileSync(p,'utf8');
for(const token of ['BSC_CHAIN_ID_LITERAL','RPC_URL','PANCAKE_CORE_NAME','KNOWN_BSC_ADDRESS','activationAuthorized:false']) assert.ok(s.includes(token));
console.log('Master 3/2 portability audit structure: PASS');
