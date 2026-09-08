import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

describe("BscScan verification bundle", function () {
  it("pins compiler settings and constructor arguments for each core deployment", function () {
    const address = n => `0x${n.toString(16).padStart(40, "0")}`;
    const contracts = {
      wbnb: { address: address(1) }, factory: { address: address(2) }, router: { address: address(3) },
      dexRegistry: { address: address(4) }, timelock: { address: address(5) }, riskRegistry: { address: address(6) },
      emergencyController: { address: address(7) }, quoteRouter: { address: address(8) }, executionRouter: { address: address(9) },
      nativeRouter: { address: address(10) }, splitOptimizer: { address: address(11) }, autoRouter: { address: address(12) },
      gasCostOracle: { address: address(13) }, flowAdapter: { address: address(14) }
    };
    const deployment = {
      network: { chainId: 97 }, deployer: address(20), owner: address(21), sourceRevision: "test-commit",
      dexRegistryOwnership: { timelockDelaySeconds: 3600 }, contracts
    };
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), "lqc-verification-"));
    const record = path.join(temp, "deployment.json");
    fs.writeFileSync(record, JSON.stringify(deployment));
    const dexRoot = path.resolve(import.meta.dirname, "..");
    const output = path.join(dexRoot, "verification", "bsc-testnet-97");
    try {
      execFileSync(process.execPath, [path.join(dexRoot, "scripts", "prepare-bscscan-verification.mjs"), record]);
      const manifest = JSON.parse(fs.readFileSync(path.join(output, "manifest.json"), "utf8"));
      const input = JSON.parse(fs.readFileSync(path.join(output, "standard-input.json"), "utf8"));
      assert.equal(manifest.chainId, 97);
      assert.equal(manifest.sourceRevision, "test-commit");
      assert.equal(manifest.contracts.length, 13);
      assert.ok(manifest.contracts.every(item => /^0x[0-9a-fA-F]{40}$/.test(item.address)));
      assert.ok(manifest.contracts.every(item => /^[0-9a-f]*$/.test(item.constructorArguments)));
      assert.equal(input.settings.optimizer.runs, 200);
      assert.equal(input.settings.viaIR, true);
      assert.equal(input.settings.evmVersion, "shanghai");
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
      fs.rmSync(path.join(dexRoot, "verification"), { recursive: true, force: true });
    }
  });
});
