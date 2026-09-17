import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { buildLendingStage0FeedManifest, LENDING_STAGE0_DEFAULTS } from "../scripts/prepare-lending-stage0-feeds.mjs";
import { preflightLendingStage0Feeds } from "../scripts/preflight-lending-stage0-feeds.mjs";
import { verifyLendingStage0Feeds } from "../scripts/verify-lending-stage0-feeds.mjs";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";

const artifact = JSON.parse(fs.readFileSync(new URL("../artifacts/contracts/lending/LQCTestnetPriceFeed.sol/LQCTestnetPriceFeed.json", import.meta.url)));
const deployer = "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB", blockHash = ethers.id("stage0-block");
function provider({ gas = 100000n, balance = ethers.parseEther("1"), nonce = 10, hash = blockHash } = {}) { return { getNetwork: async () => ({ chainId: 97n }), getBlockNumber: async () => 100, getBlock: async () => ({ hash, baseFeePerGas: 3_000_000_000n }), getTransactionCount: async () => nonce, getBalance: async () => balance, getCode: async () => "0x", estimateGas: async () => gas }; }
const feedI = new ethers.Interface(["function owner() view returns(address)", "function decimals() view returns(uint8)", "function answer() view returns(int256)", "function updatedAt() view returns(uint256)", "function roundId() view returns(uint80)"]);
async function verificationContext() {
  const manifest = await buildLendingStage0FeedManifest({ artifact }), deployments = manifest.orderedActions.map((x, i) => ({ id: x.id, asset: x.asset, role: x.role, predictedAddress: ethers.getCreateAddress({ from: deployer, nonce: 10 + i }), initialAnswer: x.initialAnswer, conservativeGas: "100000" }));
  const preflightBody = { schemaVersion: 1, recordType: "LQC_LENDING_STAGE0_MULTI_RPC_PREFLIGHT", status: "PREFLIGHT_VERIFIED_FOR_REVIEW", network: manifest.network, manifestDigest: manifest.manifestDigest, deployer, blockNumber: 99, blockHash, deployerNonce: "10", deployerBalance: ethers.parseEther("1").toString(), rpcCount: 2, deployments, totalConservativeGas: "400000", requiredGasBudget: "1440000000000000", transactionOccurred: false, safety: "Read-only preflight; no signing or transaction broadcast." };
  return { manifest, preflight: { ...preflightBody, preflightDigest: canonicalDigest(preflightBody) }, hashes: deployments.map((_, i) => ethers.id(`feed-${i}`)) };
}
function verificationProvider(context, options = {}) { return { getNetwork: async () => ({ chainId: 97n }), getBlockNumber: async () => options.weakFinality ? 101 : 110, getTransaction: async hash => { const i = context.hashes.indexOf(hash); return { to: null, from: deployer, data: options.substitute && i === 0 ? "0x1234" : context.manifest.orderedActions[i].data }; }, getTransactionReceipt: async hash => { const i = context.hashes.indexOf(hash), blockNumber = 100 + i; return { status: 1, contractAddress: context.preflight.deployments[i].predictedAddress, blockNumber, blockHash: ethers.id(`block-${blockNumber}`) }; }, getBlock: async number => ({ hash: ethers.id(`block-${number}`) }), getCode: async () => options.runtime || "0x6001600055", call: async req => { const action = context.manifest.orderedActions.find(x => context.preflight.deployments.find(d => d.id === x.id).predictedAddress.toLowerCase() === req.to.toLowerCase()), selector = req.data.slice(0, 10); if (selector === feedI.getFunction("owner").selector) return feedI.encodeFunctionResult("owner", [options.badOwner ? ethers.ZeroAddress : action.owner]); if (selector === feedI.getFunction("decimals").selector) return feedI.encodeFunctionResult("decimals", [action.decimals]); if (selector === feedI.getFunction("answer").selector) return feedI.encodeFunctionResult("answer", [BigInt(action.initialAnswer)]); if (selector === feedI.getFunction("updatedAt").selector) return feedI.encodeFunctionResult("updatedAt", [1000n]); return feedI.encodeFunctionResult("roundId", [1n]); } }; }

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
  it("verifies four canonical deployments and their exact initialized state", async function () {
    const context = await verificationContext(), result = await verifyLendingStage0Feeds({ providers: [verificationProvider(context), verificationProvider(context)], manifest: context.manifest, preflight: context.preflight, transactionHashes: context.hashes });
    assert.equal(result.status, "VERIFIED_LENDING_STAGE0_FEEDS"); assert.equal(result.deployments.length, 4); assert.equal(result.transactionOccurred, true);
  });
  it("rejects transaction substitution, wrong ownership, weak finality and RPC disagreement", async function () {
    const c = await verificationContext(), good = verificationProvider(c);
    await assert.rejects(verifyLendingStage0Feeds({ providers: [verificationProvider(c, { substitute: true }), good], manifest: c.manifest, preflight: c.preflight, transactionHashes: c.hashes }), /Invalid or weak-finality/);
    await assert.rejects(verifyLendingStage0Feeds({ providers: [verificationProvider(c, { badOwner: true }), verificationProvider(c, { badOwner: true })], manifest: c.manifest, preflight: c.preflight, transactionHashes: c.hashes }), /state mismatch/);
    await assert.rejects(verifyLendingStage0Feeds({ providers: [verificationProvider(c, { weakFinality: true }), good], manifest: c.manifest, preflight: c.preflight, transactionHashes: c.hashes }), /weak-finality/);
    await assert.rejects(verifyLendingStage0Feeds({ providers: [good, verificationProvider(c, { runtime: "0x6002600055" })], manifest: c.manifest, preflight: c.preflight, transactionHashes: c.hashes }), /RPC disagreement/);
  });
  it("contains no private key, signing, approval or transaction broadcast path", function () {
    for (const file of ["../scripts/prepare-lending-stage0-feeds.mjs", "../scripts/preflight-lending-stage0-feeds.mjs", "../scripts/verify-lending-stage0-feeds.mjs"]) { const source = fs.readFileSync(new URL(file, import.meta.url), "utf8"); assert.doesNotMatch(source, /PRIVATE_KEY|signTransaction|eth_sendTransaction|requestAccounts/); }
  });
});
