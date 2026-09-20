#!/usr/bin/env node
'use strict';

const fs = require('fs');

function fail(reason, details = {}) {
  return { stage: '2/11', pass: false, activationAuthorized: false, reason, ...details };
}

function evaluate(input) {
  if (!input || typeof input !== 'object') return fail('INVALID_INPUT');
  const required = ['implementation','runtimeBuild','historicalEvidence','router2FlowReceipt','evidenceCredit'];
  const missing = required.filter((k) => !input[k]);
  if (missing.length) return fail('MISSING_EVIDENCE', { missing });

  const lineage = input.implementation.lineage;
  if (!lineage) return fail('MISSING_CANONICAL_LINEAGE');

  const mismatches = [];
  for (const k of required) {
    const item = input[k];
    if (item.status !== 'PASS') mismatches.push({ item: k, reason: 'ITEM_NOT_PASS' });
    if (item.lineage !== lineage) mismatches.push({ item: k, reason: 'LINEAGE_MISMATCH' });
  }

  if (input.evidenceCredit.overcredited === true) {
    mismatches.push({ item: 'evidenceCredit', reason: 'OVERCREDITED_EVIDENCE' });
  }
  if (input.futuresStateUsed === true || input.lendingStateUsed === true || input.intentStateUsed === true) {
    mismatches.push({ item: 'isolation', reason: 'NON_FLOW_STATE_USED' });
  }

  if (mismatches.length) return fail('CONSISTENCY_FAILURE', { lineage, mismatches });
  return {
    stage: '2/11',
    pass: true,
    activationAuthorized: false,
    lineage,
    evidence: required.reduce((o,k) => (o[k] = 'PASS', o), {})
  };
}

if (require.main === module) {
  const path = process.argv[2];
  if (!path) {
    console.error(JSON.stringify(fail('INPUT_FILE_REQUIRED')));
    process.exit(2);
  }
  const result = evaluate(JSON.parse(fs.readFileSync(path, 'utf8')));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.pass ? 0 : 1);
}

module.exports = { evaluate };
