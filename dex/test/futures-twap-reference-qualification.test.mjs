import assert from "node:assert/strict";
import fs from "node:fs";
import anvil from "./support/anvil-compat.mjs";
import { ethers } from "ethers";
import {
  preflightFuturesTwapReference,
  validateTwapReferenceConfig,
} from "../scripts/preflight-futures-twap-reference.mjs";

const artifact = (name, source) => JSON.parse(
  fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url))
);
async function deploy(signer, name, source, args = []) {
  const a = artifact(name, source);
  const contract = await new ethers.ContractFactory(a.abi, a.bytecode, signer).deploy(...args);
  await contract.waitForDeployment();
  return contract;
}

describe("Futures V3 TWAP reference-source qualification", function () {
  let provider, owner, index, quote, pool, env;

  beforeEach(async function () {
    provider = new ethers.BrowserProvider(anvil.provider({ chain: { chainId: 97 } }));
    owner = await provider.getSigner(0);
    index = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Mock BTC", "mBTC"]);
    quote = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Mock USD", "mUSD"]);
    pool = await deploy(owner, "MockV3TwapPool", "futures/mocks/MockV3TwapPool", [
      await index.getAddress(), await quote.getAddress(),
    ]);
    await (await pool.setState(1_000_000, 2n ** 96n, 20, 2, true, true, 0, 6_000)).wait();
    env = {
      FUTURES_TWAP_POOL: await pool.getAddress(),
      FUTURES_TWAP_INDEX_TOKEN: await index.getAddress(),
      FUTURES_TWAP_QUOTE_TOKEN: await quote.getAddress(),
      FUTURES_TWAP_WINDOW: "300",
      FUTURES_TWAP_MIN_LIQUIDITY: "500000",
    };
  });

  it("qualifies only the exact liquid pair with usable history", async function () {
    const result = await preflightFuturesTwapReference(env, provider);
    assert.equal(result.status, "READ_ONLY_TWAP_SOURCE_QUALIFIED");
    assert.equal(result.activationAuthorized, false);
    assert.equal(result.pool.arithmeticMeanTick, "20");
    assert.equal(result.pool.observationCardinality, 2);
  });

  it("fails closed on the wrong chain and wrong token pair", async function () {
    const wrongChain = new ethers.BrowserProvider(anvil.provider({ chain: { chainId: 56 } }));
    await assert.rejects(preflightFuturesTwapReference(env, wrongChain), /chainId 97/);
    const other = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Other", "OTHER"]);
    await assert.rejects(
      preflightFuturesTwapReference({ ...env, FUTURES_TWAP_INDEX_TOKEN: await other.getAddress() }, provider),
      /does not exactly match/,
    );
  });

  it("rejects shallow, uninitialized, locked, or history-deficient pools", async function () {
    for (const state of [
      [499_999, 2n ** 96n, 20, 2, true, true],
      [1_000_000, 0, 20, 2, true, true],
      [1_000_000, 2n ** 96n, 20, 2, false, true],
      [1_000_000, 2n ** 96n, 20, 1, true, true],
      [1_000_000, 2n ** 96n, 20, 2, true, false],
    ]) {
      await (await pool.setState(...state, 0, 6_000)).wait();
      await assert.rejects(preflightFuturesTwapReference(env, provider));
    }
  });

  it("floors negative non-integral arithmetic mean ticks", async function () {
    await (await pool.setState(1_000_000, 2n ** 96n, -1, 2, true, true, 0, -301)).wait();
    const result = await preflightFuturesTwapReference(env, provider);
    assert.equal(result.pool.arithmeticMeanTick, "-2");
  });

  it("rejects malformed windows, liquidity bounds, and duplicate tokens", function () {
    assert.throws(() => validateTwapReferenceConfig({ ...env, FUTURES_TWAP_WINDOW: "299" }), /at least 300/);
    assert.throws(() => validateTwapReferenceConfig({ ...env, FUTURES_TWAP_MIN_LIQUIDITY: "0" }), /positive integer/);
    assert.throws(() => validateTwapReferenceConfig({ ...env, FUTURES_TWAP_QUOTE_TOKEN: env.FUTURES_TWAP_INDEX_TOKEN }), /distinct/);
  });
});
