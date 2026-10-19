const assert=require('node:assert/strict'),crypto=require('node:crypto');
const EXPECTED_PLAN_SHA256='505ab72a96ec16628bccd3de68a8fa6474d8e32a088007f4ea39ba15d3002d8a';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function validatePlanStructure(plan){
 assert(plan&&Array.isArray(plan.suites)&&plan.suites.length>0,'EMPTY_SUITE_PLAN');
 const files=new Set(),titles=new Set();for(const s of plan.suites){assert(typeof s.file==='string'&&/^test\/[a-z0-9-]+\.test\.mjs$/.test(s.file),'INVALID_TEST_PATH');assert(!files.has(s.file),'DUPLICATE_SUITE_FILE');files.add(s.file);assert(/^[0-9a-f]{64}$/.test(s.sha256),'INVALID_FILE_HASH');assert(Array.isArray(s.fullTitles)&&s.fullTitles.length>0,'EMPTY_EXPECTED_TEST_PLAN');for(const t of s.fullTitles){assert(typeof t==='string'&&t.length>0,'INVALID_TEST_TITLE');assert(!titles.has(t),'DUPLICATE_EXPECTED_TITLE');titles.add(t);}}return plan;
}
function validatePlanBytes(bytes){assert.equal(sha(bytes),EXPECTED_PLAN_SHA256,'TEST_PLAN_HASH_MISMATCH');return validatePlanStructure(JSON.parse(bytes));}
function validateFileManifest(plan,observed){
 validatePlanStructure(plan);assert(Array.isArray(observed),'FILE_MANIFEST_REQUIRED');assert.equal(new Set(observed.map(x=>x.file)).size,observed.length,'DUPLICATE_OBSERVED_TEST_FILE');assert.deepEqual(observed.map(x=>x.file).sort(),plan.suites.map(x=>x.file).sort(),'EXPECTED_FILE_SET_MISMATCH');for(const s of plan.suites)assert.equal(observed.find(x=>x.file===s.file).sha256,s.sha256,'TEST_FILE_HASH_MISMATCH');return true;
}
module.exports={EXPECTED_PLAN_SHA256,validatePlanBytes,validatePlanStructure,validateFileManifest,sha};
