import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ethers } from "ethers";
import { prepareRoleAddressReview } from "../scripts/prepare-role-address-review.mjs";

describe("BscScan verification bundle", function () {
  it("pins compiler settings and constructor arguments for each core deployment", function () {
    const address = n => `0x${n.toString(16).padStart(40, "0")}`;
    const tx = n => `0x${n.toString(16).padStart(64, "0")}`;
    const contracts = {
      lqc: { address: address(18) }, mockUsdt: { address: address(19) },
      wbnb: { address: address(1) }, factory: { address: address(2) }, router: { address: address(3) },
      dexRegistry: { address: address(4) }, timelock: { address: address(5) }, riskRegistry: { address: address(6) },
      emergencyController: { address: address(7) }, quoteRouter: { address: address(8) }, executionRouter: { address: address(9) },
      nativeRouter: { address: address(10) }, splitOptimizer: { address: address(11) }, autoRouter: { address: address(12) },
      gasCostOracle: { address: address(13) }, flowAdapter: { address: address(14) },
      liquidityVault: { address: address(15), asset: address(16), depositCap: "100000000000000000000000" },
      idleStrategyAdapter: { address: address(17), asset: address(16), vault: address(15) }
    };
    let txIndex = 1;
    for (const item of Object.values(contracts)) {
      if (item !== contracts.wbnb) item.deploymentTx = tx(txIndex++);
    }
    const deployment = {
      generatedAt: "2026-09-09T00:00:00.000Z", network: { chainId: 97 }, deployer: address(20),
      owner: address(21), riskAdmin: address(22), guardian: address(23), treasury: address(24), sourceRevision: "a".repeat(40),
      compiler: { version: "0.8.30", optimizer: { enabled: true, runs: 200 }, viaIR: true, evmVersion: "shanghai" },
      dexRegistryOwnership: { timelockDelaySeconds: 3600 }, contracts
    };
    const owners=(start,count)=>Array.from({length:count},(_,index)=>address(start+index));
    deployment.multisigPolicies={governance:{address:deployment.owner,threshold:4,owners:owners(30,7)},risk:{address:deployment.riskAdmin,threshold:3,owners:owners(40,5)},guardian:{address:deployment.guardian,threshold:3,owners:owners(50,5)},treasury:{address:deployment.treasury,threshold:3,owners:owners(60,5)}};
    deployment.roleReviewFingerprint=prepareRoleAddressReview({schemaVersion:1,network:'bsc-testnet',chainId:97,deployerAddress:deployment.deployer,roles:{governance:{address:deployment.owner,threshold:4,signerCount:7},risk:{address:deployment.riskAdmin,threshold:3,signerCount:5},guardian:{address:deployment.guardian,threshold:3,signerCount:5},treasury:{address:deployment.treasury,threshold:3,signerCount:5}}}).reviewFingerprint;
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
      assert.equal(manifest.sourceRevision, "a".repeat(40));
      assert.equal(manifest.roleReviewFingerprint, deployment.roleReviewFingerprint);
      assert.equal(manifest.contracts.length, 15);
      assert.ok(manifest.contracts.every(item => /^0x[0-9a-fA-F]{40}$/.test(item.address)));
      assert.ok(manifest.contracts.every(item => /^[0-9a-f]*$/.test(item.constructorArguments)));
      assert.equal(input.settings.optimizer.runs, 200);
      assert.equal(input.settings.viaIR, true);
      assert.equal(input.settings.evmVersion, "shanghai");
      const risk = manifest.contracts.find(item => item.key === "riskRegistry");
      assert.equal(risk.constructorArguments,
        ethers.AbiCoder.defaultAbiCoder().encode(["address", "address"], [address(20), address(22)]).slice(2));
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
      fs.rmSync(path.join(dexRoot, "verification"), { recursive: true, force: true });
    }
  });
});
