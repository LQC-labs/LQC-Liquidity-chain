'use strict';
const assert=require('assert');
const fs=require('fs');
const s=fs.readFileSync('scripts/master3-router-interface-isolation-audit.js','utf8');
for(const rule of ['FUTURES_STATE','LENDING_STATE','STAKING_STATE','INTENT_CUSTODY_STATE','SETTLEMENT_FINALITY_STATE']) assert.ok(s.includes(rule));
assert.ok(s.includes('activationAuthorized:false'));
console.log('Master 3/4 Router interface isolation audit structure: PASS');
