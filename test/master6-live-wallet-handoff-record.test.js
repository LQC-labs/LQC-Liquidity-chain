import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { canonicalDigest } from "../dex/scripts/build-intent-reproducibility-seal.mjs";

const PATH="dex/deployments/master6-live-execution-packet-bsc-testnet-97.json";
const DEPLOYER="0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB";
const SOURCE_COMMIT="0x87745b4bfb3ad49e73c14a8f62282986e72148bc";
const RECORDED_DIGEST="sha256:dc538396aff204b65e19430033d5d11520c17b10239f49876d1364559fc3d84f";
const RECORDED_AT="2026-09-21T08:47:10.679Z";

test("Master 6/12 recorded live wallet handoff packet remains exact and non-activating",()=>{
  const packet=JSON.parse(fs.readFileSync(PATH,"utf8"));
  const {executionPacketDigest,...body}=packet;

  assert.equal(packet.recordType,"LQC_MASTER6_LIVE_EXECUTION_PACKET");
  assert.equal(packet.status,"APPROVED_FOR_WALLET_CONFIRMATION");
  assert.equal(packet.network?.chainId,97);
  assert.equal(packet.deployer.toLowerCase(),DEPLOYER.toLowerCase());
  assert.equal(packet.sourceCommit,SOURCE_COMMIT);
  assert.equal(packet.generatedAt,RECORDED_AT);
  assert.equal(packet.executionPacketDigest,RECORDED_DIGEST);
  assert.equal(packet.packet?.startingNonce,"17");
  assert.equal(packet.packet?.deployments?.length,10);
  assert.deepEqual(packet.packet.deployments.map(x=>x.deployerNonce),["17","18","19","20","21","22","23","24","25","26"]);
  assert.equal(packet.executionAuthorized,true);
  assert.equal(packet.activationAuthorized,false);
  assert.equal(packet.transactionOccurred,false);
  assert.equal(packet.packet?.market?.enabled,false);
  assert.equal(canonicalDigest(body),executionPacketDigest);
});

test("Master 6/12 recorded handoff preserves exact deployment address order",()=>{
  const packet=JSON.parse(fs.readFileSync(PATH,"utf8"));
  const addresses=packet.packet.deployments.map(x=>x.predictedAddress.toLowerCase());
  assert.equal(new Set(addresses).size,10);
  assert.equal(addresses[0],"0x00875a32e6e5f2d63c865a4555801be9307095b6");
  assert.equal(addresses[8],"0xfc6c31cb14332592562396fef995c03c9f1e173c");
  assert.equal(addresses[9],"0xc14330bba0a2576c71b8fdd5e6c811b0c3320ec1");
});
