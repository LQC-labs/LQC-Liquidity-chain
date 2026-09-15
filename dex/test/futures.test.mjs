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

describe("LQC Flow Futures MVP", function () {
  let provider, owner, trader, liquidator, collateral, indexToken, registry, vault, oracle, engine;
  const usd = ethers.parseEther;

  beforeEach(async function () {
    const eip1193 = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 4 } });
    provider = new ethers.BrowserProvider(eip1193);
    owner = await provider.getSigner(0);
    trader = await provider.getSigner(1);
    liquidator = await provider.getSigner(2);

    collateral = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Mock USDT", "mUSDT"]);
    indexToken = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Mock BTC", "mBTC"]);
    oracle = await deploy(owner, "MockLQCFuturesOracle", "futures/mocks/MockLQCFuturesOracle");
    registry = await deploy(owner, "LQCFuturesMarketRegistry", "futures/LQCFuturesMarketRegistry", [await owner.getAddress()]);
    vault = await deploy(owner, "LQCFuturesVault", "futures/LQCFuturesVault", [await owner.getAddress()]);
    engine = await deploy(owner, "LQCPerpEngine", "futures/LQCPerpEngine", [await registry.getAddress(), await vault.getAddress()]);

    await (await vault.setEngine(await engine.getAddress())).wait();
    await (await vault.setSupportedCollateral(await collateral.getAddress(), true)).wait();
    await (await registry.addMarket(
      ethers.encodeBytes32String("BTC/USDT"), await indexToken.getAddress(), await collateral.getAddress(),
      await oracle.getAddress(), 100_000, 500
    )).wait();
    await (await oracle.setPrice(await indexToken.getAddress(), usd("50000"))).wait();

    const traderAddress = await trader.getAddress();
    await (await collateral.mint(traderAddress, usd("10000"))).wait();
    await (await collateral.connect(trader).approve(await vault.getAddress(), ethers.MaxUint256)).wait();
    await (await vault.connect(trader).deposit(await collateral.getAddress(), usd("5000"))).wait();
  });

  it("opens a 5x long and locks isolated margin", async function () {
    await (await engine.connect(trader).openPosition(1, usd("1000"), usd("5000"), true)).wait();
    const p = await engine.positions(await trader.getAddress(), 1);
    assert.equal(p.open, true);
    assert.equal(p.entryPrice, usd("50000"));
    assert.equal(await vault.lockedBalance(await trader.getAddress(), await collateral.getAddress()), usd("1000"));
  });

  it("rejects leverage above the configured maximum", async function () {
    await assert.rejects(engine.connect(trader).openPosition(1, usd("1000"), usd("11000"), true));
  });

  it("calculates long profit when the oracle price rises", async function () {
    await (await engine.connect(trader).openPosition(1, usd("1000"), usd("5000"), true)).wait();
    await (await oracle.setPrice(await indexToken.getAddress(), usd("55000"))).wait();
    const [pnl] = await engine.getPositionPnl(await trader.getAddress(), 1);
    assert.equal(pnl, usd("500"));
  });

  it("calculates short profit when the oracle price falls", async function () {
    await (await engine.connect(trader).openPosition(1, usd("1000"), usd("5000"), false)).wait();
    await (await oracle.setPrice(await indexToken.getAddress(), usd("45000"))).wait();
    const [pnl] = await engine.getPositionPnl(await trader.getAddress(), 1);
    assert.equal(pnl, usd("500"));
  });

  it("liquidates when equity falls to maintenance margin", async function () {
    await (await engine.connect(trader).openPosition(1, usd("1000"), usd("5000"), true)).wait();
    await (await oracle.setPrice(await indexToken.getAddress(), usd("42500"))).wait();
    await (await engine.connect(liquidator).liquidate(await trader.getAddress(), 1)).wait();
    const p = await engine.positions(await trader.getAddress(), 1);
    assert.equal(p.open, false);
  });

  it("rejects a stale oracle price", async function () {
    const latest = await provider.getBlock("latest");
    await (await oracle.setPriceWithTimestamp(await indexToken.getAddress(), usd("50000"), BigInt(latest.timestamp - 301))).wait();
    await assert.rejects(engine.connect(trader).openPosition(1, usd("1000"), usd("5000"), true));
  });
});
