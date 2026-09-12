import assert from "node:assert/strict";
import { validateTestnetDeploymentConfig } from "../scripts/preflight-testnet-deploy.mjs";

const key = "0x" + "11".repeat(32);
const address = suffix => "0x00000000000000000000000000000000000000" + suffix;

function validEnvironment() {
  return {
    BSC_TESTNET_RPC_URL: "https://example.invalid/bsc-testnet",
    DEPLOYER_PRIVATE_KEY: key,
    SOURCE_COMMIT: "f1bd6ade99369a5e58ef3d850905afac4538a705",
    EXPECTED_CHAIN_ID: "97",
    WBNB_ADDRESS: address("01"),
    FACTORY_OWNER: address("02"),
    RISK_ADMIN: address("03"),
    GUARDIAN_ADDRESS: address("04"),
    TREASURY_ADDRESS: address("05"),
    ALLOW_EOA_OWNER: "true",
    ALLOW_EOA_RISK_ADMIN: "true"
  };
}

describe("BSC testnet deployment preflight configuration", function () {
  it("accepts a separated temporary testnet bootstrap configuration", function () {
    const result = validateTestnetDeploymentConfig(validEnvironment());
    assert.equal(result.sourceCommit, "f1bd6ade99369a5e58ef3d850905afac4538a705");
    assert.notEqual(result.owner, result.riskAdmin);
    assert.equal(result.v3Pools.length, 0);
  });

  it("fails closed for missing RPC, wrong chain, or unpinned source", function () {
    const missingRpc = validEnvironment();
    delete missingRpc.BSC_TESTNET_RPC_URL;
    assert.throws(() => validateTestnetDeploymentConfig(missingRpc), /BSC_TESTNET_RPC_URL/);

    const wrongChain = validEnvironment();
    wrongChain.EXPECTED_CHAIN_ID = "56";
    assert.throws(() => validateTestnetDeploymentConfig(wrongChain), /expected BSC testnet 97/);

    const unpinned = validEnvironment();
    unpinned.SOURCE_COMMIT = "main";
    assert.throws(() => validateTestnetDeploymentConfig(unpinned), /full 40-character/);
  });

  it("rejects shared governance and risk roles unless explicitly opted in", function () {
    const environment = validEnvironment();
    environment.RISK_ADMIN = environment.FACTORY_OWNER;
    assert.throws(() => validateTestnetDeploymentConfig(environment), /role separation/);
  });

  it("requires PancakeSwap V3 router and quoter as a pair", function () {
    const environment = validEnvironment();
    environment.PANCAKE_V3_ROUTER_ADDRESS = address("06");
    assert.throws(() => validateTestnetDeploymentConfig(environment), /both PancakeSwap V3 router and quoter/);
  });

  it("requires at least one reviewed V3 pool when V3 is enabled", function () {
    const environment = validEnvironment();
    environment.PANCAKE_V3_ROUTER_ADDRESS = "0x1b81D678ffb9C0263b24A97847620C99d213eB14";
    environment.PANCAKE_V3_QUOTER_ADDRESS = "0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2";
    assert.throws(() => validateTestnetDeploymentConfig(environment), /at least one reviewed allowed pool/);
  });
  it("rejects unsupported V3 fee tiers and out-of-range hop limits", function () {
    const invalidFee = validEnvironment();
    invalidFee.PANCAKE_V3_ALLOWED_FEE_TIERS = "[300]";
    assert.throws(() => validateTestnetDeploymentConfig(invalidFee), /unique, non-empty subset/);

    const invalidHops = validEnvironment();
    invalidHops.PANCAKE_V3_MAX_HOPS = "4";
    assert.throws(() => validateTestnetDeploymentConfig(invalidHops), /PANCAKE_V3_MAX_HOPS/);
  });

  it("rejects malformed, self-paired, duplicate, or disallowed-fee V3 pools", function () {
    const malformed = validEnvironment();
    malformed.PANCAKE_V3_ALLOWED_POOLS = JSON.stringify([{ tokenA: address("10"), tokenB: address("11"), fee: 300 }]);
    assert.throws(() => validateTestnetDeploymentConfig(malformed), /distinct valid tokens/);

    const selfPair = validEnvironment();
    selfPair.PANCAKE_V3_ALLOWED_POOLS = JSON.stringify([{ tokenA: address("10"), tokenB: address("10"), fee: 500 }]);
    assert.throws(() => validateTestnetDeploymentConfig(selfPair), /distinct valid tokens/);

    const duplicate = validEnvironment();
    const pool = { tokenA: address("10"), tokenB: address("11"), fee: 500 };
    duplicate.PANCAKE_V3_ALLOWED_POOLS = JSON.stringify([pool, { ...pool, tokenA: pool.tokenB, tokenB: pool.tokenA }]);
    assert.throws(() => validateTestnetDeploymentConfig(duplicate), /duplicate pool/);
  });

});
