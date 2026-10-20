const assert=require('node:assert/strict');
const {validatePlanStructure,validateFileManifest,sha}=require('./settlement-link-test-plan.cjs');
const EXPECTED_PLAN_SHA256='908773649385d4e86e7aaaf8747c2f09e9c37ba5f6d5092f456f31abaa6d66e2';
function validateSharedPlan(bytes){assert.equal(sha(bytes),EXPECTED_PLAN_SHA256,'SHARED_TEST_PLAN_HASH_MISMATCH');return validatePlanStructure(JSON.parse(bytes));}
module.exports={EXPECTED_PLAN_SHA256,validateSharedPlan,validateFileManifest,sha};
