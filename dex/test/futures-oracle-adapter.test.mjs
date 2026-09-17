import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
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

  beforeEach(async function () {
    provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
    owner = await provider.getSigner(0);
    outsider = await provider.getSigner(1);
    token = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Mock BTC", "mBTC"]);
  });

  const fixture = async (decimals) => {
    const adapter = await deploy(owner, "LQCAggregatorOracleAdapter", "futures/LQCAggregatorOracleAdapter", [await owner.getAddress()]);
    const feed = await deploy(owner, "MockAggregatorV3", "futures/mocks/MockAggregatorV3", [decimals]);
    await (await adapter.setFeed(await token.getAddress(), await feed.getAddress())).wait();
    return { adapter, feed };
  };

  it("normalizes an 8-decimal feed to 1e18", async function () {
    const { adapter, feed } = await fixture(8);
    const now = BigInt((await provider.getBlock("latest")).timestamp);
    await (await feed.setRoundData(10, 50_000n * 10n ** 8n, now, 10)).wait();
    const [price, updatedAt] = await adapter.getPrice(await token.getAddress());
    assert.equal(price, ethers.parseEther("50000"));
    assert.equal(updatedAt, now);
  });

  it("keeps an 18-decimal feed unchanged", async function () {
    const { adapter, feed } = await fixture(18);
    const now = BigInt((await provider.getBlock("latest")).timestamp);
    const answer = ethers.parseEther("2500");
    await (await feed.setRoundData(1, answer, now, 1)).wait();
    const [price] = await adapter.getPrice(await token.getAddress());
    assert.equal(price, answer);
  });

  it("downscales feeds above 18 decimals", async function () {
    const { adapter, feed } = await fixture(20);
    const now = BigInt((await provider.getBlock("latest")).timestamp);
    await (await feed.setRoundData(2, 1234n * 10n ** 20n, now, 2)).wait();
    const [price] = await adapter.getPrice(await token.getAddress());
    assert.equal(price, ethers.parseEther("1234"));
  });

  it("rejects zero and negative answers", async function () {
    const { adapter, feed } = await fixture(8);
    const now = BigInt((await provider.getBlock("latest")).timestamp);
    await (await feed.setRoundData(1, 0, now, 1)).wait();
    await assert.rejects(adapter.getPrice(await token.getAddress()));
    await (await feed.setRoundData(2, -1, now, 2)).wait();
    await assert.rejects(adapter.getPrice(await token.getAddress()));
  });

  it("rejects invalid timestamps and incomplete rounds", async function () {
    const { adapter, feed } = await fixture(8);
    const now = BigInt((await provider.getBlock("latest")).timestamp);
    await (await feed.setRoundData(3, 100n * 10n ** 8n, 0, 3)).wait();
    await assert.rejects(adapter.getPrice(await token.getAddress()));
    await (await feed.setRoundData(4, 100n * 10n ** 8n, now, 3)).wait();
    await assert.rejects(adapter.getPrice(await token.getAddress()));
  });

  it("rejects unsupported feed decimals", async function () {
    const { adapter, feed } = await fixture(37);
    const now = BigInt((await provider.getBlock("latest")).timestamp);
    await (await feed.setRoundData(1, 1, now, 1)).wait();
    await assert.rejects(adapter.getPrice(await token.getAddress()));
  });

  it("only allows the adapter owner to configure feeds", async function () {
    const adapter = await deploy(owner, "LQCAggregatorOracleAdapter", "futures/LQCAggregatorOracleAdapter", [await owner.getAddress()]);
    const feed = await deploy(owner, "MockAggregatorV3", "futures/mocks/MockAggregatorV3", [8]);
    await assert.rejects(adapter.connect(outsider).setFeed(await token.getAddress(), await feed.getAddress()));
  });
});
