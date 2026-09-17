import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";

const readJson = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));

export function getHistoricalAdapterBytecode(deployment) {
  assert.equal(deployment?.network?.chainId, 97, "historical V3 deployment evidence must target BSC Testnet (97)");
  assert.ok(Array.isArray(deployment?.orderedActions), "historical deployment must record orderedActions");

  const adapterActions = deployment.orderedActions.filter((entry) => entry?.action === "deploy-v3-adapter");
  assert.equal(adapterActions.length, 1, "historical deployment must contain exactly one deploy-v3-adapter action");

  const bytecode = adapterActions[0]?.data;
  assert.equal(typeof bytecode, "string", "deploy-v3-adapter action must record deployment bytecode in data");
  assert.match(bytecode, /^0x[0-9a-fA-F]+$/, "deploy-v3-adapter data must be hex bytecode");
  assert.ok(bytecode.length > 100, "deploy-v3-adapter bytecode must not be empty or truncated");
  return bytecode;
}

export function classifyArtifactStatus(currentBytecode, historicalBytecode) {
  const currentHash = ethers.keccak256(currentBytecode);
  const deployedHash = ethers.keccak256(historicalBytecode);
  return {
    status: currentHash === deployedHash ? "match" : "redeploy_required",
    currentHash,
    deployedHash,
    releaseReady: currentHash === deployedHash,
  };
}

describe("Router 2.0 V3 Adapter artifact status", function () {
  it("binds historical evidence to the explicit deploy-v3-adapter action", function () {
    const deployment = readJson("../deployments/router2-quote-stack-config-bsc-testnet-97.json");
    const historicalBytecode = getHistoricalAdapterBytecode(deployment);
    const adapterAction = deployment.orderedActions.find((entry) => entry.action === "deploy-v3-adapter");

    assert.equal(adapterAction.id, 2);
    assert.equal(adapterAction.to, null);
    assert.equal(adapterAction.value, "0");
    assert.equal(historicalBytecode, adapterAction.data);
  });

  it("keeps historical deployment evidence immutable and classifies current drift", function () {
    const artifact = readJson("../artifacts/contracts/router-v2/adapters/PancakeV3ExecutionAdapter.sol/PancakeV3ExecutionAdapter.json");
    const deployment = readJson("../deployments/router2-quote-stack-config-bsc-testnet-97.json");
    const historicalBytecode = getHistoricalAdapterBytecode(deployment);

    const result = classifyArtifactStatus(artifact.bytecode, historicalBytecode);
    assert.match(result.currentHash, /^0x[0-9a-f]{64}$/);
    assert.match(result.deployedHash, /^0x[0-9a-f]{64}$/);

    if (result.status === "redeploy_required") {
      assert.equal(result.releaseReady, false);
      assert.notEqual(result.currentHash, result.deployedHash);
    } else {
      assert.equal(result.status, "match");
      assert.equal(result.releaseReady, true);
    }
  });

  it("never treats changed candidate bytecode as release-ready", function () {
    const result = classifyArtifactStatus("0x6001600055", "0x6002600055");
    assert.equal(result.status, "redeploy_required");
    assert.equal(result.releaseReady, false);
  });
});
