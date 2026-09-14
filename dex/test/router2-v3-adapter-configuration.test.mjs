import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { TEST_LQC, TEST_WBNB, PILOT_FEE } from "../scripts/prepare-pancake-v3-pool.mjs";
import { PANCAKE_V3_DEX_ID, buildRouter2QuoteStack } from "../scripts/prepare-router2-quote-stack.mjs";

describe("Router 2.0 V3 Adapter staged configuration", function () {
  const record = JSON.parse(fs.readFileSync(new URL("../deployments/router2-quote-stack-config-bsc-testnet-97.json", import.meta.url)));
  const registry = record.executions.registry.address;
  const adapter = record.executions.pancakeV3Adapter.address;

  it("uses only the two successfully deployed and verified contract addresses", function () {
    assert.equal(record.orderedActions[2].to, adapter);
    assert.equal(record.orderedActions[3].to, adapter);
    assert.equal(record.orderedActions[4].to, registry);
    assert.equal(record.orderedActions[5].to, null);
  });

  it("pins ordered fee, pool, registration, then Quote Router deployment", async function () {
    const expected = await buildRouter2QuoteStack(registry, adapter);
    assert.deepEqual(record.orderedActions, expected.orderedActions);
    assert.deepEqual(record.orderedActions.map(x => x.action), [
      "deploy-registry", "deploy-v3-adapter", "allow-fee-2500", "allow-verified-pool", "register-v3-adapter", "deploy-quote-router",
    ]);
  });

  it("encodes only fee 2500, the verified pair, and the PANCAKE_V3 id", function () {
    const adapterAbi = ["function setFeeTierAllowed(uint24,bool)", "function setPoolAllowed(address,address,uint24,bool)"];
    const registryAbi = ["function addDex(bytes32,address,string,uint32)"];
    const ai = new ethers.Interface(adapterAbi); const ri = new ethers.Interface(registryAbi);
    const fee = ai.decodeFunctionData("setFeeTierAllowed", record.orderedActions[2].data);
    const pool = ai.decodeFunctionData("setPoolAllowed", record.orderedActions[3].data);
    const dex = ri.decodeFunctionData("addDex", record.orderedActions[4].data);
    assert.deepEqual([...fee], [BigInt(PILOT_FEE), true]);
    assert.equal(pool[0], TEST_LQC); assert.equal(pool[1], TEST_WBNB); assert.equal(pool[2], BigInt(PILOT_FEE)); assert.equal(pool[3], true);
    assert.equal(dex[0], PANCAKE_V3_DEX_ID); assert.equal(dex[1].toLowerCase(), adapter.toLowerCase()); assert.equal(dex[2], "PancakeSwap V3"); assert.equal(dex[3], 95n);
  });

  it("keeps every configuration transaction at zero native value", function () {
    assert.ok(record.orderedActions.slice(2, 5).every(action => action.value === "0"));
  });

  it("records the three successful on-chain configuration receipts", function () {
    const execution = record.executions.v3Configuration;
    assert.equal(execution.feeTier, 2500);
    assert.equal(execution.pool, record.verifiedPool);
    assert.equal(execution.dexId, "PANCAKE_V3");
    assert.equal(execution.priority, 95);
    assert.equal(execution.status, "success");
    for (const hash of [execution.feeTierTransactionHash, execution.poolAllowTransactionHash, execution.registryTransactionHash]) {
      assert.match(hash, /^0x[0-9a-f]{64}$/);
    }
    assert.equal(execution.feeTierTransactionHash, "0xf1d0a6fc5c922c2a0f769209262d1a97e53d060fccc7cdfe54328a98523f4c0c");
    assert.equal(execution.poolAllowTransactionHash, "0xe64ed69e6b42824dc7ac7fe8b05510fc10eb6f1d687240c0044bde782d4de184");
    assert.equal(execution.registryTransactionHash, "0x0f56e870bf9b149a2e1e4b0c3a439d63195141ff3617e199ce068b7c9701ceb4");
  });
});
