import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildMaster6CleanDeploymentPacket } from "../dex/scripts/prepare-master6-clean-lending-deployment.mjs";
import { preflightMaster6CleanLending } from "../dex/scripts/preflight-master6-clean-lending.mjs";

class FakeProvider{
  constructor({chainId=97,nonce=200,balance=10n**18n,gasPrice=100000000n,gas=1000000n,occupied=new Set()}={}){
    this.chainId=chainId;this.nonce=nonce;this.balance=balance;this.gasPrice=gasPrice;this.gas=gas;this.occupied=occupied;
  }
  async getNetwork(){return{chainId:BigInt(this.chainId)}}
  async getTransactionCount(){return this.nonce}
  async getBalance(){return this.balance}
  async getFeeData(){return{gasPrice:this.gasPrice,maxFeePerGas:null}}
  async getCode(address){return this.occupied.has(address.toLowerCase())?"0x6000":"0x"}
  async estimateGas(){return this.gas}
}

async function packet(){
  const cfg=JSON.parse(fs.readFileSync("dex/deployments/lending-stage0-finalized-config-bsc-testnet-97.json","utf8")).config;
  const stage0=JSON.parse(fs.readFileSync("dex/deployments/lending-stage0-completion-bsc-testnet-97.json","utf8"));
  return buildMaster6CleanDeploymentPacket({
    config:cfg,
    stage0Completion:stage0,
    deployer:"0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB",
    startingNonce:"200",
    sourceCommit:"0x5fd1af149c3bb5d7cb8568bcda281cab9a6a6a20"
  });
}

test("Master 6/12 clean preflight requires two agreeing chain-97 providers and stays non-activating",async()=>{
  const p=await packet();
  const result=await preflightMaster6CleanLending({providers:[new FakeProvider(),new FakeProvider()],packet:p});
  assert.equal(result.status,"PREFLIGHT_VERIFIED_FOR_REVIEW");
  assert.equal(result.network.chainId,97);
  assert.equal(result.rpcCount,2);
  assert.equal(result.deployments.length,10);
  assert.equal(result.activationAuthorized,false);
  assert.equal(result.transactionOccurred,false);
  assert.ok(BigInt(result.totalGasBudgetWei)>0n);
});

test("Master 6/12 clean preflight fails on nonce drift, wrong chain, occupied address and low balance",async()=>{
  const p=await packet();
  await assert.rejects(preflightMaster6CleanLending({providers:[new FakeProvider({nonce:201}),new FakeProvider({nonce:201})],packet:p}),/nonce drift/);
  await assert.rejects(preflightMaster6CleanLending({providers:[new FakeProvider({chainId:56}),new FakeProvider({chainId:56})],packet:p}),/chain mismatch/);
  const occupied=new Set([p.deployments[0].predictedAddress.toLowerCase()]);
  await assert.rejects(preflightMaster6CleanLending({providers:[new FakeProvider({occupied}),new FakeProvider({occupied})],packet:p}),/already occupied/);
  await assert.rejects(preflightMaster6CleanLending({providers:[new FakeProvider({balance:1n}),new FakeProvider({balance:1n})],packet:p}),/insufficient testnet gas balance/);
});
