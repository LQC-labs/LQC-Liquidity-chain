import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("Master 6/10 Liquidation runtime boundaries",function(){
  this.timeout(30000);
  let provider,owner,guardian,lender,borrower,liquidator,collateral,debt,registry,core,engine,cp,cs,id;
  const deploy=async(name,source,signer,...args)=>{
    const a=artifact(name,source);
    const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);
    await c.waitForDeployment();
    return c;
  };
  const gas={gasLimit:1_000_000n};

  beforeEach(async()=>{
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:6}}));
    owner=await provider.getSigner(0);
    guardian=await provider.getSigner(1);
    lender=await provider.getSigner(2);
    borrower=await provider.getSigner(3);
    liquidator=await provider.getSigner(4);

    collateral=await deploy("MockERC20","mocks/MockERC20",owner,"COL","COL");
    debt=await deploy("MockERC20","mocks/MockERC20",owner,"DEBT","DEBT");
    cp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,100_00000000n);
    cs=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,100_00000000n);
    const dp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_00000000n);
    const ds=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_00000000n);

    const oracle=await deploy("LQCOracleManager","lending/LQCOracleManager",owner,owner.address,guardian.address);
    await(await oracle.configureAsset(collateral.target,cp.target,cs.target,3600,200)).wait();
    await(await oracle.configureAsset(debt.target,dp.target,ds.target,3600,200)).wait();

    registry=await deploy("LQCLendingMarketRegistry","lending/LQCLendingMarketRegistry",owner,owner.address,guardian.address,oracle.target);
    await(await registry.configureMarket({
      collateralAsset:collateral.target,
      debtAsset:debt.target,
      collateralDecimals:18,
      debtDecimals:18,
      maxLtvBps:5000,
      liquidationThresholdBps:7000,
      liquidationBonusBps:500,
      supplyCap:ethers.parseEther("1000"),
      borrowCap:ethers.parseEther("500"),
      minBorrow:ethers.parseEther("10"),
      enabled:true
    })).wait();
    id=await registry.marketId(collateral.target,debt.target);

    const model=await deploy("LQCInterestRateModel","lending/LQCInterestRateModel",owner,owner.address,guardian.address);
    await(await model.configureRate(id,{
      baseAprBps:0,
      slope1AprBps:0,
      slope2AprBps:1,
      optimalUtilizationBps:8000,
      reserveFactorBps:0,
      enabled:true
    })).wait();

    const index=await deploy("LQCLendingInterestIndex","lending/LQCLendingInterestIndex",owner,owner.address,model.target);
    await(await index.initializeMarket(id)).wait();
    core=await deploy("LQCLendingCore","lending/LQCLendingCore",owner,owner.address,registry.target,index.target);
    await(await index.setCore(core.target)).wait();
    engine=await deploy("LQCLiquidationEngine","lending/LQCLiquidationEngine",owner,core.target);
    await(await core.setLiquidationEngine(engine.target)).wait();

    await(await debt.mint(lender.address,ethers.parseEther("500"))).wait();
    await(await debt.mint(liquidator.address,ethers.parseEther("200"))).wait();
    await(await collateral.mint(borrower.address,ethers.parseEther("3"))).wait();
    await(await debt.connect(lender).approve(core.target,ethers.MaxUint256)).wait();
    await(await debt.connect(liquidator).approve(core.target,ethers.MaxUint256)).wait();
    await(await collateral.connect(borrower).approve(core.target,ethers.MaxUint256)).wait();

    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("300"),gas)).wait();
    await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"),gas)).wait();
    await(await core.connect(borrower).borrow(id,ethers.parseEther("70"),borrower.address,gas)).wait();
  });

  it("rejects liquidation at Health Factor 1 without accounting drift",async()=>{
    await(await cp.setAnswer(50_00000000n,gas)).wait();
    await(await cs.setAnswer(50_00000000n,gas)).wait();

    const debtBefore=await core.debtOf(id,borrower.address);
    const collateralBefore=await core.collateralOf(id,borrower.address);
    const risk=await registry.accountRisk(id,collateralBefore,debtBefore);

    assert.equal(debtBefore,ethers.parseEther("70"));
    assert.equal(risk.healthFactor,ethers.parseEther("1"));
    assert.equal(risk.liquidatable,false);

    await assert.rejects(engine.connect(liquidator).liquidate(id,borrower.address,ethers.parseEther("70"),liquidator.address));
    assert.equal(await core.debtOf(id,borrower.address),debtBefore);
    assert.equal(await core.collateralOf(id,borrower.address),collateralBefore);
  });

  it("liquidates only after HF breach and remains available while the market is paused",async()=>{
    await(await cp.setAnswer(49_00000000n,gas)).wait();
    await(await cs.setAnswer(49_00000000n,gas)).wait();

    const risk=await registry.accountRisk(id,await core.collateralOf(id,borrower.address),await core.debtOf(id,borrower.address));
    assert.ok(risk.healthFactor<ethers.parseEther("1"));
    assert.equal(risk.liquidatable,true);

    await(await registry.connect(guardian).setMarketEnabled(id,false)).wait();

    const payerBefore=await debt.balanceOf(liquidator.address);
    await(await engine.connect(liquidator).liquidate(id,borrower.address,ethers.parseEther("70"),liquidator.address,gas)).wait();

    assert.equal(await core.debtOf(id,borrower.address),ethers.parseEther("35"));
    assert.equal(await core.collateralOf(id,borrower.address),ethers.parseEther("1.25"));
    assert.equal(await collateral.balanceOf(liquidator.address),ethers.parseEther("0.75"));
    assert.equal(payerBefore-await debt.balanceOf(liquidator.address),ethers.parseEther("35"));
    assert.equal((await registry.getMarket(id)).enabled,false);
  });

  it("rejects zero receiver and direct Core liquidation access",async()=>{
    await assert.rejects(engine.connect(liquidator).liquidate(id,borrower.address,ethers.parseEther("1"),ethers.ZeroAddress));
    await assert.rejects(core.connect(liquidator).executeLiquidation(id,borrower.address,liquidator.address,liquidator.address,ethers.parseEther("1")));
  });
});
