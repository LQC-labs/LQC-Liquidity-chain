const assert=require('node:assert/strict');
module.exports=function validateReport(x,exitCode,plan){
 assert(plan&&Array.isArray(plan.fullTitles)&&plan.fullTitles.length>0,'EMPTY_EXPECTED_TEST_PLAN');
 const expected=[...plan.fullTitles].sort();assert.equal(new Set(expected).size,expected.length,'DUPLICATE_EXPECTED_TITLE');
 assert(x&&x.stats&&Number.isInteger(x.stats.tests)&&x.stats.tests>0,'ZERO_OR_INVALID_TEST_COUNT');
 for(const k of ['passes','failures','pending'])assert(Number.isInteger(x.stats[k])&&x.stats[k]>=0,'INVALID_STATS');
 for(const k of ['tests','passes','failures','pending']){assert(Array.isArray(x[k]),'INVALID_REPORT_ARRAY');assert.equal(x.stats[k],x[k].length,'STATS_ARRAY_MISMATCH');}
 const titles=x.tests.map(t=>t.fullTitle);assert.equal(new Set(titles).size,titles.length,'DUPLICATE_EXECUTED_TITLE');assert.deepEqual([...titles].sort(),expected,'EXPECTED_TEST_SET_MISMATCH');
 const partition=[...x.passes,...x.failures,...x.pending].map(t=>t.fullTitle);assert.equal(new Set(partition).size,partition.length,'DUPLICATE_RESULT_TITLE');assert.deepEqual([...partition].sort(),expected,'RESULT_PARTITION_MISMATCH');
 assert.equal(x.stats.tests,x.stats.passes+x.stats.failures+x.stats.pending,'RESULT_TOTAL_MISMATCH');
 assert.equal(exitCode,x.stats.failures?Math.min(x.stats.failures,255):0,'EXIT_CODE_MISMATCH');
 return {aggregation:'PASS',status:x.stats.failures?'FAIL':x.stats.pending?'PENDING':'PASS',executedTitles:titles,counts:{tests:x.stats.tests,passes:x.stats.passes,failures:x.stats.failures,pending:x.stats.pending}};
};