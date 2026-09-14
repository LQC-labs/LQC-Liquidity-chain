import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { TEST_LQC, TEST_WBNB, PILOT_FEE } from "../scripts/prepare-pancake-v3-pool.mjs";
import { SIGNER_1 } from "../scripts/prepare-pancake-v3-liquidity.mjs";
import { PANCAKE_BSC_TESTNET } from "../scripts/validate-bsc-testnet.mjs";
import { PANCAKE_V3_DEX_ID, buildRouter2QuoteStack } from "../scripts/prepare-router2-quote-stack.mjs";

const artifact = name => JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/router-v2/${name}`, import.meta.url)));

describe("Router 2.0 quote-first testnet stack preparation", function () {
  const registryAddress = "0x0000000000000000000000000000000000000011";
  const adapterAddress = "0x0000000000000000000000000000000000000022";

  it("prepares only independent Registry and V3 Adapter deployments initially", async function () {
    const bundle = await buildRouter2QuoteStack();
    assert.deepEqual(bundle.orderedActions.map(item => item.action), ["deploy-registry", "deploy-v3-adapter"]);
    assert.match(bundle.safety, /No Execution Router, Risk Registry, token approval, liquidity movement, or swap/);
    const registryFactory = new ethers.ContractFactory(artifact("LQCDexRegistry.sol/LQCDexRegistry.json").abi, artifact("LQCDexRegistry.sol/LQCDexRegistry.json").bytecode);
    const adapterFactory = new ethers.ContractFactory(artifact("adapters/PancakeV3ExecutionAdapter.sol/PancakeV3ExecutionAdapter.json").abi, artifact("adapters/PancakeV3ExecutionAdapter.sol/PancakeV3ExecutionAdapter.json").bytecode);
    const decodeDeploy = (factory, contractArtifact, data) => ethers.AbiCoder.defaultAbiCoder().decode(
      factory.interface.deploy.inputs.map(input => input.type), `0x${data.slice(contractArtifact.bytecode.length)}`,
    );
    const registryJson = artifact("LQCDexRegistry.sol/LQCDexRegistry.json");
    const adapterJson = artifact("adapters/PancakeV3ExecutionAdapter.sol/PancakeV3ExecutionAdapter.json");
    assert.equal(decodeDeploy(registryFactory, registryJson, bundle.orderedActions[0].data)[0], SIGNER_1);
    const decoded = decodeDeploy(adapterFactory, adapterJson, bundle.orderedActions[1].data);
    assert.equal(decoded[0], PANCAKE_BSC_TESTNET.v3Quoter);
    assert.equal(decoded[1], PANCAKE_BSC_TESTNET.v3Router);
    assert.equal(decoded[2], SIGNER_1);
    assert.equal(decoded[3], 1n);
  });

  it("pins fee 2500 and the verified tLQC/WBNB pool before registration", async function () {
    const bundle = await buildRouter2QuoteStack(registryAddress, adapterAddress);
    const adapter = new ethers.Interface(artifact("adapters/PancakeV3ExecutionAdapter.sol/PancakeV3ExecutionAdapter.json").abi);
    const registry = new ethers.Interface(artifact("LQCDexRegistry.sol/LQCDexRegistry.json").abi);
    const fee = adapter.decodeFunctionData("setFeeTierAllowed", bundle.orderedActions[2].data);
    assert.deepEqual([...fee], [BigInt(PILOT_FEE), true]);
    const pool = adapter.decodeFunctionData("setPoolAllowed", bundle.orderedActions[3].data);
    assert.equal(pool[0], TEST_LQC); assert.equal(pool[1], TEST_WBNB); assert.equal(pool[2], BigInt(PILOT_FEE)); assert.equal(pool[3], true);
    const dex = registry.decodeFunctionData("addDex", bundle.orderedActions[4].data);
    assert.equal(dex[0], PANCAKE_V3_DEX_ID); assert.equal(dex[1], adapterAddress); assert.equal(dex[2], "PancakeSwap V3"); assert.equal(dex[3], 95n);
    assert.equal(bundle.orderedActions[5].action, "deploy-quote-router");
  });

  it("rejects malformed dependent deployment addresses", async function () {
    await assert.rejects(buildRouter2QuoteStack("bad", null), /registryAddress/);
    await assert.rejects(buildRouter2QuoteStack(null, "bad"), /adapterAddress/);
  });
});
