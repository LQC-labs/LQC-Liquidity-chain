import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { buildLendingStage0FeedManifest, LENDING_STAGE0_DEFAULTS } from "../scripts/prepare-lending-stage0-feeds.mjs";
import { preflightLendingStage0Feeds } from "../scripts/preflight-lending-stage0-feeds.mjs";

const artifact = JSON.parse(fs.readFileSync(new URL("../artifacts/contracts/lending/LQCTestnetPriceFeed.sol/LQCTestnetPriceFeed.json", import.meta.url)));
const deployer = "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB", blockHash = ethers.id("stage0-block");
function provider({ gas = 100000n, balance = ethers.parseEther("1"), nonce = 10, hash = blockHash } = {}) { return { getNetwork: async () => ({ chainId: 97n }), getBlockNumber: async () => 100, getBlock: async () => ({ hash, baseFeePerGas: 3_000_000_000n }), getTransactionCount: async () => nonce, getBalance: async () => balance, getCode: async () => "0x", estimateGas: async () => gas }; }

describe("Lending Stage-0 four-feed preparation", function () {
  it("pins tLQC collateral, WBNB debt and four distinct feed deployments", async function () {
    const manifest = await buildLendingStage0FeedManifest({ artifact });
    assert.equal(manifest.market.collateralAsset, ethers.getAddress(LENDING_STAGE0_DEFAULTS.collateralAsset));
    assert.equal(manifest.market.debtAsset, ethers.getAddress(LENDING_STAGE0_DEFAULTS.debtAsset));
    assert.equal(manifest.orderedActions.length, 4);
    assert.deepEqual(manifest.orderedActions.map(x => `${x.asset}-${x.role}`), ["tLQC-primary", "tLQC-secondary", "WBNB-primary", "WBNB-secondary"]);
    assert.equal(new Set(manifest.orderedActions.map(x => x.initCodeDigest)).size, 4);
  });
  it("requires two agreeing chain-97 RPCs and calculates four CREATE addresses", async function () {
    const manifest = await buildLendingStage0FeedManifest({ artifact }), result = await preflightLendingStage0Feeds({ providers: [provider(), provider()], manifest, deployer });
    assert.equal(result.rpcCount, 2); assert.equal(result.deployments.length, 4); assert.equal(new Set(result.deployments.map(x => x.predictedAddress)).size, 4); assert.equal(result.transactionOccurred, false);
  });
  it("fails closed on RPC disagreement and insufficient gas balance", async function () {
    const manifest = await buildLendingStage0FeedManifest({ artifact });
    await assert.rejects(preflightLendingStage0Feeds({ providers: [provider(), provider({ nonce: 11 })], manifest, deployer }), /disagreement/);
    await assert.rejects(preflightLendingStage0Feeds({ providers: [provider({ balance: 1n }), provider({ balance: 1n })], manifest, deployer }), /Insufficient/);
  });
  it("contains no private key, signing, approval or transaction broadcast path", function () {
    for (const file of ["../scripts/prepare-lending-stage0-feeds.mjs", "../scripts/preflight-lending-stage0-feeds.mjs", "../scripts/verify-lending-stage0-feeds.mjs"]) { const source = fs.readFileSync(new URL(file, import.meta.url), "utf8"); assert.doesNotMatch(source, /PRIVATE_KEY|signTransaction|eth_sendTransaction|requestAccounts/); }
  });
});
