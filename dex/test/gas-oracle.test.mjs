import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source) => JSON.parse(fs.readFileSync(
  new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)
));

describe("LQC gas-cost oracle", function () {
  let provider, owner, other, wrappedNative, tokenOut, Oracle, Feed;

  beforeEach(async function () {
    provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
    owner = await provider.getSigner(0);
    other = await provider.getSigner(1);
    const Token = new ethers.ContractFactory(
      artifact("MockERC20", "mocks/MockERC20").abi,
      artifact("MockERC20", "mocks/MockERC20").bytecode,
      owner
    );
    wrappedNative = await Token.deploy("Wrapped BNB", "WBNB");
    tokenOut = await Token.deploy("USD Token", "USDT");
    await Promise.all([wrappedNative.waitForDeployment(), tokenOut.waitForDeployment()]);
    Oracle = new ethers.ContractFactory(
      artifact("LQCGasCostOracle", "router-v2/LQCGasCostOracle").abi,
      artifact("LQCGasCostOracle", "router-v2/LQCGasCostOracle").bytecode,
      owner
    );
    Feed = new ethers.ContractFactory(
      artifact("MockPriceFeed", "mocks/MockPriceFeed").abi,
      artifact("MockPriceFeed", "mocks/MockPriceFeed").bytecode,
      owner
    );
  });

  it("converts BNB gas into output-token units after dual-feed validation", async function () {
    const oracle = await Oracle.deploy(await owner.getAddress(), await wrappedNative.getAddress());
    const bnbPrimary = await Feed.deploy(8, 600_00000000n);
    const bnbSecondary = await Feed.deploy(8, 606_00000000n);
    const usdPrimary = await Feed.deploy(8, 1_00000000n);
    const usdSecondary = await Feed.deploy(8, 1_00500000n);
    await Promise.all([oracle.waitForDeployment(), bnbPrimary.waitForDeployment(), bnbSecondary.waitForDeployment(), usdPrimary.waitForDeployment(), usdSecondary.waitForDeployment()]);
    await (await oracle.configureFeed(await wrappedNative.getAddress(), await bnbPrimary.getAddress(), await bnbSecondary.getAddress(), 3600, 200, 18)).wait();
    await (await oracle.configureFeed(await tokenOut.getAddress(), await usdPrimary.getAddress(), await usdSecondary.getAddress(), 3600, 200, 18)).wait();

    const cost = await oracle.quoteGasCost(await tokenOut.getAddress(), 200_000n, 3_000_000_000n);
    assert.equal(cost, ethers.parseEther("0.36"));
    const costs = await oracle.quoteRouteCosts(await tokenOut.getAddress(), [100_000n, 200_000n], 3_000_000_000n);
    assert.deepEqual(Array.from(costs), [ethers.parseEther("0.18"), ethers.parseEther("0.36")]);
  });

  it("rejects stale, divergent, disabled, and unauthorized feed changes", async function () {
    const oracle = await Oracle.deploy(await owner.getAddress(), await wrappedNative.getAddress());
    const primary = await Feed.deploy(8, 600_00000000n);
    const secondary = await Feed.deploy(8, 900_00000000n);
    await Promise.all([oracle.waitForDeployment(), primary.waitForDeployment(), secondary.waitForDeployment()]);
    await assert.rejects(oracle.connect(other).configureFeed(
      await wrappedNative.getAddress(), await primary.getAddress(), await secondary.getAddress(), 3600, 200, 18
    ));
    await (await oracle.configureFeed(
      await wrappedNative.getAddress(), await primary.getAddress(), await secondary.getAddress(), 3600, 200, 18
    )).wait();
    await (await oracle.configureFeed(
      await tokenOut.getAddress(), await primary.getAddress(), await secondary.getAddress(), 3600, 200, 18
    )).wait();
    await assert.rejects(oracle.quoteGasCost(await tokenOut.getAddress(), 100_000n, 1n));

    // Explicit limits avoid intermittent Ganache/ethers underestimation on storage updates in CI.
    await (await secondary.setAnswer(603_00000000n, { gasLimit: 100_000 })).wait();
    await (await primary.setUpdatedAt(1, { gasLimit: 100_000 })).wait();
    await assert.rejects(oracle.quoteGasCost(await tokenOut.getAddress(), 100_000n, 1n));
    await (await oracle.setFeedEnabled(await tokenOut.getAddress(), false, { gasLimit: 100_000 })).wait();
    await assert.rejects(oracle.quoteGasCost(await tokenOut.getAddress(), 100_000n, 1n));
  });
});
