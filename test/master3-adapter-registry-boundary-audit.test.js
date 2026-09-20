'use strict';
const assert=require('assert'),fs=require('fs');
const s=fs.readFileSync('scripts/master3-adapter-registry-boundary-audit.js','utf8');
for(const x of ['VENUE_SPECIFIC_CORE_COUPLING','HARDCODED_VENUE_ENDPOINT','REGISTRY_NOT_CONSULTED','ADAPTER_DRIFT_NOT_BOUND','DISABLED_ADAPTER_NOT_REJECTED','activationAuthorized:false']) assert.ok(s.includes(x));
console.log('Master 3/5 adapter registry boundary audit structure: PASS');
