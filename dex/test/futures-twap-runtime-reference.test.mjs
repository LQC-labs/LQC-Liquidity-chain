import assert from "node:assert/strict";
import fs from "node:fs";
import anvil from "./support/anvil-compat.mjs";
import { ethers } from "ethers";
import { twapTickToScaledPrice } from "../scripts/futures-twap-price-conversion.mjs";

const artifact = (name, source) => JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)));
async function deploy(signer, name, source, args = []) {
  const a = artifact(name, source);
  const c = await new ethers.ContractFactory(a.abi, a.bytecode, signer).deploy(...args);
  await c.waitForDeployment();
  return c;
}

describe("LQC V3 TWAP runtime reference adapter", function () {
  let provider, owner, index, quote, pool;
  beforeEach(async function () {
    provider = new ethers.BrowserProvider(anvil.provider({ chain: { chainId: 97 }, logging: { quiet: true } }));
    owner = await provider.getSigner(0);
    index = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Index", "IDX"]);
    quote = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Quote", "USD"]);
    pool = await deploy(owner, "MockV3TwapPool", "futures/mocks/MockV3TwapPool", [await index.getAddress(), await quote.getAddress()]);
    await (await pool.setState(1_000_000, 2n ** 96n, 0, 2, true, true, 0, 0)).wait();
  });

  async function adapter(indexToken = index, quoteToken = quote, minLiquidity = 500_000) {
    return deploy(owner, "LQCV3TwapReferenceAdapter", "futures/LQCV3TwapReferenceAdapter", [
      await indexToken.getAddress(), await quoteToken.getAddress()
    ].length ? [await pool.getAddress(), await indexToken.getAddress(), await quoteToken.getAddress(), 300, minLiquidity] : []);
  }

  it("matches the existing integer TWAP conversion for positive, zero and negative ticks", async function () {
    const ref = await adapter();
    for (const tick of [-600, -1, 0, 1, 600]) {
      await (await pool.setState(1_000_000, 2n ** 96n, tick, 2, true, true, 0, tick * 300)).wait();
      const [, answer] = await ref.latestRoundData();
      const expected = twapTickToScaledPrice({
        tick, token0: await index.getAddress(), token1: await quote.getAddress(),
        indexToken: await index.getAddress(), quoteToken: await quote.getAddress(),
        token0Decimals: 18, token1Decimals: 18,
      });
      assert.equal(answer, expected);
    }
  });

  it("fails closed for shallow liquidity, locked/uninitialized pools and missing observations", async function () {
    const ref = await adapter();
    for (const state of [
      [499_999, 2n ** 96n, 0, 2, true, true],
      [1_000_000, 0, 0, 2, true, true],
      [1_000_000, 2n ** 96n, 0, 2, false, true],
      [1_000_000, 2n ** 96n, 0, 1, true, true],
      [1_000_000, 2n ** 96n, 0, 2, true, false],
    ]) {
      await (await pool.setState(...state, 0, 0)).wait();
      await assert.rejects(ref.latestRoundData());
    }
  });

  it("produces a complete AggregatorV3 round consumable by the Futures circuit breaker", async function () {
    const ref = await adapter();
    const primary = await deploy(owner, "MockAggregatorV3", "futures/mocks/MockAggregatorV3", [18]);
    const oracle = await deploy(owner, "LQCAggregatorOracleAdapter", "futures/LQCAggregatorOracleAdapter", [await owner.getAddress()]);
    const now = BigInt((await provider.getBlock("latest")).timestamp);
    await (await primary.setRoundData(1, ethers.parseEther("1"), now, 1)).wait();
    await (await oracle.setFeed(await index.getAddress(), await primary.getAddress(), 300)).wait();
    await (await oracle.setCircuitBreaker(await index.getAddress(), await ref.getAddress(), 100)).wait();
    const [price] = await oracle.getPrice(await index.getAddress());
    assert.equal(price, ethers.parseEther("1"));
  });
});
