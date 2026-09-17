import assert from "node:assert/strict";
import { ethers } from "ethers";
import { buildLendingStage3Manifest } from "../scripts/prepare-lending-stage3-manifest.mjs";
import { preflightLendingStage3AcrossRpcs } from "../scripts/preflight-lending-stage3-deployment.mjs";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { validateLendingTestnetConfig } from "../scripts/validate-lending-testnet-config.mjs";

const address = value => ethers.getAddress(`0x${value.toString(16).padStart(40, "0")}`);
const governance = address(1), guardian = address(2), treasury = address(3), collateral = address(4), debt = address(5), oracle = address(6), rate = address(7), registry = address(8), index = address(9), deployer = address(100);
const registryInterface = new ethers.Interface(["function owner() view returns(address)", "function guardian() view returns(address)", "function oracle() view returns(address)"]);
const indexInterface = new ethers.Interface(["function owner() view returns(address)", "function rateModel() view returns(address)", "function core() view returns(address)"]);

function config() {
  const marketId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "address"], [collateral, debt]));
  return { schemaVersion: 1, network: { chainId: 97 }, roles: { governanceSafe: governance, guardianSafe: guardian, treasurySafe: treasury, governanceThreshold: 4, governanceOwners: 7, guardianThreshold: 3, guardianOwners: 5 }, market: { collateralAsset: collateral, debtAsset: debt, collateralDecimals: 18, debtDecimals: 18, maxLtvBps: 5000, liquidationThresholdBps: 7000, liquidationBonusBps: 500, supplyCap: "1000000000000000000000", borrowCap: "900000000000000000000", minBorrow: "10000000000000000000" }, oracle: { collateralPrimary: address(10), collateralSecondary: address(11), debtPrimary: address(12), debtSecondary: address(13), maxStalenessSeconds: 3600, maxDeviationBps: 200 }, rate: { baseAprBps: 200, slope1AprBps: 800, slope2AprBps: 9000, optimalUtilizationBps: 8000, reserveFactorBps: 1000 }, composite: { executor: address(14), lendingCore: address(15), supplyAdapter: address(16), adapterRegistry: address(17), marketId } };
}

async function context() {
  const configuration = config(), approved = validateLendingTestnetConfig(configuration);
  const stage2Body = { status: "REVIEW_REQUIRED", network: { chainId: 97 }, stage: "stage2-registry-index-deploy", configPreflightDigest: approved.preflightDigest, dependencies: { oracleManager: oracle, interestRateModel: rate }, orderedActions: [{ id: 1 }, { id: 2 }], transactionOccurred: false };
  const stage2Manifest = { ...stage2Body, manifestDigest: canonicalDigest(stage2Body) };
  const verificationBody = { status: "VERIFIED_LENDING_STAGE2_DEPLOYMENT", network: { chainId: 97 }, manifestDigest: stage2Manifest.manifestDigest, deployments: [{ contract: "LQCLendingMarketRegistry", contractAddress: registry, bindings: { owner: governance, guardian, oracle } }, { contract: "LQCLendingInterestIndex", contractAddress: index, bindings: { owner: governance, rateModel: rate, core: ethers.ZeroAddress } }], transactionOccurred: true };
  const stage2Verification = { ...verificationBody, verificationDigest: canonicalDigest(verificationBody) };
  return { configuration, stage2Manifest, stage2Verification, manifest: await buildLendingStage3Manifest({ config: configuration, stage2Manifest, stage2Verification }) };
}

function callResult(to, data, badOracle = false) {
  if (to.toLowerCase() === registry.toLowerCase()) {
    const field = registryInterface.getFunction(data.slice(0, 10)).name;
    const value = field === "owner" ? governance : field === "guardian" ? guardian : badOracle ? address(99) : oracle;
    return registryInterface.encodeFunctionResult(field, [value]);
  }
  const field = indexInterface.getFunction(data.slice(0, 10)).name;
  const value = field === "owner" ? governance : field === "rateModel" ? rate : ethers.ZeroAddress;
  return indexInterface.encodeFunctionResult(field, [value]);
}

function provider(options = {}) {
  const nonce = options.nonce ?? 109;
  return { getNetwork: async () => ({ chainId: BigInt(options.chainId ?? 97) }), getBlockNumber: async () => options.head ?? 200, getBlock: async number => ({ hash: ethers.id(`block-${number}`) }), getFeeData: async () => ({ gasPrice: options.gasPrice ?? 100_000_000n }), getTransactionCount: async () => nonce, getBalance: async () => options.balance ?? 10n ** 18n, getCode: async target => target.toLowerCase() === ethers.getCreateAddress({ from: deployer, nonce }).toLowerCase() ? (options.occupied ? "0x60" : "0x") : "0x6001", estimateGas: async () => options.gas ?? 700_000n, call: async ({ to, data }) => callResult(to, data, options.badOracle) };
}

describe("LQC Lending Stage-3 read-only gate", function () {
  it("builds Core only from digest-bound verified Stage-2 dependencies", async () => { const value = await context(); assert.equal(value.manifest.stage, "stage3-lending-core-deploy"); assert.equal(value.manifest.dependencies.marketRegistry, registry); assert.equal(value.manifest.dependencies.interestIndex, index); assert.match(value.manifest.manifestDigest, /^sha256:/); });
  it("rejects substituted Stage-2 verification", async () => { const value = await context(), changed = structuredClone(value.stage2Verification); changed.deployments[0].contractAddress = address(99); await assert.rejects(buildLendingStage3Manifest({ config: value.configuration, stage2Manifest: value.stage2Manifest, stage2Verification: changed }), /verification/); });
  it("preflights live dependencies, CREATE address and BSC gas price across two RPCs", async () => { const value = await context(), result = await preflightLendingStage3AcrossRpcs({ providers: [provider({ head: 200 }), provider({ head: 201, gas: 710_000n, gasPrice: 120_000_000n })], manifest: value.manifest, deployer }); assert.equal(result.status, "PREFLIGHT_VERIFIED_FOR_REVIEW"); assert.equal(result.deployerNonce, "109"); assert.equal(result.deployment.approvedGasLimit, "852000"); assert.equal(result.conservativeGasPrice, "120000000"); assert.equal(result.rpcHeads.length, 2); });
  it("rejects binding drift, occupied address, nonce disagreement and insufficient balance", async () => { const value = await context(); for (const providers of [[provider(), provider({ badOracle: true })], [provider(), provider({ occupied: true })], [provider(), provider({ nonce: 110 })], [provider({ balance: 1n }), provider({ balance: 1n })]]) await assert.rejects(preflightLendingStage3AcrossRpcs({ providers, manifest: value.manifest, deployer }), /binding|already has code|disagreement|insufficient/); });
  it("contains no signing or transaction broadcast path", () => { for (const source of [buildLendingStage3Manifest, preflightLendingStage3AcrossRpcs]) assert.doesNotMatch(String(source), /PRIVATE_KEY|signTransaction|eth_sendTransaction/); });
});
