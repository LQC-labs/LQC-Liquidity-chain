import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { generateMaster6LiveExecutionPacket } from "../dex/scripts/generate-master6-live-execution-packet.mjs";

const APPROVED_DEPLOYER="0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
const PINNED_SOURCE_COMMIT="0x87745b4bfb3ad49e73c14a8f62282986e72148bc";

test("Master 6 live execution packet rejects missing or invalid deployer before any RPC use",async()=>{
  await assert.rejects(
    generateMaster6LiveExecutionPacket({
      deployer:"",
      sourceCommit:PINNED_SOURCE_COMMIT,
      approvalPhrase:"APPROVE_6_12_TESTNET_DEPLOYMENT",
      providers:[{},{}]
    }),
    /MASTER6_DEPLOYER/
  );
  await assert.rejects(
    generateMaster6LiveExecutionPacket({
      deployer:"0x0000000000000000000000000000000000000000",
      sourceCommit:PINNED_SOURCE_COMMIT,
      approvalPhrase:"APPROVE_6_12_TESTNET_DEPLOYMENT",
      providers:[{},{}]
    }),
    /MASTER6_DEPLOYER/
  );
});

test("Master 6 live execution packet rejects a deployer that is not the verified Futures testnet deployer",async()=>{
  await assert.rejects(
    generateMaster6LiveExecutionPacket({
      deployer:"0x1111111111111111111111111111111111111111",
      sourceCommit:PINNED_SOURCE_COMMIT,
      approvalPhrase:"APPROVE_6_12_TESTNET_DEPLOYMENT",
      providers:[{},{}]
    }),
    /verified Futures BSC Testnet deployer/
  );
});

test("Master 6 live execution packet requires the exact execution approval phrase",async()=>{
  await assert.rejects(
    generateMaster6LiveExecutionPacket({
      deployer:APPROVED_DEPLOYER,
      sourceCommit:PINNED_SOURCE_COMMIT,
      approvalPhrase:"success",
      providers:[{},{}]
    }),
    /approval phrase/
  );
});

test("Recorded 6/12 wallet handoff packet is pinned, non-activating, and nonce-complete",()=>{
  const packet=JSON.parse(fs.readFileSync("dex/deployments/master6-live-execution-packet-bsc-testnet-97.json","utf8"));
  assert.equal(packet.recordType,"LQC_MASTER6_LIVE_EXECUTION_PACKET");
  assert.equal(packet.status,"APPROVED_FOR_WALLET_CONFIRMATION");
  assert.equal(packet.network.chainId,97);
  assert.equal(packet.sourceCommit,PINNED_SOURCE_COMMIT);
  assert.equal(packet.deployer.toLowerCase(),APPROVED_DEPLOYER.toLowerCase());
  assert.equal(packet.executionAuthorized,true);
  assert.equal(packet.activationAuthorized,false);
  assert.equal(packet.transactionOccurred,false);
  assert.equal(packet.packet.startingNonce,"17");
  assert.equal(packet.preflight.status,"PREFLIGHT_VERIFIED_FOR_REVIEW");
  assert.equal(packet.preflight.deployerNonce,"17");
  assert.equal(packet.packet.deployments.length,10);
  assert.deepEqual(packet.packet.deployments.map(x=>x.deployerNonce),["17","18","19","20","21","22","23","24","25","26"]);
  assert.equal(packet.packet.market.enabled,false);
  assert.equal(packet.executionPacketDigest,"sha256:40221d17d3ac18a237e19bd2d862ed76c6bc8b7f65853956f19ce9b852f3fb33");
});
