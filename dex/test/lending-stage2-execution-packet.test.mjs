import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { prepareLendingStage2ExecutionPacket } from "../scripts/prepare-lending-stage2-execution-packet.mjs";

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
const manifest = read("../deployments/lending-stage2-manifest-bsc-testnet-97.json");
const preflight = read("../deployments/lending-stage2-live-preflight-bsc-testnet-97.json");
const review = read("../deployments/lending-stage2-deployment-review-bsc-testnet-97.json");

describe("LQC Lending Stage-2 execution packet", function () {
  it("requires the exact explicit approved Review digest", function () {
    for (const approvedReviewDigest of [undefined, ethers.id("wrong")]) assert.throws(() => prepareLendingStage2ExecutionPacket({ manifest, preflight, review, approvedReviewDigest }), /explicit/);
  });
  it("pins two ordered zero-value CREATE transactions and bindings", function () {
    const packet = prepareLendingStage2ExecutionPacket({ manifest, preflight, review, approvedReviewDigest: review.reviewDigest });
    assert.deepEqual(packet.transactions.map(x => x.nonce), ["107", "108"]);
    assert.deepEqual(packet.transactions.map(x => x.gasLimit), ["1205631", "781857"]);
    assert.ok(packet.transactions.every(x => x.to === null && x.value === "0"));
    assert.equal(packet.transactions[0].expectedBindings.oracle, manifest.dependencies.oracleManager);
    assert.equal(packet.transactions[1].expectedBindings.rateModel, manifest.dependencies.interestRateModel);
    assert.equal(packet.maximumGasBudgetWei, "198748800000000");
    assert.equal(packet.transactionOccurred, false);
  });
  it("rejects modified review evidence", function () {
    const changed = structuredClone(review); changed.deployments[0].nonce = "999";
    assert.throws(() => prepareLendingStage2ExecutionPacket({ manifest, preflight, review: changed, approvedReviewDigest: review.reviewDigest }), /invalid explicit/);
  });
  it("offline packet builder has no wallet, signing or broadcast path", function () {
    const source = fs.readFileSync(new URL("../scripts/prepare-lending-stage2-execution-packet.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(source, /PRIVATE_KEY|window\.ethereum|signTransaction|eth_sendTransaction/);
  });
});
