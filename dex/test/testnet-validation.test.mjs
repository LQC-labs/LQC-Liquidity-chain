import assert from "node:assert/strict";
import { ethers } from "ethers";
import {
  PANCAKE_BSC_TESTNET,
  assertBscTestnetChain,
  assertContractCode,
  assertPancakeV3PoolsExist,
  deploymentContractAddresses,
  validateDeploymentEvidenceRecord,
  validateDeploymentDexRecords,
  validateRiskAdministrator,
  validateVaultDeploymentRecord,
  validateV3DeploymentRecord
} from "../scripts/validate-bsc-testnet.mjs";

describe("BSC testnet real-address validation", function () {
  it("pins the reviewed official PancakeSwap testnet endpoints", function () {
    assert.equal(PANCAKE_BSC_TESTNET.v2Router, "0xD99D1c33F9fC3444f8101754aBC46c52416550D1");
    assert.equal(PANCAKE_BSC_TESTNET.v3Quoter, "0xbC203d7f83677c7ed3F7acEc959963E7F4ECC5C2");
    assert.doesNotThrow(() => assertBscTestnetChain(97n));
    assert.throws(() => assertBscTestnetChain(56n), /expected BSC testnet 97/);
  });

  it("rejects missing bytecode and accepts deployed contract addresses", async function () {
    const provider = { getCode: async address => address.endsWith("01") ? "0x6000" : "0x" };
    await assert.doesNotReject(() => assertContractCode(provider, { ok: "0x0000000000000000000000000000000000000001" }));
    await assert.rejects(() => assertContractCode(provider, { missing: "0x0000000000000000000000000000000000000002" }), /no deployed bytecode/);
  });

  it("requires every reviewed PancakeSwap V3 pool to exist with bytecode", async function () {
    const tokenA = "0x0000000000000000000000000000000000000001";
    const tokenB = "0x0000000000000000000000000000000000000002";
    const poolAddress = "0x0000000000000000000000000000000000000003";
    const provider = {
      call: async () => ethers.AbiCoder.defaultAbiCoder().encode(["address"], [poolAddress]),
      getCode: async address => ethers.getAddress(address) === ethers.getAddress(poolAddress) ? "0x6000" : "0x"
    };
    const pools = [{ tokenA, tokenB, fee: 2500 }];
    await assert.doesNotReject(() => assertPancakeV3PoolsExist(provider, pools));
    await assert.rejects(() => assertPancakeV3PoolsExist({ ...provider,
      call: async () => ethers.AbiCoder.defaultAbiCoder().encode(["address"], [ethers.ZeroAddress])
    }, pools), /does not exist/);
    await assert.rejects(() => assertPancakeV3PoolsExist({ ...provider, getCode: async () => "0x" }, pools), /no deployed bytecode/);
    await assert.rejects(() => assertPancakeV3PoolsExist(provider, [...pools, { tokenA: tokenB, tokenB: tokenA, fee: 2500 }]), /duplicate pool/);
  });

  it("requires every safety-critical LQC contract in a chain-97 deployment record", function () {
    const address = "0x0000000000000000000000000000000000000001";
    const deployment = { network: { chainId: 97 }, contracts: Object.fromEntries(
      ["dexRegistry", "riskRegistry", "emergencyController", "executionRouter", "timelock", "gasCostOracle", "liquidityVault", "idleStrategyAdapter"]
        .map(name => [name, { address }])
    ) };
    assert.equal(Object.keys(deploymentContractAddresses(deployment)).length, 8);
    delete deployment.contracts.timelock;
    assert.throws(() => deploymentContractAddresses(deployment), /missing timelock/);
  });

  it("requires reproducible source, compiler, role, and transaction evidence", function () {
    const address = n => `0x${n.toString(16).padStart(40, "0")}`;
    const tx = n => `0x${n.toString(16).padStart(64, "0")}`;
    const names = ["lqc", "mockUsdt", "factory", "router", "dexRegistry", "timelock", "emergencyController",
      "riskRegistry", "quoteRouter", "executionRouter", "nativeRouter", "splitOptimizer", "autoRouter",
      "gasCostOracle", "flowAdapter", "liquidityVault", "idleStrategyAdapter"];
    const deployment = {
      generatedAt: "2026-09-09T00:00:00.000Z", network: { chainId: 97 },
      deployer: address(100), owner: address(101), riskAdmin: address(102), sourceRevision: "a".repeat(40),
      compiler: { version: "0.8.30", optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "shanghai" },
      contracts: Object.fromEntries(names.map((name, index) => [name, { address: address(index + 1), deploymentTx: tx(index + 1) }]))
    };
    assert.deepEqual(validateDeploymentEvidenceRecord(deployment), { sourceRevision: "a".repeat(40), contractCount: 17 });
    assert.throws(() => validateDeploymentEvidenceRecord({ ...deployment, sourceRevision: "short" }), /source commit/);
    assert.throws(() => validateDeploymentEvidenceRecord({ ...deployment, riskAdmin: deployment.owner }), /separate/);
    assert.throws(() => validateDeploymentEvidenceRecord({ ...deployment, compiler: { ...deployment.compiler, viaIR: false } }), /compiler/);
    const missingTx = structuredClone(deployment); missingTx.contracts.liquidityVault.deploymentTx = null;
    assert.throws(() => validateDeploymentEvidenceRecord(missingTx), /liquidityVault transaction/);
  });

  it("validates fresh Vault roles, limits, accounting, and adapter linkage", function () {
    const addresses = Array.from({ length: 6 }, (_, i) => `0x${String(i + 1).padStart(40, "0")}`);
    const [vaultAddress, asset, adapterAddress, ownerAddress, pauseAdmin, strategyAdmin] = addresses;
    const deployment = {
      contracts: {
        liquidityVault: { address: vaultAddress, asset, depositCap: "1000", strategyCap: "100", maxLossBps: 100,
          allocationsPaused: true },
        idleStrategyAdapter: { address: adapterAddress, asset, vault: vaultAddress }
      },
      liquidityVaultRoles: { owner: ownerAddress, pauseAdmin, strategyAdmin }
    };
    const onchain = { owner: ownerAddress, pauseAdmin, strategyAdmin, asset, strategy: adapterAddress,
      adapterAsset: asset, adapterVault: vaultAddress, depositCap: 1000n, strategyCap: 100n, maxLossBps: 100n,
      strategyDebt: 0n, accountedAssets: 0n, adapterManagedAssets: 0n,
      depositsPaused: false, allocationsPaused: true, insolvent: false };
    assert.equal(validateVaultDeploymentRecord(deployment, onchain), true);
    assert.equal(validateVaultDeploymentRecord(deployment, { ...onchain, depositsPaused: true }), true);
    assert.throws(() => validateVaultDeploymentRecord(deployment, { ...onchain, allocationsPaused: false }), /pause state/);
    assert.throws(() => validateVaultDeploymentRecord({
      ...deployment, contracts: { ...deployment.contracts,
        liquidityVault: { ...deployment.contracts.liquidityVault, allocationsPaused: false } }
    }, { ...onchain, allocationsPaused: false }), /must require paused/);
    assert.throws(() => validateVaultDeploymentRecord(deployment, { ...onchain, strategyDebt: 1n }), /unexpected accounting/);
    assert.throws(() => validateVaultDeploymentRecord(deployment, { ...onchain, insolvent: true }), /insolvent/);
    assert.throws(() => validateVaultDeploymentRecord(deployment, { ...onchain, adapterVault: asset }), /linkage mismatch/);
    assert.throws(() => validateVaultDeploymentRecord(deployment, { ...onchain, strategyCap: 101n }), /limit configuration/);
    assert.throws(() => validateVaultDeploymentRecord({
      ...deployment, liquidityVaultRoles: { ...deployment.liquidityVaultRoles, pauseAdmin: ownerAddress }
    }, { ...onchain, pauseAdmin: ownerAddress }), /not separated/);
  });

  it("matches recorded DEX ids, order, adapters, and active status", function () {
    const id = `0x${"11".repeat(32)}`;
    const adapter = "0x0000000000000000000000000000000000000001";
    const records = [{ id, name: "LQC Flow", adapter }];
    const onchain = [{ id, adapter, enabled: true, priority: 100 }];
    assert.doesNotThrow(() => validateDeploymentDexRecords(records, onchain));
    assert.throws(
      () => validateDeploymentDexRecords(records, [{ ...onchain[0], enabled: false }]),
      /disabled in the registry/
    );
    assert.throws(
      () => validateDeploymentDexRecords(records, [{ ...onchain[0], adapter: "0x0000000000000000000000000000000000000002" }]),
      /adapter mismatch/
    );
  });

  it("requires a recorded, distinct risk administrator that matches on-chain state", function () {
    const owner = "0x0000000000000000000000000000000000000001";
    const riskAdmin = "0x0000000000000000000000000000000000000002";
    assert.equal(validateRiskAdministrator({ owner, riskAdmin }, riskAdmin), ethers.getAddress(riskAdmin));
    assert.throws(() => validateRiskAdministrator({ owner, riskAdmin: owner }, owner), /not separated/);
    assert.throws(() => validateRiskAdministrator({ owner, riskAdmin }, owner), /does not match/);
    assert.throws(() => validateRiskAdministrator({ owner }, riskAdmin), /missing governance or risk/);
  });

  it("rejects unsafe PancakeSwap V3 fee, pool, and multihop records", function () {
    const tokenA = "0x0000000000000000000000000000000000000001";
    const tokenB = "0x0000000000000000000000000000000000000002";
    const valid = { kind: "v3", maxHops: 2, feeTiers: [500, 2500], pools: [{ tokenA, tokenB, fee: 2500 }] };
    assert.equal(validateV3DeploymentRecord(valid), valid);
    assert.throws(() => validateV3DeploymentRecord({ ...valid, maxHops: 4 }), /maxHops/);
    assert.throws(() => validateV3DeploymentRecord({ ...valid, feeTiers: [3000] }), /fee tiers/);
    assert.throws(() => validateV3DeploymentRecord({ ...valid, pools: [] }), /no reviewed pools/);
    assert.throws(() => validateV3DeploymentRecord({
      ...valid, pools: [{ tokenA, tokenB, fee: 500 }, { tokenA: tokenB, tokenB: tokenA, fee: 500 }]
    }), /duplicate pool/);
  });
});
