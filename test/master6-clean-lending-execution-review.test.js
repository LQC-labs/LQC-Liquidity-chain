import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildMaster6CleanDeploymentPacket } from "../dex/scripts/prepare-master6-clean-lending-deployment.mjs";
import { preflightMaster6CleanLending } from "../dex/scripts/preflight-master6-clean-lending.mjs";
import { buildMaster6CleanExecutionReview } from "../dex/scripts/build-master6-clean-execution-review.mjs";

class FakeProvider{
  constructor(){this.nonce=200;this.balance=10n**18n;this.gasPrice=100000000n;this.gas=1000000n}
  async getNetwork(){return{chainId:97n}}
  async getTransactionCount(){return this.nonce}
  async getBalance(){return this.balance}
  async getFeeData(){return{gasPrice:this.gasPrice,maxFeePerGas:null}}
  async getCode(){return"0x"}
  async estimateGas(){return this.gas}
}

test("Master 6/12 execution review binds exact CREATEs to successful preflight and keeps market disabled",async()=>{
  const cfg=JSON.parse(fs.readFileSync("dex/deployments/lending-stage0-finalized-config-bsc-testnet-97.json","utf8")).config;
  const stage0=JSON.parse(fs.readFileSync("dex/deployments/lending-stage0-completion-bsc-testnet-97.json","utf8"));
  const packet=await buildMaster6CleanDeploymentPacket({
    config:cfg,
    stage0Completion:stage0,
    deployer:"0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB",
    startingNonce:"200",
    sourceCommit:"0xdcf41efe8c37adab6329fe3cee0da1d94f1fe463"
  });
  const preflight=await preflightMaster6CleanLending({providers:[new FakeProvider(),new FakeProvider()],packet});
  const review=buildMaster6CleanExecutionReview({packet,preflight});
  assert.equal(review.status,"AWAITING_EXPLICIT_EXECUTION_APPROVAL");
  assert.equal(review.network.chainId,97);
  assert.equal(review.deployments.length,10);
  assert.equal(review.governanceActions.length,7);
  assert.equal(review.marketEnabled,false);
  assert.equal(review.activationAuthorized,false);
  assert.equal(review.transactionOccurred,false);
  assert.deepEqual(review.deployments.map(x=>x.nonce),["200","201","202","203","204","205","206","207","208","209"]);
  assert.ok(review.deployments.every(x=>BigInt(x.approvedGasLimit)>0n));
});
