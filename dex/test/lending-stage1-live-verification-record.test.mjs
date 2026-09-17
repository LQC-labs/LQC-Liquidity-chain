import assert from "node:assert/strict";
import fs from "node:fs";
import { canonicalDigest,sha256 } from "../scripts/build-intent-reproducibility-seal.mjs";
import { buildLendingStage2Manifest } from "../scripts/prepare-lending-stage2-manifest.mjs";

const read=relative=>JSON.parse(fs.readFileSync(new URL(relative,import.meta.url),"utf8"));
const verification=read("../deployments/lending-stage1-verification-bsc-testnet-97.json");
const stage2=read("../deployments/lending-stage2-manifest-bsc-testnet-97.json");
const configDocument=read("../deployments/lending-stage0-finalized-config-bsc-testnet-97.json");
const artifact=(name,source)=>read(`../artifacts/contracts/${source}.sol/${name}.json`);

describe("LQC Lending Stage-1 live verification record",function(){
  it("binds the two approved transactions to their canonical blocks and predicted addresses",function(){
    assert.equal(verification.status,"VERIFIED_LENDING_STAGE1_DEPLOYMENT");
    assert.equal(verification.transactionOccurred,true);
    assert.equal(verification.rpcCount,2);
    assert.equal(verification.startingNonce,"105");
    assert.deepEqual(verification.deployments.map(item=>item.transactionHash),[
      "0xc50d25e8b6caa2f287b81b6aa8900b8f0f3b63a012476641aff3a05a34bb1a7d",
      "0xef11d8b21aab8cc272067fdb8fdb58c6af517edfe65969b8895ad10af32b471c"
    ]);
    assert.deepEqual(verification.deployments.map(item=>item.blockNumber),[131539143,131539268]);
    assert.deepEqual(verification.deployments.map(item=>item.contractAddress),[
      "0xcCf1B865d763Ed77558F4c8758B3926b5417DF6b",
      "0xd7abc17e2EA4953C6dA495010fc1022C4d34F3f2"
    ]);
    assert.ok(verification.deployments.every(item=>item.confirmations>=verification.minConfirmations));
  });

  it("matches the compiled Stage-1 runtime bytecode and its canonical record digest",function(){
    const runtimes=[artifact("LQCOracleManager","lending/LQCOracleManager").deployedBytecode,artifact("LQCInterestRateModel","lending/LQCInterestRateModel").deployedBytecode];
    assert.deepEqual(verification.deployments.map(item=>item.runtimeCodeDigest),runtimes.map(sha256));
    const{verificationDigest,...body}=verification;
    assert.equal(canonicalDigest(body),verificationDigest);
  });

  it("reproduces the unsigned Stage-2 manifest only from the verified Stage-1 record",async function(){
    const rebuilt=await buildLendingStage2Manifest({config:configDocument.config,stage1Verification:verification});
    assert.deepEqual(rebuilt,stage2);
    assert.equal(stage2.status,"REVIEW_REQUIRED");
    assert.equal(stage2.transactionOccurred,false);
    assert.deepEqual(stage2.orderedActions.map(item=>item.contract),["LQCLendingMarketRegistry","LQCLendingInterestIndex"]);
  });
});
