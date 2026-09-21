import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync("dex/scripts/build-master6-governance-execution-approval.mjs","utf8");

test("Master 6 Governance approval materializer remains signature-only and non-executing",()=>{
  assert.match(source,/APPROVE_6_12_GOVERNANCE_CONFIGURATION/);
  assert.match(source,/signatureCollectionAuthorized:true/);
  assert.match(source,/proposalSubmissionAuthorized:false/);
  assert.match(source,/executionAuthorized:false/);
  assert.match(source,/activationAuthorized:false/);
  assert.doesNotMatch(source,/eth_sendTransaction|sendTransaction\(|personal_sign|signMessage|execTransaction\(|privateKey/);
  assert.match(source,/MASTER6_GOVERNANCE_APPROVAL_OUTPUT_FILE/);
});
