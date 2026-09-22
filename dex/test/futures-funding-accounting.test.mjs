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

describe("Master 7/5-2 Futures funding checkpoint accounting",function(){
  this.timeout(30000);

  let provider,owner,longTrader,shortTrader,third,collateral,indexToken,oracle,registry,vault,engine;
  const usd=ethers.parseEther;
  const RAY=10n**27n;
  const MAX_DELTA=10n**25n; // test configuration: 1%, not a protocol product constant
  const DELTA=3n*10n**24n; // test configuration: 0.3%

  async function setPrice(value){
    await(await oracle.setPrice(await indexToken.getAddress(),usd(value),{gasLimit:100_000n})).wait();
  }

  async function fundAndDeposit(signer,amount="5000"){
    const a=await signer.getAddress();
    await(await collateral.mint(a,usd(amount))).wait();
    await(await collateral.connect(signer).approve(await vault.getAddress(),ethers.MaxUint256)).wait();
    await(await vault.connect(signer).deposit(await collateral.getAddress(),usd(amount))).wait();
  }

  async function open(signer,isLong=true,margin="1000",size="5000"){
    await(await engine.connect(signer).openPosition(1,usd(margin),usd(size),isLong)).wait();
  }

  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:6}}));
    owner=await provider.getSigner(0);
    longTrader=await provider.getSigner(1);
    shortTrader=await provider.getSigner(2);
    third=await provider.getSigner(3);

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

    await fundAndDeposit(longTrader);
    await fundAndDeposit(shortTrader);
    await fundAndDeposit(third);

    await(await engine.configureFunding(1,MAX_DELTA)).wait();
    await open(longTrader,true);
    await open(shortTrader,false);
  });

  it("conserves positive funding from long payer to short receiver through the dedicated pool",async function(){
    const longAddr=await longTrader.getAddress();
    const shortAddr=await shortTrader.getAddress();
    const token=await collateral.getAddress();

    await(await engine.updateFundingIndex(1,DELTA)).wait();

    assert.equal(await engine.previewFundingPayment(longAddr,1),-usd("15"));
    assert.equal(await engine.previewFundingPayment(shortAddr,1),usd("15"));

    const longBefore=await vault.availableBalance(longAddr,token);
    const shortBefore=await vault.availableBalance(shortAddr,token);
    const accountedBefore=await vault.totalAccounted(token);

    await(await engine.connect(longTrader).settleFunding(1)).wait();
    assert.equal(await vault.availableBalance(longAddr,token),longBefore-usd("15"));
    assert.equal(await vault.fundingPoolBalance(token),usd("15"));
    assert.equal(await vault.totalAccounted(token),accountedBefore-usd("15"));

    await(await engine.connect(shortTrader).settleFunding(1)).wait();
    assert.equal(await vault.availableBalance(shortAddr,token),shortBefore+usd("15"));
    assert.equal(await vault.fundingPoolBalance(token),0n);
    assert.equal(await vault.totalAccounted(token),accountedBefore);
    assert.equal(await vault.isFullyBacked(token),true);
  });

  it("fails closed if a receiver tries to consume funding before payers have funded the pool",async function(){
    const shortAddr=await shortTrader.getAddress();
    await(await engine.updateFundingIndex(1,DELTA)).wait();

    assert.equal(await engine.positionFundingEntryRay(shortAddr,1),0n);
    await assert.rejects(engine.connect(shortTrader).settleFunding(1));
    assert.equal(await engine.positionFundingEntryRay(shortAddr,1),0n);
    assert.equal(await vault.fundingPoolBalance(await collateral.getAddress()),0n);
  });

  it("reverses payer and receiver when cumulative funding moves negative",async function(){
    const longAddr=await longTrader.getAddress();
    const shortAddr=await shortTrader.getAddress();
    const token=await collateral.getAddress();

    await(await engine.updateFundingIndex(1,-DELTA)).wait();
    assert.equal(await engine.previewFundingPayment(shortAddr,1),-usd("15"));
    assert.equal(await engine.previewFundingPayment(longAddr,1),usd("15"));

    await(await engine.connect(shortTrader).settleFunding(1)).wait();
    assert.equal(await vault.fundingPoolBalance(token),usd("15"));
    await(await engine.connect(longTrader).settleFunding(1)).wait();
    assert.equal(await vault.fundingPoolBalance(token),0n);
  });

  it("uses a governance-supplied per-market bound and rejects unauthorized or excessive index updates",async function(){
    await assert.rejects(engine.connect(longTrader).configureFunding(1,MAX_DELTA));
    await assert.rejects(engine.connect(longTrader).updateFundingIndex(1,DELTA));
    await assert.rejects(engine.updateFundingIndex(1,MAX_DELTA+1n));
    await assert.rejects(engine.updateFundingIndex(1,0));
    await assert.rejects(engine.configureFunding(1,RAY+1n));
  });

  it("opens new positions at the current funding checkpoint with no retroactive funding",async function(){
    await(await engine.updateFundingIndex(1,DELTA)).wait();
    await open(third,true);

    const addr=await third.getAddress();
    assert.equal(await engine.positionFundingEntryRay(addr,1),DELTA);
    assert.equal(await engine.previewFundingPayment(addr,1),0n);
  });

  it("settles outstanding funding before voluntary reduction and future funding uses only remaining size",async function(){
    const addr=await longTrader.getAddress();
    const token=await collateral.getAddress();

    await(await engine.updateFundingIndex(1,DELTA)).wait();
    const availableBefore=await vault.availableBalance(addr,token);

    await(await engine.connect(longTrader).reducePosition(1,usd("2000"))).wait();

    const p=await engine.positions(addr,1);
    assert.equal(p.sizeUsd,usd("3000"));
    assert.equal(p.margin,usd("600"));
    assert.equal(await engine.positionFundingEntryRay(addr,1),DELTA);
    assert.equal(await vault.fundingPoolBalance(token),usd("15"));
    assert.equal(
      (await vault.availableBalance(addr,token))-availableBefore,
      usd("385"),
      "400 released margin minus 15 funding debit"
    );

    await(await engine.updateFundingIndex(1,DELTA)).wait();
    assert.equal(await engine.previewFundingPayment(addr,1),-usd("9"));
  });

  it("blocks a funding payer from reducing until the funding debit can be settled, with atomic rollback",async function(){
    const addr=await longTrader.getAddress();
    const token=await collateral.getAddress();

    // Remove all available collateral, leaving only the 1,000 locked margin.
    await(await vault.connect(longTrader).withdraw(token,usd("4000"))).wait();
    assert.equal(await vault.availableBalance(addr,token),0n);

    await(await engine.updateFundingIndex(1,DELTA)).wait();
    const before=Array.from(await engine.positions(addr,1));
    const checkpointBefore=await engine.positionFundingEntryRay(addr,1);

    await assert.rejects(engine.connect(longTrader).reducePosition(1,usd("2000")));

    assert.deepEqual(Array.from(await engine.positions(addr,1)),before);
    assert.equal(await engine.positionFundingEntryRay(addr,1),checkpointBefore);
    assert.equal(await vault.fundingPoolBalance(token),0n);
  });

  it("keeps funding inside the Futures domain and preserves locked margin during ordinary funding settlement",async function(){
    const addr=await longTrader.getAddress();
    const token=await collateral.getAddress();
    const lockedBefore=await vault.lockedBalance(addr,token);

    await(await engine.updateFundingIndex(1,DELTA)).wait();
    await(await engine.connect(longTrader).settleFunding(1)).wait();

    assert.equal(await vault.lockedBalance(addr,token),lockedBefore);
    const engineSource=fs.readFileSync(new URL("../contracts/futures/LQCPerpEngine.sol",import.meta.url),"utf8");
    const vaultSource=fs.readFileSync(new URL("../contracts/futures/LQCFuturesVault.sol",import.meta.url),"utf8");
    assert.ok(!engineSource.includes("LQCLendingCore"));
    assert.ok(!vaultSource.includes("LQCLendingCore"));
    assert.ok(!engineSource.includes("LQCStaking"));
    assert.ok(!vaultSource.includes("LQCStaking"));
  });
});
