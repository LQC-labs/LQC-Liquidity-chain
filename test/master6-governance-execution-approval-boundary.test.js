import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildMaster6GovernanceExecutionApproval,GOVERNANCE_APPROVAL_PHRASE } from "../dex/scripts/build-master6-governance-execution-approval.mjs";

const proposal=JSON.parse(fs.readFileSync("dex/deployments/master6-governance-configuration-proposal-bsc-testnet-97.json","utf8"));

test("success keyword is not Governance execution approval",()=>{
  assert.throws(()=>buildMaster6GovernanceExecutionApproval({
    proposal,
    approvalPhrase:"성공",
    revalidatedAt:"2026-09-21T12:00:00.000Z"
  }),/approval phrase missing/);
});

test("exact approval phrase creates a signature-only bounded artifact",()=>{
  const out=buildMaster6GovernanceExecutionApproval({
    proposal,
    approvalPhrase:GOVERNANCE_APPROVAL_PHRASE,
    revalidatedAt:"2026-09-21T12:00:00.000Z"
  });
  assert.equal(out.status,"APPROVED_FOR_GOVERNANCE_SIGNATURE_COLLECTION_ONLY");
  assert.equal(out.actions.length,7);
  assert.equal(out.governanceThreshold,4);
  assert.equal(out.governanceOwnerCount,7);
  assert.equal(out.governanceConfigurationAuthorized,true);
  assert.equal(out.signatureCollectionAuthorized,true);
  assert.equal(out.proposalSubmissionAuthorized,false);
  assert.equal(out.executionAuthorized,false);
  assert.equal(out.activationAuthorized,false);
  assert.equal(out.transactionOccurred,false);
  assert.deepEqual(out.actions.map(x=>x.safeNonce),["3","4","5","6","7","8","9"]);
});

test("approval boundary builder contains no signing or transaction path",()=>{
  const source=fs.readFileSync("dex/scripts/build-master6-governance-execution-approval.mjs","utf8");
  assert.match(source,/verifyMaster6GovernanceProposalFreeze/);
  assert.match(source,/APPROVE_6_12_GOVERNANCE_CONFIGURATION/);
  assert.doesNotMatch(source,/eth_sendTransaction|sendTransaction\(|personal_sign|signMessage|execTransaction\(|privateKey/);
});
