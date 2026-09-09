import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkpointedDeploy, checkpointedTransaction, deploymentConfigHash, loadDeploymentCheckpoint, operationConfigHash } from "../scripts/deployment-checkpoint.mjs";

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

  it("records pending transaction hashes before confirmation and skips confirmed operations", async function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lqc-checkpoint-"));
    const file = path.join(directory, "checkpoint.local.json");
    try {
      const checkpoint = loadDeploymentCheckpoint(file, 97, deployer);
      let sends = 0;
      const txHash = `0x${"33".repeat(32)}`;
      const first = await checkpointedTransaction({ key: "registry.configure", checkpoint, checkpointFile: file,
        provider: {}, sendTransaction: async () => { sends++; return { hash: txHash, wait: async () => ({ status: 1 }) }; } });
      assert.equal(first.reused, false);
      assert.equal(loadDeploymentCheckpoint(file, 97, deployer).operations["registry.configure"].status, "confirmed");
      const second = await checkpointedTransaction({ key: "registry.configure", checkpoint, checkpointFile: file,
        provider: {}, sendTransaction: async () => { sends++; } });
      assert.equal(second.reused, true);
      assert.equal(sends, 1);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it("recovers a confirmed pending operation and rejects missing or reverted receipts", async function () {
    const txHash = `0x${"44".repeat(32)}`;
    const makeCheckpoint = () => ({ version: 1, chainId: 97, deployer, contracts: {}, operations: {
      configure: { status: "pending", txHash, configHash: operationConfigHash("configure", []), sentAt: new Date(0).toISOString() }
    } });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lqc-checkpoint-"));
    const file = path.join(directory, "checkpoint.local.json");
    try {
      const confirmed = makeCheckpoint();
      const result = await checkpointedTransaction({ key: "configure", checkpoint: confirmed, checkpointFile: file,
        provider: { getTransactionReceipt: async () => ({ status: 1 }) }, sendTransaction: async () => {} });
      assert.equal(result.reused, true);
      await assert.rejects(() => checkpointedTransaction({ key: "configure", checkpoint: makeCheckpoint(), checkpointFile: file,
        provider: { getTransactionReceipt: async () => null }, sendTransaction: async () => {} }), /still pending/);
      await assert.rejects(() => checkpointedTransaction({ key: "configure", checkpoint: makeCheckpoint(), checkpointFile: file,
        provider: { getTransactionReceipt: async () => ({ status: 0 }) }, sendTransaction: async () => {} }), /reverted/);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it("never reuses a transaction checkpoint with different settings", async function () {
    const checkpoint = { version: 1, chainId: 97, deployer, contracts: {}, operations: {
      limits: { status: "confirmed", txHash: `0x${"55".repeat(32)}`, configHash: operationConfigHash("limits", [100n]) }
    } };
    await assert.rejects(() => checkpointedTransaction({ key: "limits", config: [200n], checkpoint,
      checkpointFile: "unused", provider: {}, sendTransaction: async () => {} }), /current configuration/);
  });
});
