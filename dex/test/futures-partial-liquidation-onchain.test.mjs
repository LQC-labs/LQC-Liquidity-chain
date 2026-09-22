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

describe("Master 7/5-5 Futures funding-aware partial liquidation",function(){
  this.timeout(30000);

  let provider,owner,trader,liquidator,outsider,collateral,indexToken,oracle,registry,vault,engine;
  const usd=ethers.parseEther;
  const RAY=10n**27n;

  async function setPrice(value){
    await(await oracle.setPrice(await indexToken.getAddress(),usd(value),{gasLimit:100_000n})).wait();
  }

  async function openLong(){
    await(await engine.connect(trader).openPosition(1,usd("1000"),usd("5000"),true)).wait();
  }

  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:6}}));
    owner=await provider.getSigner(0);
    trader=await provider.getSigner(1);
    liquidator=await provider.getSigner(2);
    outsider=await provider.getSigner(3);

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
    await(await collateral.connect(trader).approve(await vault.getAddress(),ethers.MaxUint256)).wait();
    await(await vault.connect(trader).deposit(await collateral.getAddress(),usd("5000"))).wait();
  });

  it("reduces a breached position by the Governance-configured step without releasing margin",async function(){
    const account=await trader.getAddress(), token=await collateral.getAddress();
    await(await engine.configurePartialLiquidation(1,2500,0)).wait();
    await openLong();
    await setPrice("42500");

    const availableBefore=await vault.availableBalance(account,token);
    await(await engine.connect(liquidator).liquidate(account,1)).wait();

    const p=await engine.positions(account,1);
    assert.equal(p.open,true);
    assert.equal(p.sizeUsd,usd("3750"));
    assert.equal(p.margin,usd("812.5"));
    assert.equal(p.entryPrice,usd("50000"));
    assert.equal(await vault.lockedBalance(account,token),usd("812.5"));
    assert.equal(await vault.availableBalance(account,token),availableBefore);

    await assert.rejects(engine.connect(liquidator).liquidate(account,1));
  });

  it("promotes a partial step to full liquidation when the configured minimum remainder would be violated",async function(){
    const account=await trader.getAddress();
    await(await engine.configurePartialLiquidation(1,2500,usd("4000"))).wait();
    await openLong();
    await setPrice("42500");

    await(await engine.connect(liquidator).liquidate(account,1)).wait();
    assert.equal((await engine.positions(account,1)).open,false);
  });

  it("preserves legacy full liquidation when no partial-liquidation step is configured",async function(){
    const account=await trader.getAddress();
    await openLong();
    await setPrice("42500");

    await(await engine.connect(liquidator).liquidate(account,1)).wait();
    assert.equal((await engine.positions(account,1)).open,false);
  });

  it("crystallizes pending funding into isolated margin so funding debt cannot block liquidation",async function(){
    const account=await trader.getAddress(), token=await collateral.getAddress();
    await(await engine.configurePartialLiquidation(1,2500,0)).wait();
    await(await engine.configureFunding(1,RAY/10n)).wait();
    await openLong();

    await(await engine.updateFundingIndex(1,6n*10n**25n)).wait(); // test config: long owes 6% of notional
    assert.equal(await engine.previewFundingPayment(account,1),-usd("300"));

    await setPrice("45000"); // price-only equity would still be above maintenance
    await(await engine.connect(liquidator).liquidate(account,1)).wait();

    const p=await engine.positions(account,1);
    assert.equal(p.open,true);
    assert.equal(p.sizeUsd,usd("3750"));
    assert.equal(p.margin,usd("575"));
    assert.equal(await vault.lockedBalance(account,token),usd("575"));
    assert.equal(await vault.fundingPoolBalance(token),usd("300"));
    assert.equal(await engine.positionFundingEntryRay(account,1),6n*10n**25n);
  });

  it("routes a full-liquidation deficit through the existing bounded Insurance path",async function(){
    const account=await trader.getAddress(), token=await collateral.getAddress();

    await(await engine.configureTradingFee(1,1000,10000)).wait();
    await(await engine.configureInsuranceCoverage(1,10000)).wait();
    await openLong();
    await(await engine.configureTradingFee(1,0,0)).wait();

    assert.equal(await vault.insuranceFeeReserve(token),usd("500"));

    await setPrice("35000");
    await(await engine.connect(liquidator).liquidate(account,1)).wait();

    assert.equal((await engine.positions(account,1)).open,false);
    assert.equal(await vault.totalInsuranceCovered(token),usd("500"));
    assert.equal(await vault.insuranceFeeReserve(token),0n);
    assert.equal(await vault.residualBadDebt(token),0n);
    assert.equal(await vault.isSolvent(token),true);
  });

  it("uses bounded Insurance and explicit residual bad debt for unpaid liquidation funding",async function(){
    const account=await trader.getAddress(), token=await collateral.getAddress();

    await(await engine.configureTradingFee(1,1000,10000)).wait();
    await(await engine.configureInsuranceCoverage(1,5000)).wait();
    await(await engine.configureFunding(1,RAY)).wait();
    await openLong();
    await(await engine.configureTradingFee(1,0,0)).wait();

    // Remove free collateral so the forced funding debit consumes isolated margin first.
    await(await vault.connect(trader).withdraw(token,usd("3500"))).wait();

    await(await engine.updateFundingIndex(1,4n*10n**26n)).wait(); // 40% => 2,000 debit
    await setPrice("50000");

    await(await engine.connect(liquidator).liquidate(account,1)).wait();

    assert.equal((await engine.positions(account,1)).open,false);
    assert.equal(await vault.fundingPoolBalance(token),usd("1250"));
    assert.equal(await vault.totalInsuranceCovered(token),usd("250"));
    assert.equal(await vault.residualBadDebt(token),usd("750"));
    assert.equal(await vault.isFullyBacked(token),true);
    assert.equal(await vault.isSolvent(token),false);
  });

  it("keeps liquidation configuration Governance-only and bounded",async function(){
    await assert.rejects(engine.connect(outsider).configurePartialLiquidation(1,2500,0));
    await assert.rejects(engine.configurePartialLiquidation(1,0,0));
    await assert.rejects(engine.configurePartialLiquidation(1,10001,0));
  });

  it("keeps liquidation isolated from Lending and Staking accounting",function(){
    const engineSource=fs.readFileSync(new URL("../contracts/futures/LQCPerpEngine.sol",import.meta.url),"utf8");
    const vaultSource=fs.readFileSync(new URL("../contracts/futures/LQCFuturesVault.sol",import.meta.url),"utf8");
    for(const source of[engineSource,vaultSource]){
      assert.ok(!source.includes("LQCLendingCore"));
      assert.ok(!source.includes("LQCStaking"));
    }
    assert.ok(engineSource.includes("PositionPartiallyLiquidated"));
    assert.ok(vaultSource.includes("settleLiquidationFunding"));
  });
});
