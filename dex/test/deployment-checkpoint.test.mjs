import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkpointedDeploy, deploymentConfigHash, loadDeploymentCheckpoint } from "../scripts/deployment-checkpoint.mjs";

describe("BSC deployment checkpoints", function () {
  const deployer = "0x0000000000000000000000000000000000000001";
  const address = "0x0000000000000000000000000000000000000002";
  const artifact = { abi: [], bytecode: "0x60006000" };

  it("binds a checkpoint to constructor arguments and bytecode", function () {
    const first = deploymentConfigHash("Example", [1n, deployer], artifact.bytecode);
    assert.equal(first, deploymentConfigHash("Example", [1n, deployer], artifact.bytecode));
    assert.notEqual(first, deploymentConfigHash("Example", [2n, deployer], artifact.bytecode));
    assert.notEqual(first, deploymentConfigHash("Example", [1n, deployer], "0x6001"));
  });

  it("persists a confirmed deployment without secrets and reuses verified bytecode", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lqc-checkpoint-"));
    const file = path.join(directory, "checkpoint.local.json");
    try {
      const checkpoint = loadDeploymentCheckpoint(file, 97, deployer);
      let deployments = 0;
      const fake = { waitForDeployment: async () => {}, getAddress: async () => address,
        deploymentTransaction: () => ({ hash: `0x${"22".repeat(32)}` }) };
      const common = { key: "Example", source: "Example", args: [1n], artifact, wallet: null,
        provider: { getCode: async () => "0x6000" }, checkpoint, checkpointFile: file };
      const created = await checkpointedDeploy({ ...common, deployContract: async () => { deployments++; return fake; } });
      assert.equal(created.reused, false);
      assert.equal(deployments, 1);
      const savedText = fs.readFileSync(file, "utf8");
      assert(!savedText.includes("private"));
      const loaded = loadDeploymentCheckpoint(file, 97, deployer);
      const reused = await checkpointedDeploy({ ...common, checkpoint: loaded,
        deployContract: async () => { deployments++; return fake; } });
      assert.equal(reused.reused, true);
      assert.equal(deployments, 1);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it("rejects incompatible or missing on-chain checkpoint state", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lqc-checkpoint-"));
    const file = path.join(directory, "checkpoint.local.json");
    try {
      const configHash = deploymentConfigHash("Example", [1n], artifact.bytecode);
      const checkpoint = { version: 1, chainId: 97, deployer, contracts: {
        Example: { source: "Example", address, txHash: null, configHash }
      } };
      const common = { key: "Example", source: "Example", artifact, wallet: null, checkpoint,
        checkpointFile: file, deployContract: async () => { throw new Error("must not deploy"); } };
      await assert.rejects(() => checkpointedDeploy({ ...common, args: [2n], provider: { getCode: async () => "0x6000" } }), /mismatch/);
      await assert.rejects(() => checkpointedDeploy({ ...common, args: [1n], provider: { getCode: async () => "0x" } }), /no on-chain bytecode/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
});
