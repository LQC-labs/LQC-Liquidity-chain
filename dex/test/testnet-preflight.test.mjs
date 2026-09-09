import assert from "node:assert/strict";
import { ethers } from "ethers";
import { PANCAKE_BSC_TESTNET } from "../scripts/validate-bsc-testnet.mjs";
import { assertReviewedSourceCommit, runTestnetPreflight, validateTestnetDeploymentConfig } from "../scripts/preflight-testnet-deploy.mjs";

const key = `0x${"11".repeat(32)}`;
const owner = "0x0000000000000000000000000000000000000001";
const riskAdmin = "0x0000000000000000000000000000000000000003";
const reviewedPool = JSON.stringify([{ tokenA: owner, tokenB: riskAdmin, fee: 2500 }]);
const base = { BSC_TESTNET_RPC_URL: "https://example.invalid", DEPLOYER_PRIVATE_KEY: key,
  FACTORY_OWNER: owner, RISK_ADMIN: riskAdmin,
  WBNB_ADDRESS: "0x0000000000000000000000000000000000000002", EXPECTED_CHAIN_ID: "97",
  SOURCE_COMMIT: "a".repeat(40) };

describe("BSC testnet deployment preflight", function () {
  it("accepts bounded defaults and a separate governance owner", function () {
    const result = validateTestnetDeploymentConfig(base);
    assert.equal(result.owner, owner);
    assert.equal(result.riskAdmin, riskAdmin);
    assert.equal(result.delay, 3600n);
  });

  it("binds deployment to the reviewed clean source commit", async function () {
    assert.equal(assertReviewedSourceCommit("A".repeat(40), "a".repeat(40)), "a".repeat(40));
    assert.throws(() => assertReviewedSourceCommit("short", "a".repeat(40)), /40-character/);
    assert.throws(() => assertReviewedSourceCommit("a".repeat(40), "b".repeat(40)), /does not match/);
    assert.throws(() => assertReviewedSourceCommit("a".repeat(40), "a".repeat(40), true), /dirty Git worktree/);
    const provider = { getNetwork: async () => ({ chainId: 97n }), getBalance: async () => ethers.parseEther("11"), getCode: async () => "0x6000" };
    await assert.rejects(() => runTestnetPreflight(base, provider, { commit: "b".repeat(40), dirty: false }), /does not match/);
  });

  it("rejects missing governance, wrong chains, weak limits, and excess liquidity", function () {
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, FACTORY_OWNER: "" }), /FACTORY_OWNER/);
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, SOURCE_COMMIT: "" }), /SOURCE_COMMIT/);
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, RISK_ADMIN: "" }), /RISK_ADMIN/);
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, RISK_ADMIN: owner }), /role separation/);
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, EXPECTED_CHAIN_ID: "56" }), /expected BSC testnet/);
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, TIMELOCK_DELAY: "3599" }), /TIMELOCK_DELAY/);
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, TEST_LQC_MAX_TX: "2", TEST_LQC_MAX_DAY: "1" }), /MAX_DAY/);
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, TEST_LQC_SUPPLY: "1" }), /exceeds/);
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, TEST_VAULT_DEPOSIT_CAP: "100", TEST_VAULT_STRATEGY_CAP: "101" }), /cannot exceed/);
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, TEST_VAULT_MAX_LOSS_BPS: "2001" }), /between 0 and 2000/);
  });

  it("requires an explicit override when the temporary deployer owns governance", function () {
    const wallet = new ethers.Wallet(key).address;
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, FACTORY_OWNER: wallet }), /must differ/);
    assert.doesNotThrow(() => validateTestnetDeploymentConfig({ ...base, FACTORY_OWNER: wallet, ALLOW_DEPLOYER_AS_OWNER: "true" }));
  });

  it("requires explicit overrides for temporary deployer or shared risk administration", function () {
    const wallet = new ethers.Wallet(key).address;
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, RISK_ADMIN: wallet }), /must differ from the deployer/);
    assert.doesNotThrow(() => validateTestnetDeploymentConfig({ ...base, RISK_ADMIN: wallet, ALLOW_DEPLOYER_AS_RISK_ADMIN: "true" }));
    assert.doesNotThrow(() => validateTestnetDeploymentConfig({ ...base, RISK_ADMIN: owner, ALLOW_SHARED_RISK_ADMIN: "true" }));
  });

  it("pins every configured PancakeSwap endpoint", function () {
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, PANCAKE_V2_ROUTER_ADDRESS: owner }), /not the pinned/);
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, PANCAKE_V3_ROUTER_ADDRESS: PANCAKE_BSC_TESTNET.v3Router }), /both/);
    assert.doesNotThrow(() => validateTestnetDeploymentConfig({ ...base, PANCAKE_V2_ROUTER_ADDRESS: PANCAKE_BSC_TESTNET.v2Router,
      PANCAKE_V3_ROUTER_ADDRESS: PANCAKE_BSC_TESTNET.v3Router, PANCAKE_V3_QUOTER_ADDRESS: PANCAKE_BSC_TESTNET.v3Quoter,
      PANCAKE_V3_ALLOWED_POOLS: reviewedPool }));
    assert.throws(() => validateTestnetDeploymentConfig({ ...base,
      PANCAKE_V3_ROUTER_ADDRESS: PANCAKE_BSC_TESTNET.v3Router, PANCAKE_V3_QUOTER_ADDRESS: PANCAKE_BSC_TESTNET.v3Quoter }), /reviewed allowed pool/);
  });

  it("checks the live chain, deployer balance, and configured bytecode", async function () {
    const provider = { getNetwork: async () => ({ chainId: 97n }), getBalance: async () => ethers.parseEther("11"), getCode: async () => "0x6000" };
    const result = await runTestnetPreflight(base, provider);
    assert.equal(result.chainId, 97);
    assert.equal(result.riskAdmin, riskAdmin);
    await assert.rejects(() => runTestnetPreflight(base, { ...provider, getBalance: async () => 0n }), /balance/);
    await assert.rejects(() => runTestnetPreflight(base, { ...provider, getCode: async () => "0x" }), /bytecode/);
  });

  it("reserves deployment gas and requires a deployed multisig by default", async function () {
    const funded = { getNetwork: async () => ({ chainId: 97n }), getBalance: async () => ethers.parseEther("10.49"), getCode: async () => "0x6000" };
    await assert.rejects(() => runTestnetPreflight(base, funded), /gas reserve/);
    const eoaOwner = { ...funded, getBalance: async () => ethers.parseEther("11"),
      getCode: async address => ethers.getAddress(address) === owner ? "0x" : "0x6000" };
    await assert.rejects(() => runTestnetPreflight(base, eoaOwner), /multisig/);
    await assert.doesNotReject(() => runTestnetPreflight({ ...base, ALLOW_EOA_OWNER: "true" }, eoaOwner));
    const eoaRisk = { ...funded, getBalance: async () => ethers.parseEther("11"),
      getCode: async address => ethers.getAddress(address) === riskAdmin ? "0x" : "0x6000" };
    await assert.rejects(() => runTestnetPreflight(base, eoaRisk), /risk multisig/);
    await assert.doesNotReject(() => runTestnetPreflight({ ...base, ALLOW_EOA_RISK_ADMIN: "true" }, eoaRisk));
  });
});
