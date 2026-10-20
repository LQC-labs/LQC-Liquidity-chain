const fs=require('node:fs'),assert=require('node:assert/strict');
const {sha,validatePlanStructure,validateFileManifest}=require('./settlement-link-test-plan.cjs');
const EXPECTED='28341a16af08fb5107918c57757ef40d1c9c8032d9e0fdef127b24bebd93d47a';
function load(bytes){assert.equal(sha(bytes),EXPECTED,'FIXED_PLAN_HASH_MISMATCH');return validatePlanStructure(JSON.parse(bytes));}
module.exports={load,validateFileManifest,sha,EXPECTED};
