import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";

const packet=JSON.parse(fs.readFileSync("dex/deployments/master6-governance-configuration-proposal-bsc-testnet-97.json","utf8"));
const verifier=fs.readFileSync("dex/scripts/verify-master6-governance-configuration-proposal.mjs","utf8");
const builder=fs.readFileSync("dex/scripts/prepare-master6-governance-configuration.mjs","utf8");
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const digest=value=>"sha256:"+crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

test("Master 6 frozen Governance packet is digest-bound and non-activating",()=>{
  const {proposalPacketDigest,...body}=packet;
  assert.equal(digest(body),proposalPacketDigest);
  assert.equal(packet.status,"AWAITING_EXPLICIT_GOVERNANCE_CONFIGURATION_APPROVAL");
  assert.equal(packet.network.chainId,97);
  assert.equal(packet.governanceThreshold,4);
  assert.equal(packet.governanceOwnerCount,7);
  assert.equal(packet.actions.length,7);
  assert.deepEqual(packet.actions.map(x=>x.safeNonce),["3","4","5","6","7","8","9"]);
  assert.ok(packet.actions.every(x=>x.value==="0"&&x.operation===0));
  assert.equal(packet.marketEnabled,false);
  assert.equal(packet.governanceConfigurationAuthorized,false);
  assert.equal(packet.activationAuthorized,false);
  assert.equal(packet.transactionOccurred,false);
});

test("Frozen packet preserves the seven exact SafeTxHashes",()=>{
  const hashes=packet.actions.map(x=>x.safeTxHash);
  assert.equal(new Set(hashes).size,7);
  hashes.forEach(x=>assert.match(x,/^0x[0-9a-f]{64}$/));
});

test("Freeze verifier is read-only and requires fresh 2-RPC proposal regeneration",()=>{
  assert.match(verifier,/prepareMaster6GovernanceProposalPacket/);
  assert.match(verifier,/stale-state drift detected/);
  assert.doesNotMatch(verifier,/eth_sendTransaction|sendTransaction\(|personal_sign|signMessage|privateKey/);
  assert.doesNotMatch(builder,/eth_sendTransaction|sendTransaction\(|personal_sign|signMessage|privateKey/);
});
