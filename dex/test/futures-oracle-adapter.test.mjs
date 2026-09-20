import assert from "node:assert/strict";
import fs from "node:fs";
import anvil from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact = (name, source) => JSON.parse(
  fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url))
);

const deploy = async (signer, name, source, args = []) => {
  const a = artifact(name, source);
  const c = await new ethers.ContractFactory(a.abi, a.bytecode, signer).deploy(...args);
  await c.waitForDeployment();
  return c;
};

describe("LQC Futures Aggregator Oracle Adapter", function () {
  let provider, owner, outsider, token;
  const HEARTBEAT = 300;

  beforeEach(async function () {
    provider = new ethers.BrowserProvider(anvil.provider({ logging: { quiet: true } }));
    owner = await provider.getSigner(0);
    outsider = await provider.getSigner(1);
    token = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Mock BTC", "mBTC"]);
  });

  const fixture = async (decimals, heartbeat = HEARTBEAT) => {
    const adapter = await deploy(owner, "LQCAggregatorOracleAdapter", "futures/LQCAggregatorOracleAdapter", [await owner.getAddress()]);
    const feed = await deploy(owner, "MockAggregatorV3", "futures/mocks/MockAggregatorV3", [decimals]);
    await (await adapter.setFeed(await token.getAddress(), await feed.getAddress(), heartbeat)).wait();
    return { adapter, feed };
  };

  it("normalizes feeds below, at, and above 18 decimals", async function () {
    for (const [decimals, answer, expected] of [
      [8, 50_000n * 10n ** 8n, ethers.parseEther("50000")],
      [18, ethers.parseEther("2500"), ethers.parseEther("2500")],
      [20, 1234n * 10n ** 20n, ethers.parseEther("1234")],
    ]) {
      const { adapter, feed } = await fixture(decimals);
      const now = BigInt((await provider.getBlock("latest")).timestamp);
      await (await feed.setRoundData(10, answer, now, 10)).wait();
      const [price, updatedAt] = await adapter.getPrice(await token.getAddress());
      assert.equal(price, expected);
      assert.equal(updatedAt, now);
    }
  });

  it("rejects zero, negative, and sub-1e18 normalized answers", async function () {
    for (const [decimals, answer] of [[8, 0n], [8, -1n], [36, 1n]]) {
      const { adapter, feed } = await fixture(decimals);
      const now = BigInt((await provider.getBlock("latest")).timestamp);
      await (await feed.setRoundData(1, answer, now, 1)).wait();
      await assert.rejects(adapter.getPrice(await token.getAddress()));
    }
  });

  it("rejects invalid timestamps, incomplete rounds, and stale prices", async function () {
    const { adapter, feed } = await fixture(8, 120);
    const now = BigInt((await provider.getBlock("latest")).timestamp);
    for (const [roundId, updatedAt, answeredInRound] of [
      [3, 0n, 3],
      [4, now, 3],
      [5, now - 121n, 5],
      [6, now + 1n, 6],
    ]) {
      await (await feed.setRoundData(roundId, 100n * 10n ** 8n, updatedAt, answeredInRound)).wait();
      await assert.rejects(adapter.getPrice(await token.getAddress()));
    }
  });

  it("accepts bounded primary/reference deviation and rejects excess", async function () {
    const { adapter, feed } = await fixture(8);
    const reference = await deploy(owner, "MockAggregatorV3", "futures/mocks/MockAggregatorV3", [8]);
    const now = BigInt((await provider.getBlock("latest")).timestamp);
    await (await feed.setRoundData(10, 100n * 10n ** 8n, now, 10)).wait();
    await (await reference.setRoundData(10, 99n * 10n ** 8n, now, 10)).wait();
    await (await adapter.setCircuitBreaker(await token.getAddress(), await reference.getAddress(), 200)).wait();
    assert.equal((await adapter.getPrice(await token.getAddress()))[0], ethers.parseEther("100"));
    await (await feed.setRoundData(11, 110n * 10n ** 8n, now, 11)).wait();
    await assert.rejects(adapter.getPrice(await token.getAddress()));
  });

  it("rejects a stale reference feed", async function () {
    const { adapter, feed } = await fixture(8, 120);
    const reference = await deploy(owner, "MockAggregatorV3", "futures/mocks/MockAggregatorV3", [8]);
    const now = BigInt((await provider.getBlock("latest")).timestamp);
    await (await feed.setRoundData(12, 100n * 10n ** 8n, now, 12)).wait();
    await (await reference.setRoundData(12, 100n * 10n ** 8n, now - 121n, 12)).wait();
    await (await adapter.setCircuitBreaker(await token.getAddress(), await reference.getAddress(), 500)).wait();
    await assert.rejects(adapter.getPrice(await token.getAddress()));
  });

  it("clears stale circuit-breaker state when the primary feed policy changes", async function () {
    const { adapter, feed } = await fixture(8);
    const replacement = await deploy(owner, "MockAggregatorV3", "futures/mocks/MockAggregatorV3", [8]);
    const reference = await deploy(owner, "MockAggregatorV3", "futures/mocks/MockAggregatorV3", [8]);
    await (await adapter.setCircuitBreaker(await token.getAddress(), await reference.getAddress(), 500)).wait();
    await (await adapter.setFeed(await token.getAddress(), await replacement.getAddress(), HEARTBEAT)).wait();
    const config = await adapter.feedConfigs(await token.getAddress());
    assert.equal(config.feed, await replacement.getAddress());
    assert.equal(config.referenceFeed, ethers.ZeroAddress);
    assert.equal(config.maxDeviationBps, 0n);
    assert.notEqual(config.feed, await feed.getAddress());
  });

  it("supports an explicit circuit-breaker reset", async function () {
    const { adapter } = await fixture(8);
    const reference = await deploy(owner, "MockAggregatorV3", "futures/mocks/MockAggregatorV3", [8]);
    await (await adapter.setCircuitBreaker(await token.getAddress(), await reference.getAddress(), 500)).wait();
    await (await adapter.clearCircuitBreaker(await token.getAddress())).wait();
    const config = await adapter.feedConfigs(await token.getAddress());
    assert.equal(config.referenceFeed, ethers.ZeroAddress);
    assert.equal(config.maxDeviationBps, 0n);
  });

  it("rejects invalid feed and circuit-breaker configuration", async function () {
    const adapter = await deploy(owner, "LQCAggregatorOracleAdapter", "futures/LQCAggregatorOracleAdapter", [await owner.getAddress()]);
    const feed = await deploy(owner, "MockAggregatorV3", "futures/mocks/MockAggregatorV3", [8]);
    const reference = await deploy(owner, "MockAggregatorV3", "futures/mocks/MockAggregatorV3", [8]);
    await assert.rejects(adapter.setFeed(ethers.ZeroAddress, await feed.getAddress(), HEARTBEAT));
    await assert.rejects(adapter.setFeed(await token.getAddress(), ethers.ZeroAddress, HEARTBEAT));
    await assert.rejects(adapter.setFeed(await token.getAddress(), await feed.getAddress(), 0));
    await assert.rejects(adapter.setFeed(await token.getAddress(), await feed.getAddress(), 86_401));
    await assert.rejects(adapter.setCircuitBreaker(await token.getAddress(), await reference.getAddress(), 500));
    await (await adapter.setFeed(await token.getAddress(), await feed.getAddress(), HEARTBEAT)).wait();
    await assert.rejects(adapter.setCircuitBreaker(await token.getAddress(), ethers.ZeroAddress, 500));
    await assert.rejects(adapter.setCircuitBreaker(await token.getAddress(), await feed.getAddress(), 500));
    await assert.rejects(adapter.setCircuitBreaker(await token.getAddress(), await reference.getAddress(), 0));
    await assert.rejects(adapter.setCircuitBreaker(await token.getAddress(), await reference.getAddress(), 5001));
  });

  it("rejects unsupported feed decimals", async function () {
    const { adapter, feed } = await fixture(37);
    const now = BigInt((await provider.getBlock("latest")).timestamp);
    await (await feed.setRoundData(1, 1, now, 1)).wait();
    await assert.rejects(adapter.getPrice(await token.getAddress()));
  });

  it("enforces two-step ownership for all configuration paths", async function () {
    const { adapter, feed } = await fixture(8);
    const replacement = await deploy(owner, "MockAggregatorV3", "futures/mocks/MockAggregatorV3", [8]);
    await assert.rejects(adapter.connect(outsider).setFeed(await token.getAddress(), await replacement.getAddress(), HEARTBEAT));
    await assert.rejects(adapter.connect(outsider).transferOwnership(await outsider.getAddress()));
    await (await adapter.transferOwnership(await outsider.getAddress())).wait();
    assert.equal(await adapter.pendingOwner(), await outsider.getAddress());
    await assert.rejects(adapter.acceptOwnership());
    await (await adapter.connect(outsider).acceptOwnership()).wait();
    assert.equal(await adapter.owner(), await outsider.getAddress());
    assert.equal(await adapter.pendingOwner(), ethers.ZeroAddress);
    await assert.rejects(adapter.setFeed(await token.getAddress(), await feed.getAddress(), HEARTBEAT));
    await (await adapter.connect(outsider).setFeed(await token.getAddress(), await feed.getAddress(), HEARTBEAT)).wait();
  });
});
