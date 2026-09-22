import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));
const deploy=async(signer,name,source,args=[])=>{const a=artifact(name,source);const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c;};

describe("Master 7/5-3 Futures trading fee accounting",function(){
  this.timeout(30000);
  let provider,owner,trader,collateral,indexToken,oracle,registry,vault,engine;
  const usd=ethers.parseEther;
  const FEE_BPS=10n; // 0.10%
  const INSURANCE_SHARE_BPS=2500n; // 25%

  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:4}}));
    owner=await provider.getSigner(0); trader=await provider.getSigner(1);
    collateral=await deploy(owner,"MockERC20","mocks/MockERC20",["Mock USDT","mUSDT"]);
    indexToken=await deploy(owner,"MockERC20","mocks/MockERC20",["Mock BTC","mBTC"]);
    oracle=await deploy(owner,"MockLQCFuturesOracle","futures/mocks/MockLQCFuturesOracle");
    registry=await deploy(owner,"LQCFuturesMarketRegistry","futures/LQCFuturesMarketRegistry",[await owner.getAddress()]);
    vault=await deploy(owner,"LQCFuturesVault","futures/LQCFuturesVault",[await owner.getAddress()]);
    engine=await deploy(owner,"LQCPerpEngine","futures/LQCPerpEngine",[await registry.getAddress(),await vault.getAddress()]);
    await(await vault.setEngine(await engine.getAddress())).wait();
    await(await vault.setSupportedCollateral(await collateral.getAddress(),true)).wait();
    await(await registry.addMarket(ethers.encodeBytes32String("BTC/USDT"),await indexToken.getAddress(),await collateral.getAddress(),await oracle.getAddress(),100_000,500)).wait();
    await(await oracle.setPrice(await indexToken.getAddress(),usd("50000"),{gasLimit:100_000n})).wait();
    const a=await trader.getAddress();
    await(await collateral.mint(a,usd("10000"))).wait();
    await(await collateral.connect(trader).approve(await vault.getAddress(),ethers.MaxUint256)).wait();
    await(await vault.connect(trader).deposit(await collateral.getAddress(),usd("5000"))).wait();
    await(await engine.configureTradingFee(1,FEE_BPS,INSURANCE_SHARE_BPS)).wait();
  });

  it("charges entry fee once and segregates Insurance/Treasury reserves",async function(){
    const a=await trader.getAddress(), token=await collateral.getAddress();
    await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),true)).wait();
    assert.equal(await vault.insuranceFeeReserve(token),usd("1.25"));
    assert.equal(await vault.treasuryFeeReserve(token),usd("3.75"));
    assert.equal(await vault.availableBalance(a,token),usd("3995"));
    assert.equal(await vault.isFullyBacked(token),true);
  });

  it("charges partial reduction on reduced notional only",async function(){
    const a=await trader.getAddress(), token=await collateral.getAddress();
    await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),true)).wait();
    const before=await vault.availableBalance(a,token);
    await(await engine.connect(trader).reducePosition(1,usd("2000"))).wait();
    assert.equal((await vault.availableBalance(a,token))-before,usd("398"));
    assert.equal(await vault.insuranceFeeReserve(token),usd("1.75"));
    assert.equal(await vault.treasuryFeeReserve(token),usd("5.25"));
  });

  it("charges full close through the same canonical reduction path",async function(){
    const token=await collateral.getAddress();
    await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),true)).wait();
    await(await engine.connect(trader).closePosition(1)).wait();
    assert.equal(await vault.insuranceFeeReserve(token),usd("2.5"));
    assert.equal(await vault.treasuryFeeReserve(token),usd("7.5"));
    assert.equal(await vault.isFullyBacked(token),true);
  });

  it("rejects unauthorized and out-of-range fee configuration",async function(){
    await assert.rejects(engine.connect(trader).configureTradingFee(1,FEE_BPS,INSURANCE_SHARE_BPS));
    await assert.rejects(engine.configureTradingFee(1,10001,0));
    await assert.rejects(engine.configureTradingFee(1,1,10001));
  });

  it("rolls back an entry atomically when available balance cannot cover fee after margin lock",async function(){
    const a=await trader.getAddress(), token=await collateral.getAddress();
    await(await vault.connect(trader).withdraw(token,usd("4000"))).wait();
    await assert.rejects(engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),true));
    assert.equal((await engine.positions(a,1)).open,false);
    assert.equal(await vault.lockedBalance(a,token),0n);
    assert.equal(await vault.insuranceFeeReserve(token),0n);
    assert.equal(await vault.treasuryFeeReserve(token),0n);
  });
});
