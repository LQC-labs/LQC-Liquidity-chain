import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{validateSharedPlan,validateFileManifest,sha}=require('../shared-reconciliation-test-plan.cjs');
describe('shared reconciliation fixed plan',()=>{
 const load=()=>validateSharedPlan(fs.readFileSync(new URL('../shared-reconciliation-test-plan.json',import.meta.url)));
 it('fixed independent shared plan loads without deriving names from tests',()=>{const p=load();assert(p.suites.some(s=>s.file==='test/shared-obligation-reconciliation.test.mjs'));});
 it('changed shared plan bytes fail the reviewed hash',()=>{const b=fs.readFileSync(new URL('../shared-reconciliation-test-plan.json',import.meta.url));assert.throws(()=>validateSharedPlan(Buffer.concat([b,Buffer.from(' ')])),/SHARED_TEST_PLAN_HASH_MISMATCH/);});
 it('missing shared test file is blocked by actual required manifest',()=>{const p=load(),m=p.suites.filter(s=>s.file!=='test/shared-obligation-reconciliation.test.mjs').map(s=>({file:s.file,sha256:s.sha256}));assert.throws(()=>validateFileManifest(p,m),/EXPECTED_FILE_SET_MISMATCH/);});
 it('deleted shared test changes required source hash',()=>{const p=load(),m=p.suites.map(s=>({file:s.file,sha256:s.file==='test/shared-obligation-reconciliation.test.mjs'?'0'.repeat(64):s.sha256}));assert.throws(()=>validateFileManifest(p,m),/TEST_FILE_HASH_MISMATCH/);});
});
