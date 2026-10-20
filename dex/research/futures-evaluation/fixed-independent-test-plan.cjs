const fs=require('node:fs'),assert=require('node:assert/strict');
const {sha,validatePlanStructure,validateFileManifest}=require('./settlement-link-test-plan.cjs');
const EXPECTED='02895ba3d8d6394315245534b76843eeaa7bf9a76183d259d7ab8c634ce566a2';
function load(bytes){assert.equal(sha(bytes),EXPECTED,'FIXED_PLAN_HASH_MISMATCH');return validatePlanStructure(JSON.parse(bytes));}
module.exports={load,validateFileManifest,sha,EXPECTED};
