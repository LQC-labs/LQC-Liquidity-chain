'use strict';
const assert = require('assert');
const { evaluate } = require('../scripts/master2-flow-evidence-consistency');

const lineage = 'flow-canonical-v1';
const base = {
  implementation:{status:'PASS',lineage},
  runtimeBuild:{status:'PASS',lineage},
  historicalEvidence:{status:'PASS',lineage},
  router2FlowReceipt:{status:'PASS',lineage},
  evidenceCredit:{status:'PASS',lineage,overcredited:false}
};

assert.deepStrictEqual(evaluate(base).pass, true);
assert.strictEqual(evaluate(base).activationAuthorized, false);

for (const key of Object.keys(base)) {
  const x = JSON.parse(JSON.stringify(base));
  delete x[key];
  assert.strictEqual(evaluate(x).pass, false);
}
{
  const x = JSON.parse(JSON.stringify(base));
  x.runtimeBuild.lineage = 'other';
  assert.strictEqual(evaluate(x).pass, false);
}
{
  const x = JSON.parse(JSON.stringify(base));
  x.historicalEvidence.status = 'UNKNOWN';
  assert.strictEqual(evaluate(x).pass, false);
}
{
  const x = JSON.parse(JSON.stringify(base));
  x.evidenceCredit.overcredited = true;
  assert.strictEqual(evaluate(x).pass, false);
}
for (const flag of ['futuresStateUsed','lendingStateUsed','intentStateUsed']) {
  const x = JSON.parse(JSON.stringify(base));
  x[flag] = true;
  assert.strictEqual(evaluate(x).pass, false);
}
console.log('Master 2/11 evidence consistency tests: PASS');
