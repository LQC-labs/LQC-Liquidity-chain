import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "mocha";
import { ethers } from "ethers";

const deploymentsUrl = new URL("../deployments/", import.meta.url);

async function readJson(name) {
  return JSON.parse(await readFile(new URL(name, deploymentsUrl), "utf8"));
}

describe("BSC testnet Safe deployment records", function () {
  it("records distinct reviewed Governance and Risk Safe roles", async function () {
    const [governance, risk, guardian, treasury, roles] = await Promise.all([
      readJson("governance-safe-bsc-testnet-97.json"),
      readJson("risk-safe-bsc-testnet-97.json"),
      readJson("emergency-guardian-safe-bsc-testnet-97.json"),
      readJson("treasury-safe-bsc-testnet-97.json"),
      readJson("safe-role-addresses-bsc-testnet-97.json"),
    ]);

    assert.equal(governance.network.chainId, 97);
    assert.equal(risk.network.chainId, 97);
    assert.equal(governance.owners.length, 7);
    assert.equal(governance.threshold, 4);
    assert.equal(risk.owners.length, 5);
    assert.equal(risk.threshold, 3);
    assert.notEqual(governance.address.toLowerCase(), risk.address.toLowerCase());
    assert.equal(ethers.getAddress(roles.roles.FACTORY_OWNER), ethers.getAddress(governance.address));
    assert.equal(ethers.getAddress(roles.roles.RISK_ADMIN), ethers.getAddress(risk.address));
    for (const operational of [risk, guardian, treasury]) {
      assert.equal(operational.owners.length, 5);
      assert.equal(operational.threshold, 3);
    }
    const safeAddresses = [governance.address, risk.address, guardian.address, treasury.address];
    assert.equal(new Set(safeAddresses.map((address) => address.toLowerCase())).size, 4);
    assert.equal(ethers.getAddress(roles.roles.GUARDIAN_ADDRESS), ethers.getAddress(guardian.address));
    assert.equal(ethers.getAddress(roles.roles.TREASURY_ADDRESS), ethers.getAddress(treasury.address));
    assert.equal(roles.status, "READY");
  });

  it("binds the read-only on-chain verification to every recorded Safe role", async function () {
    const [roles, evidence] = await Promise.all([
      readJson("safe-role-addresses-bsc-testnet-97.json"),
      readJson("safe-onchain-verification-bsc-testnet-97.json"),
    ]);
    assert.equal(evidence.network.chainId, 97);
    assert.equal(evidence.status, "VERIFIED");
    assert.equal(evidence.checks.length, 4);
    for (const check of evidence.checks) {
      const env = check.role === "governance" ? "FACTORY_OWNER"
        : check.role === "risk" ? "RISK_ADMIN"
          : check.role === "guardian" ? "GUARDIAN_ADDRESS" : "TREASURY_ADDRESS";
      assert.equal(ethers.getAddress(check.address), ethers.getAddress(roles.roles[env]));
      assert.equal(check.transactionStatus, "SUCCESS");
      assert.equal(check.factoryEventMatched, true);
      assert.equal(check.bytecodePresent, true);
      assert.ok(check.deploymentBlock <= evidence.observedBlock);
    }
  });
});
