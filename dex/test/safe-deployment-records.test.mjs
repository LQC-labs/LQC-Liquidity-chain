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
    const [governance, risk, roles] = await Promise.all([
      readJson("governance-safe-bsc-testnet-97.json"),
      readJson("risk-safe-bsc-testnet-97.json"),
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
    assert.equal(roles.roles.GUARDIAN_ADDRESS, null);
    assert.equal(roles.roles.TREASURY_ADDRESS, null);
    assert.equal(roles.status, "PARTIAL");
  });
});
