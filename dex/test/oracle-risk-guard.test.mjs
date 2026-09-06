import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source = name) => JSON.parse(
  fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url))
);

describe("LQC dual-source oracle risk guard", function () {
  let eip1193, provider, owner, outsider, token, primary, secondary, guard;
  const ONE_USD = ethers.parseEther("1");

  beforeEach(async function () {
    eip1193 = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 2 } });
    provider = new ethers.BrowserProvider(eip1193);
    owner = await provider.getSigner(0);
    outsider = await provider.getSigner(1);
    token = ethers.Wallet.createRandom().address;
    const Source = new ethers.ContractFactory(
      artifact("MockPriceSource", "mocks/MockPriceSource").abi,
      artifact("MockPriceSource", "mocks/MockPriceSource").bytecode, owner
    );
    primary = await Source.deploy();
    secondary = await Source.deploy();
    const Guard = new ethers.ContractFactory(artifact("LQCOracleRiskGuard").abi, artifact("LQCOracleRiskGuard").bytecode, owner);
    guard = await Guard.deploy(await owner.getAddress());
    await Promise.all([primary.waitForDeployment(), secondary.waitForDeployment(), guard.waitForDeployment()]);
  });

  async function configure({ sourceDeviationBps = 1000, pegDeviationBps = 0, pegPrice = 0n } = {}) {
    await (await guard.setAssetConfig(token, [
      await primary.getAddress(), await secondary.getAddress(), pegPrice, 3600, sourceDeviationBps, pegDeviationBps, true
    ])).wait();
  }

  async function setPrices(primaryPrice, secondaryPrice, age = 0) {
    const block = await provider.getBlock("latest");
    const timestamp = BigInt(block.timestamp - age);
    await (await primary.setPrice(primaryPrice, timestamp)).wait();
    await (await secondary.setPrice(secondaryPrice, timestamp)).wait();
  }

  it("accepts fresh dual-source prices within the configured deviation", async function () {
    await configure();
    await setPrices(ONE_USD, ethers.parseEther("1.05"));
    const prices = await guard.validateAsset(token);
    assert.equal(prices.primaryPrice, ONE_USD);
  });

  it("rejects stale, future, zero, and unavailable observations", async function () {
    await configure();
    await setPrices(ONE_USD, ONE_USD, 3601);
    await assert.rejects(guard.validateAsset(token));
    await setPrices(0n, ONE_USD);
    await assert.rejects(guard.validateAsset(token));
    await (await primary.setShouldRevert(true)).wait();
    await assert.rejects(guard.validateAsset(token));
  });

  it("rejects source divergence above the 10 percent pilot threshold", async function () {
    await configure({ sourceDeviationBps: 1000 });
    await setPrices(ONE_USD, ethers.parseEther("1.11"));
    await assert.rejects(guard.validateAsset(token));
  });

  it("rejects a stablecoin source outside the 3 percent peg band", async function () {
    await configure({ pegPrice: ONE_USD, pegDeviationBps: 300 });
    await setPrices(ethers.parseEther("0.96"), ethers.parseEther("0.97"));
    await assert.rejects(guard.validateAsset(token));
  });

  it("restricts configuration and ownership transfer", async function () {
    await assert.rejects(guard.connect(outsider).setAssetConfig(token, [
      await primary.getAddress(), await secondary.getAddress(), 0, 3600, 1000, 0, true
    ]));
    await assert.rejects(guard.setAssetConfig(token, [
      await primary.getAddress(), await primary.getAddress(), 0, 3600, 1000, 0, true
    ]));
    await (await guard.transferOwnership(await outsider.getAddress())).wait();
    await (await guard.connect(outsider).acceptOwnership()).wait();
    assert.equal(await guard.owner(), await outsider.getAddress());
  });
});
