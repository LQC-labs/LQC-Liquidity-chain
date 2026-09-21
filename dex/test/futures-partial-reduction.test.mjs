import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(
  fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url))
);

const deploy=async(signer,name,source,args=[])=>{
  const a=artifact(name,source);
  const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);
  await c.waitForDeployment();
  return c;
};

describe("Master 7/5-1 Futures canonical partial position reduction",function(){
  this.timeout(30000);

  let provider,owner,trader,collateral,indexToken,oracle,registry,vault,engine;
  const usd=ethers.parseEther;

  async function setPrice(value){
    await(await oracle.setPrice(await indexToken.getAddress(),usd(value),{gasLimit:100_000n})).wait();
  }

  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:4}}));
    owner=await provider.getSigner(0);
    trader=await provider.getSigner(1);

    collateral=await deploy(owner,"MockERC20","mocks/MockERC20",["Mock USDT","mUSDT"]);
    indexToken=await deploy(owner,"MockERC20","mocks/MockERC20",["Mock BTC","mBTC"]);
    oracle=await deploy(owner,"MockLQCFuturesOracle","futures/mocks/MockLQCFuturesOracle");
    registry=await deploy(owner,"LQCFuturesMarketRegistry","futures/LQCFuturesMarketRegistry",[await owner.getAddress()]);
    vault=await deploy(owner,"LQCFuturesVault","futures/LQCFuturesVault",[await owner.getAddress()]);
    engine=await deploy(owner,"LQCPerpEngine","futures/LQCPerpEngine",[await registry.getAddress(),await vault.getAddress()]);

    await(await vault.setEngine(await engine.getAddress())).wait();
    await(await vault.setSupportedCollateral(await collateral.getAddress(),true)).wait();
    await(await registry.addMarket(
      ethers.encodeBytes32String("BTC/USDT"),
      await indexToken.getAddress(),
      await collateral.getAddress(),
      await oracle.getAddress(),
      100_000,
      500
    )).wait();
    await setPrice("50000");

    const traderAddress=await trader.getAddress();
    await(await collateral.mint(traderAddress,usd("10000"))).wait();
    await(await collateral.mint(await owner.getAddress(),usd("5000"))).wait();
    await(await collateral.connect(trader).approve(await vault.getAddress(),ethers.MaxUint256)).wait();
    await(await vault.connect(trader).deposit(await collateral.getAddress(),usd("5000"))).wait();

    // Unaccounted protocol liquidity lets positive realized PnL settle without
    // changing the trader's accounted collateral baseline.
    await(await collateral.transfer(await vault.getAddress(),usd("2000"))).wait();

    await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),true)).wait();
  });

  it("reduces a profitable position proportionally and preserves the remaining entry price",async function(){
    const traderAddress=await trader.getAddress();
    await setPrice("55000");

    const availableBefore=await vault.availableBalance(traderAddress,await collateral.getAddress());
    await(await engine.connect(trader).reducePosition(1,usd("2000"))).wait();

    const p=await engine.positions(traderAddress,1);
    assert.equal(p.open,true);
    assert.equal(p.sizeUsd,usd("3000"));
    assert.equal(p.margin,usd("600"));
    assert.equal(p.entryPrice,usd("50000"));
    assert.equal(p.isLong,true);

    assert.equal(await vault.lockedBalance(traderAddress,await collateral.getAddress()),usd("600"));
    assert.equal(
      (await vault.availableBalance(traderAddress,await collateral.getAddress()))-availableBefore,
      usd("600"),
      "400 proportional margin + 200 realized profit"
    );
  });

  it("realizes only the reduced slice loss and leaves remaining margin locked",async function(){
    const traderAddress=await trader.getAddress();
    await setPrice("45000");

    const accountedBefore=await vault.totalAccounted(await collateral.getAddress());
    await(await engine.connect(trader).reducePosition(1,usd("2000"))).wait();

    const p=await engine.positions(traderAddress,1);
    assert.equal(p.sizeUsd,usd("3000"));
    assert.equal(p.margin,usd("600"));
    assert.equal(p.entryPrice,usd("50000"));
    assert.equal(await vault.lockedBalance(traderAddress,await collateral.getAddress()),usd("600"));
    assert.equal(accountedBefore-(await vault.totalAccounted(await collateral.getAddress())),usd("200"));
  });

  it("rejects zero and over-reduction without mutating the position",async function(){
    const traderAddress=await trader.getAddress();
    const before=await engine.positions(traderAddress,1);

    await assert.rejects(engine.connect(trader).reducePosition(1,0));
    await assert.rejects(engine.connect(trader).reducePosition(1,usd("5001")));

    const after=await engine.positions(traderAddress,1);
    assert.deepEqual(after,before);
  });

  it("rejects a deficit-producing voluntary partial reduction until Insurance/bad-debt is integrated",async function(){
    const traderAddress=await trader.getAddress();
    await setPrice("10000");

    const before=await engine.positions(traderAddress,1);
    const lockedBefore=await vault.lockedBalance(traderAddress,await collateral.getAddress());
    const accountedBefore=await vault.totalAccounted(await collateral.getAddress());

    await assert.rejects(engine.connect(trader).reducePosition(1,usd("2000")));

    assert.deepEqual(await engine.positions(traderAddress,1),before);
    assert.equal(await vault.lockedBalance(traderAddress,await collateral.getAddress()),lockedBefore);
    assert.equal(await vault.totalAccounted(await collateral.getAddress()),accountedBefore);
  });

  it("supports full reduction through the same canonical primitive",async function(){
    const traderAddress=await trader.getAddress();
    await setPrice("50000");

    await(await engine.connect(trader).reducePosition(1,usd("5000"))).wait();

    const p=await engine.positions(traderAddress,1);
    assert.equal(p.open,false);
    assert.equal(p.sizeUsd,0n);
    assert.equal(p.margin,0n);
    assert.equal(await vault.lockedBalance(traderAddress,await collateral.getAddress()),0n);
    assert.equal(await vault.availableBalance(traderAddress,await collateral.getAddress()),usd("5000"));
  });

  it("keeps legacy closePosition on the same reduction primitive",async function(){
    const traderAddress=await trader.getAddress();
    await setPrice("50000");
    await(await engine.connect(trader).closePosition(1)).wait();

    assert.equal((await engine.positions(traderAddress,1)).open,false);
    assert.equal(await vault.lockedBalance(traderAddress,await collateral.getAddress()),0n);
  });

  it("keeps partial reduction isolated from Lending and from later 7/5 accounting modules",function(){
    const source=fs.readFileSync(new URL("../contracts/futures/LQCPerpEngine.sol",import.meta.url),"utf8");
    assert.ok(source.includes("function reducePosition"));
    assert.ok(!source.includes("LQCLendingCore"));
    for(const later of["settleFunding","insuranceFund","autoDeleverage"]){
      assert.ok(!source.includes(`function ${later}`),later);
    }
  });
});
