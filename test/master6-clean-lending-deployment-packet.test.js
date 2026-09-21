import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildMaster6CleanDeploymentPacket } from "../dex/scripts/prepare-master6-clean-lending-deployment.mjs";

test("Master 6/12 builds a deterministic clean-stack packet with market disabled",async()=>{
  const cfg=JSON.parse(fs.readFileSync("dex/deployments/lending-stage0-finalized-config-bsc-testnet-97.json","utf8")).config;
  const stage0=JSON.parse(fs.readFileSync("dex/deployments/lending-stage0-completion-bsc-testnet-97.json","utf8"));
  const packet=await buildMaster6CleanDeploymentPacket({
    config:cfg,
    stage0Completion:stage0,
    deployer:"0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB",
    startingNonce:"200",
    sourceCommit:"0x3a41eccd9ffa700443831a9483f4fe91e2f87d18"
  });
  assert.equal(packet.network.chainId,97);
  assert.equal(packet.status,"REVIEW_REQUIRED");
  assert.equal(packet.activationAuthorized,false);
  assert.equal(packet.transactionOccurred,false);
  assert.equal(packet.deployments.length,10);
  assert.equal(packet.configurationActions.length,7);
  assert.equal(packet.market.enabled,false);
  assert.equal(new Set(packet.deployments.map(x=>x.predictedAddress.toLowerCase())).size,10);
  assert.deepEqual(packet.deployments.map(x=>x.deployerNonce),["200","201","202","203","204","205","206","207","208","209"]);
  assert.ok(packet.configurationActions.some(x=>x.action==="configure-market-disabled"));
  assert.ok(packet.configurationActions.some(x=>x.action==="bind-liquidation-engine"));
});
