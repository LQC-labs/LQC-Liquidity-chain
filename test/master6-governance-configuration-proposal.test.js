import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildMaster6GovernanceProposalPacket } from "../dex/scripts/prepare-master6-governance-configuration.mjs";

const live=JSON.parse(fs.readFileSync("dex/deployments/master6-live-execution-packet-bsc-testnet-97.json","utf8"));
const verification=JSON.parse(fs.readFileSync("dex/deployments/master6-clean-post-deployment-verification-bsc-testnet-97.json","utf8"));
const owners=[
"0x1111111111111111111111111111111111111111",
"0x2222222222222222222222222222222222222222",
"0x3333333333333333333333333333333333333333",
"0x4444444444444444444444444444444444444444",
"0x5555555555555555555555555555555555555555",
"0x6666666666666666666666666666666666666666",
"0x7777777777777777777777777777777777777777"
];
const hashes=Array.from({length:7},(_,i)=>"0x"+String(i+1).padStart(64,"0"));

test("Master 6/12 governance proposal packet binds exactly seven non-activating Safe actions",()=>{
  const p=buildMaster6GovernanceProposalPacket({
    live,verification,
    safeState:{safe:live.packet.roles.governanceSafe,owners,threshold:"4",nonce:"12"},
    safeTxHashes:hashes
  });
  assert.equal(p.status,"AWAITING_EXPLICIT_GOVERNANCE_CONFIGURATION_APPROVAL");
  assert.equal(p.governanceThreshold,4);
  assert.equal(p.governanceOwnerCount,7);
  assert.equal(p.actions.length,7);
  assert.deepEqual(p.actions.map(x=>x.safeNonce),["12","13","14","15","16","17","18"]);
  assert.ok(p.actions.every(x=>x.value==="0"&&x.operation===0));
  assert.equal(p.marketEnabled,false);
  assert.equal(p.governanceConfigurationAuthorized,false);
  assert.equal(p.activationAuthorized,false);
  assert.equal(p.transactionOccurred,false);
});

test("Master 6/12 governance proposal builder rejects changed 4/7 Safe boundary",()=>{
  assert.throws(()=>buildMaster6GovernanceProposalPacket({
    live,verification,
    safeState:{safe:live.packet.roles.governanceSafe,owners,threshold:"3",nonce:"12"},
    safeTxHashes:hashes
  }),/threshold 4\/7/);
});

test("Master 6/12 governance proposal generator remains non-signing",()=>{
  const source=fs.readFileSync("dex/scripts/prepare-master6-governance-configuration.mjs","utf8");
  assert.doesNotMatch(source,/eth_sendTransaction|sendTransaction\(|privateKey|personal_sign|signMessage/);
  assert.match(source,/verifyMaster6PostDeployment/);
  assert.match(source,/getTransactionHash/);
});
