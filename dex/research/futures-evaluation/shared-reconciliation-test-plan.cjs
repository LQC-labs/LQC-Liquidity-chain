const assert=require('node:assert/strict');
const {validatePlanStructure,validateFileManifest,sha}=require('./settlement-link-test-plan.cjs');
const EXPECTED_PLAN_SHA256='f73c0c8180fcd6bbc64f001da917123037d7687598c870b957b866eef8c84ee5';
function validateSharedPlan(bytes){assert.equal(sha(bytes),EXPECTED_PLAN_SHA256,'SHARED_TEST_PLAN_HASH_MISMATCH');return validatePlanStructure(JSON.parse(bytes));}
module.exports={EXPECTED_PLAN_SHA256,validateSharedPlan,validateFileManifest,sha};
