import assert from "node:assert/strict";
import { ethers } from "ethers";
import { PANCAKE_BSC_TESTNET } from "../scripts/validate-bsc-testnet.mjs";
import { runTestnetPreflight, validateTestnetDeploymentConfig } from "../scripts/preflight-testnet-deploy.mjs";

const key = `0x${"11".repeat(32)}`;
const owner = "0x0000000000000000000000000000000000000001";
const base = { BSC_TESTNET_RPC_URL: "https://example.invalid", DEPLOYER_PRIVATE_KEY: key,
  FACTORY_OWNER: owner, WBNB_ADDRESS: "0x0000000000000000000000000000000000000002", EXPECTED_CHAIN_ID: "97" };

describe("BSC testnet deployment preflight", function () {
  it("accepts bounded defaults and a separate governance owner", function () {
    const result = validateTestnetDeploymentConfig(base);
    assert.equal(result.owner, owner);
    assert.equal(result.delay, 3600n);
  });

  it("rejects missing governance, wrong chains, weak limits, and excess liquidity", function () {
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, FACTORY_OWNER: "" }), /FACTORY_OWNER/);
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, EXPECTED_CHAIN_ID: "56" }), /expected BSC testnet/);
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, TIMELOCK_DELAY: "3599" }), /TIMELOCK_DELAY/);
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, TEST_LQC_MAX_TX: "2", TEST_LQC_MAX_DAY: "1" }), /MAX_DAY/);
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, TEST_LQC_SUPPLY: "1" }), /exceeds/);
  });

  it("requires an explicit override when the temporary deployer owns governance", function () {
    const wallet = new ethers.Wallet(key).address;
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, FACTORY_OWNER: wallet }), /must differ/);
    assert.doesNotThrow(() => validateTestnetDeploymentConfig({ ...base, FACTORY_OWNER: wallet, ALLOW_DEPLOYER_AS_OWNER: "true" }));
  });

  it("pins every configured PancakeSwap endpoint", function () {
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, PANCAKE_V2_ROUTER_ADDRESS: owner }), /not the pinned/);
    assert.throws(() => validateTestnetDeploymentConfig({ ...base, PANCAKE_V3_ROUTER_ADDRESS: PANCAKE_BSC_TESTNET.v3Router }), /both/);
    assert.doesNotThrow(() => validateTestnetDeploymentConfig({ ...base, PANCAKE_V2_ROUTER_ADDRESS: PANCAKE_BSC_TESTNET.v2Router,
      PANCAKE_V3_ROUTER_ADDRESS: PANCAKE_BSC_TESTNET.v3Router, PANCAKE_V3_QUOTER_ADDRESS: PANCAKE_BSC_TESTNET.v3Quoter }));
  });

  it("checks the live chain, deployer balance, and configured bytecode", async function () {
    const provider = { getNetwork: async () => ({ chainId: 97n }), getBalance: async () => ethers.parseEther("11"), getCode: async () => "0x6000" };
    const result = await runTestnetPreflight(base, provider);
    assert.equal(result.chainId, 97);
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
  });
});
