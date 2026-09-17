import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { buildLendingStage0FeedManifest, LENDING_STAGE0_DEFAULTS } from "../scripts/prepare-lending-stage0-feeds.mjs";
import { preflightLendingStage0Feeds } from "../scripts/preflight-lending-stage0-feeds.mjs";
import { verifyLendingStage0Feeds } from "../scripts/verify-lending-stage0-feeds.mjs";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { finalizeLendingStage0Config } from "../scripts/finalize-lending-stage0-config.mjs";
import { buildLendingStage0DeploymentReview } from "../scripts/build-lending-stage0-deployment-review.mjs";
import { prepareLendingStage0ExecutionPacket } from "../scripts/prepare-lending-stage0-execution-packet.mjs";
import { preflightLendingStage0Signing } from "../scripts/preflight-lending-stage0-signing.mjs";
import { buildLendingStage0Completion } from "../scripts/build-lending-stage0-completion.mjs";

const artifact = JSON.parse(fs.readFileSync(new URL("../artifacts/contracts/lending/LQCTestnetPriceFeed.sol/LQCTestnetPriceFeed.json", import.meta.url)));
const deployer = "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB", blockHash = ethers.id("stage0-block");
function provider({ gas = 100000n, balance = ethers.parseEther("1"), nonce = 10, hash = blockHash, baseFeePerGas = 3_000_000_000n, gasPrice = 3_000_000_000n } = {}) { return { getNetwork: async () => ({ chainId: 97n }), getBlockNumber: async () => 100, getBlock: async () => ({ hash, baseFeePerGas }), getFeeData: async () => ({ gasPrice }), getTransactionCount: async () => nonce, getBalance: async () => balance, getCode: async () => "0x", estimateGas: async () => gas }; }
const feedI = new ethers.Interface(["function owner() view returns(address)", "function decimals() view returns(uint8)", "function answer() view returns(int256)", "function updatedAt() view returns(uint256)", "function roundId() view returns(uint80)"]);
async function verificationContext() {
  const manifest = await buildLendingStage0FeedManifest({ artifact }), deployments = manifest.orderedActions.map((x, i) => ({ id: x.id, asset: x.asset, role: x.role, predictedAddress: ethers.getCreateAddress({ from: deployer, nonce: 10 + i }), initialAnswer: x.initialAnswer, conservativeGas: "100000" }));
  const preflightBody = { schemaVersion: 1, recordType: "LQC_LENDING_STAGE0_MULTI_RPC_PREFLIGHT", status: "PREFLIGHT_VERIFIED_FOR_REVIEW", network: manifest.network, manifestDigest: manifest.manifestDigest, deployer, blockNumber: 99, blockHash, deployerNonce: "10", deployerBalance: ethers.parseEther("1").toString(), rpcCount: 2, conservativeGasPrice: "3000000000", deployments, totalConservativeGas: "400000", requiredGasBudget: "1440000000000000", transactionOccurred: false, safety: "Read-only preflight; no signing or transaction broadcast." };
  return { manifest, preflight: { ...preflightBody, preflightDigest: canonicalDigest(preflightBody) }, hashes: deployments.map((_, i) => ethers.id(`feed-${i}`)) };
}
function verificationProvider(context, options = {}) { return { getNetwork: async () => ({ chainId: 97n }), getBlockNumber: async () => options.weakFinality ? 101 : 110, getTransaction: async hash => { const i = context.hashes.indexOf(hash); return { to: null, from: deployer, data: options.substitute && i === 0 ? "0x1234" : context.manifest.orderedActions[i].data }; }, getTransactionReceipt: async hash => { const i = context.hashes.indexOf(hash), blockNumber = 100 + i; return { status: 1, contractAddress: context.preflight.deployments[i].predictedAddress, blockNumber, blockHash: ethers.id(`block-${blockNumber}`) }; }, getBlock: async number => ({ hash: ethers.id(`block-${number}`) }), getCode: async () => options.runtime || "0x6001600055", call: async req => { const action = context.manifest.orderedActions.find(x => context.preflight.deployments.find(d => d.id === x.id).predictedAddress.toLowerCase() === req.to.toLowerCase()), selector = req.data.slice(0, 10); if (selector === feedI.getFunction("owner").selector) return feedI.encodeFunctionResult("owner", [options.badOwner ? ethers.ZeroAddress : action.owner]); if (selector === feedI.getFunction("decimals").selector) return feedI.encodeFunctionResult("decimals", [action.decimals]); if (selector === feedI.getFunction("answer").selector) return feedI.encodeFunctionResult("answer", [BigInt(action.initialAnswer)]); if (selector === feedI.getFunction("updatedAt").selector) return feedI.encodeFunctionResult("updatedAt", [1000n]); return feedI.encodeFunctionResult("roundId", [1n]); } }; }
function baseConfig() { return { schemaVersion: 1, network: { chainId: 97 }, roles: { governanceSafe: LENDING_STAGE0_DEFAULTS.governanceSafe, guardianSafe: "0xdc8003a7046be67f257d294b2680c20988a6bc2b", treasurySafe: "0x0771fbc76ec3e89345bbdd803d0774bbd4943103", governanceThreshold: 4, governanceOwners: 7, guardianThreshold: 3, guardianOwners: 5 }, market: { collateralAsset: LENDING_STAGE0_DEFAULTS.collateralAsset, debtAsset: LENDING_STAGE0_DEFAULTS.debtAsset, collateralDecimals: 18, debtDecimals: 18, maxLtvBps: 5000, liquidationThresholdBps: 7000, liquidationBonusBps: 500, supplyCap: "1000000000000000000000", borrowCap: "900000000000000000000", minBorrow: "10000000000000000000" }, oracle: { maxStalenessSeconds: 3600, maxDeviationBps: 200 }, rate: { baseAprBps: 200, slope1AprBps: 800, slope2AprBps: 9000, optimalUtilizationBps: 8000, reserveFactorBps: 1000 } }; }
function signingProvider(options = {}) { return { getNetwork: async () => ({ chainId: 97n }), getBlockNumber: async () => 200, getBlock: async () => ({ hash: options.hash || blockHash, baseFeePerGas: 3_000_000_000n }), getTransactionCount: async () => options.nonce ?? 10, getBalance: async () => options.balance ?? ethers.parseEther("1"), getCode: async () => options.occupied ? "0x6001" : "0x", estimateGas: async () => options.gas ?? 100000n }; }
async function completionContext() { const c = await verificationContext(), review = buildLendingStage0DeploymentReview({ manifest: c.manifest, preflight: c.preflight }), packet = prepareLendingStage0ExecutionPacket({ manifest: c.manifest, preflight: c.preflight, review, approvedReviewDigest: review.reviewDigest }), signingPreflight = await preflightLendingStage0Signing({ providers: [signingProvider(), signingProvider()], packet }), verification = await verifyLendingStage0Feeds({ providers: [verificationProvider(c), verificationProvider(c)], manifest: c.manifest, preflight: c.preflight, transactionHashes: c.hashes }), finalizedConfig = finalizeLendingStage0Config({ baseConfig: baseConfig(), manifest: c.manifest, verification }); return { manifest: c.manifest, preflight: c.preflight, review, packet, signingPreflight, verification, finalizedConfig }; }

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
  it("uses the higher live gas price when BSC base fee is zero", async function () {
    const manifest = await buildLendingStage0FeedManifest({ artifact }), result = await preflightLendingStage0Feeds({ providers: [provider({ baseFeePerGas: 0n, gasPrice: 100_000_000n }), provider({ baseFeePerGas: 0n, gasPrice: 110_000_000n })], manifest, deployer });
    assert.equal(result.conservativeGasPrice, "110000000"); assert.equal(result.requiredGasBudget, "52800000000000");
    await assert.rejects(preflightLendingStage0Feeds({ providers: [provider({ baseFeePerGas: 0n, gasPrice: 0n }), provider({ baseFeePerGas: 0n, gasPrice: 0n })], manifest, deployer }), /gas price missing/);
  });
  it("fails closed on RPC disagreement and insufficient gas balance", async function () {
    const manifest = await buildLendingStage0FeedManifest({ artifact });
    await assert.rejects(preflightLendingStage0Feeds({ providers: [provider(), provider({ nonce: 11 })], manifest, deployer }), /disagreement/);
    await assert.rejects(preflightLendingStage0Feeds({ providers: [provider({ balance: 1n }), provider({ balance: 1n })], manifest, deployer }), /Insufficient/);
  });
  it("builds one explicit human approval packet for four zero-value deployments", async function () {
    const c = await verificationContext(), review = buildLendingStage0DeploymentReview({ manifest: c.manifest, preflight: c.preflight });
    assert.equal(review.status, "AWAITING_EXPLICIT_DEPLOYMENT_APPROVAL"); assert.equal(review.deployments.length, 4); assert.deepEqual(review.deployments.map(x => x.humanPriceUsd), ["1.0", "0.99", "600.0", "594.0"]); assert.ok(review.deployments.every(x => x.transactionValue === "0")); assert.equal(review.transactionOccurred, false);
  });
  it("invalidates deployment review after address, price, order or preflight mutation", async function () {
    const c = await verificationContext();
    for (const mutate of [p => { p.deployments[0].predictedAddress = ethers.ZeroAddress; }, p => { p.deployments[0].initialAnswer = "2"; }, p => { [p.deployments[0], p.deployments[1]] = [p.deployments[1], p.deployments[0]]; }, p => { p.totalConservativeGas = "1"; }]) { const changed = structuredClone(c.preflight); mutate(changed); assert.throws(() => buildLendingStage0DeploymentReview({ manifest: c.manifest, preflight: changed }), /Invalid|mismatch/); }
  });
  it("creates exactly four sequential unsigned transactions only for the approved review digest", async function () {
    const c = await verificationContext(), review = buildLendingStage0DeploymentReview({ manifest: c.manifest, preflight: c.preflight }), packet = prepareLendingStage0ExecutionPacket({ manifest: c.manifest, preflight: c.preflight, review, approvedReviewDigest: review.reviewDigest });
    assert.equal(packet.status, "APPROVED_PACKET_REQUIRES_FRESH_SIGNING_PREFLIGHT"); assert.deepEqual(packet.transactions.map(x => x.nonce), ["10", "11", "12", "13"]); assert.ok(packet.transactions.every(x => x.to === null && x.value === "0" && BigInt(x.gasLimit) === 120000n)); assert.equal(packet.transactionOccurred, false);
  });
  it("rejects absent approval, changed approval and transaction substitution", async function () {
    const c = await verificationContext(), review = buildLendingStage0DeploymentReview({ manifest: c.manifest, preflight: c.preflight });
    for (const digest of [undefined, ethers.id("another-review")]) assert.throws(() => prepareLendingStage0ExecutionPacket({ manifest: c.manifest, preflight: c.preflight, review, approvedReviewDigest: digest }), /explicit Stage-0 approval/);
    const changed = structuredClone(c.preflight); changed.deployments[0].predictedAddress = ethers.getAddress("0x0000000000000000000000000000000000000099"); const { preflightDigest: _, ...body } = changed; changed.preflightDigest = canonicalDigest(body); assert.throws(() => prepareLendingStage0ExecutionPacket({ manifest: c.manifest, preflight: changed, review, approvedReviewDigest: review.reviewDigest }), /invalid explicit|substitution/);
  });
  it("revalidates the approved packet across two RPCs immediately before signing", async function () {
    const c = await verificationContext(), review = buildLendingStage0DeploymentReview({ manifest: c.manifest, preflight: c.preflight }), packet = prepareLendingStage0ExecutionPacket({ manifest: c.manifest, preflight: c.preflight, review, approvedReviewDigest: review.reviewDigest }), result = await preflightLendingStage0Signing({ providers: [signingProvider(), signingProvider()], packet });
    assert.equal(result.status, "READY_FOR_SEQUENTIAL_WALLET_REVIEW"); assert.equal(result.transactions.length, 4); assert.equal(result.currentNonce, "10"); assert.equal(result.transactionOccurred, false);
  });
  it("blocks signing after nonce drift, occupied address, excess gas, low balance or RPC disagreement", async function () {
    const c = await verificationContext(), review = buildLendingStage0DeploymentReview({ manifest: c.manifest, preflight: c.preflight }), packet = prepareLendingStage0ExecutionPacket({ manifest: c.manifest, preflight: c.preflight, review, approvedReviewDigest: review.reviewDigest }), good = signingProvider();
    for (const [bad, pattern] of [[signingProvider({ nonce: 11 }), /nonce changed/], [signingProvider({ occupied: true }), /occupied/], [signingProvider({ gas: 120001n }), /gas exceeds/], [signingProvider({ balance: 1n }), /balance insufficient/], [signingProvider({ hash: ethers.id("other") }), /RPC state disagreement/]]) await assert.rejects(preflightLendingStage0Signing({ providers: [bad, pattern.source.includes("disagreement") ? good : bad], packet }), pattern);
  });
  it("seals the complete Stage-0 evidence chain for Lending Stage 1", async function () { const evidence = await completionContext(), completion = buildLendingStage0Completion(evidence); assert.equal(completion.status, "COMPLETE_READY_FOR_LENDING_STAGE1"); assert.equal(completion.feeds.length, 4); assert.equal(completion.transactionOccurred, true); });
  it("rejects changed evidence digests, broken bindings and configured feed substitution", async function () { const evidence = await completionContext(); const digestChanged = structuredClone(evidence); digestChanged.review.reviewDigest = ethers.id("changed"); assert.throws(() => buildLendingStage0Completion(digestChanged), /digest/); const bindingChanged = structuredClone(evidence); bindingChanged.packet.approvedReviewDigest = ethers.id("wrong"); const { packetDigest: _, ...pb } = bindingChanged.packet; bindingChanged.packet.packetDigest = canonicalDigest(pb); assert.throws(() => buildLendingStage0Completion(bindingChanged), /Broken/); const feedChanged = structuredClone(evidence); feedChanged.finalizedConfig.config.oracle.debtSecondary = ethers.getAddress("0x0000000000000000000000000000000000000099"); const { finalizedConfigDigest: __, ...fb } = feedChanged.finalizedConfig; feedChanged.finalizedConfig.finalizedConfigDigest = canonicalDigest(fb); assert.throws(() => buildLendingStage0Completion(feedChanged), /mismatch/); });
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
  it("binds only the four verified feed addresses into the Stage-1 config", async function () {
    const c = await verificationContext(), verification = await verifyLendingStage0Feeds({ providers: [verificationProvider(c), verificationProvider(c)], manifest: c.manifest, preflight: c.preflight, transactionHashes: c.hashes }), finalized = finalizeLendingStage0Config({ baseConfig: baseConfig(), manifest: c.manifest, verification });
    assert.equal(finalized.status, "READY_FOR_LENDING_STAGE1_REVIEW"); assert.deepEqual(Object.values(finalized.config.oracle).slice(2), verification.deployments.map(x => x.address));
  });
  it("rejects asset, feed order and verification digest substitution", async function () {
    const c = await verificationContext(), verification = await verifyLendingStage0Feeds({ providers: [verificationProvider(c), verificationProvider(c)], manifest: c.manifest, preflight: c.preflight, transactionHashes: c.hashes });
    const wrongAsset = baseConfig(); wrongAsset.market.debtAsset = ethers.getAddress("0x0000000000000000000000000000000000000099"); assert.throws(() => finalizeLendingStage0Config({ baseConfig: wrongAsset, manifest: c.manifest, verification }), /market mismatch/);
    const reordered = structuredClone(verification); [reordered.deployments[0], reordered.deployments[1]] = [reordered.deployments[1], reordered.deployments[0]]; const { verificationDigest: _, ...rb } = reordered; reordered.verificationDigest = canonicalDigest(rb); assert.throws(() => finalizeLendingStage0Config({ baseConfig: baseConfig(), manifest: c.manifest, verification: reordered }), /order or state/);
    verification.verificationDigest = ethers.id("tampered"); assert.throws(() => finalizeLendingStage0Config({ baseConfig: baseConfig(), manifest: c.manifest, verification }), /Invalid verified/);
  });
  it("contains no private key, signing, approval or transaction broadcast path", function () {
    for (const file of ["../scripts/prepare-lending-stage0-feeds.mjs", "../scripts/preflight-lending-stage0-feeds.mjs", "../scripts/verify-lending-stage0-feeds.mjs"]) { const source = fs.readFileSync(new URL(file, import.meta.url), "utf8"); assert.doesNotMatch(source, /PRIVATE_KEY|signTransaction|eth_sendTransaction|requestAccounts/); }
  });
});
