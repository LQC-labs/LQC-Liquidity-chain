import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";

const readJson = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));

function findHistoricalAdapterBytecode(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.bytecode === "string" && value.bytecode.startsWith("0x") && value.bytecode.length > 100) return value.bytecode;
  for (const child of Object.values(value)) {
    const found = findHistoricalAdapterBytecode(child);
    if (found) return found;
  }
  return null;
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
  it("keeps historical deployment evidence immutable and classifies current drift", function () {
    const artifact = readJson("../artifacts/contracts/router-v2/adapters/PancakeV3ExecutionAdapter.sol/PancakeV3ExecutionAdapter.json");
    const deployment = readJson("../deployments/router2-quote-stack-config-bsc-testnet-97.json");
    const historicalBytecode = findHistoricalAdapterBytecode(deployment);
    assert.ok(historicalBytecode, "historical V3 adapter deployment bytecode must remain recorded");

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
