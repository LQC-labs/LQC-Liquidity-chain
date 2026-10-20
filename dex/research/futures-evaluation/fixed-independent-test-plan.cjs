const fs=require('node:fs'),assert=require('node:assert/strict');
const {sha,validatePlanStructure,validateFileManifest}=require('./settlement-link-test-plan.cjs');
const EXPECTED='29b5e51740090c57e9077cd8dba495326e3035c6f40255da43b3acdd60ded780';
function load(bytes){assert.equal(sha(bytes),EXPECTED,'FIXED_PLAN_HASH_MISMATCH');return validatePlanStructure(JSON.parse(bytes));}
module.exports={load,validateFileManifest,sha,EXPECTED};
