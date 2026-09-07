import assert from "node:assert/strict";
import {
  PANCAKE_BSC_TESTNET,
  assertBscTestnetChain,
  assertContractCode,
  deploymentContractAddresses,
  validateDeploymentDexRecords
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

  it("requires every safety-critical LQC contract in a chain-97 deployment record", function () {
    const address = "0x0000000000000000000000000000000000000001";
    const deployment = { network: { chainId: 97 }, contracts: Object.fromEntries(
      ["dexRegistry", "riskRegistry", "emergencyController", "executionRouter", "timelock"].map(name => [name, { address }])
    ) };
    assert.equal(Object.keys(deploymentContractAddresses(deployment)).length, 5);
    delete deployment.contracts.timelock;
    assert.throws(() => deploymentContractAddresses(deployment), /missing timelock/);
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
});
