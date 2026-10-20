const fs=require('node:fs'),assert=require('node:assert/strict');
const {sha,validatePlanStructure,validateFileManifest}=require('./settlement-link-test-plan.cjs');
const EXPECTED='1dfa2de9e712d0a1d6796e01262dc3150df6b21f94f128f9fcfbcb942eda1cfd';
function load(bytes){assert.equal(sha(bytes),EXPECTED,'FIXED_PLAN_HASH_MISMATCH');return validatePlanStructure(JSON.parse(bytes));}
module.exports={load,validateFileManifest,sha,EXPECTED};
