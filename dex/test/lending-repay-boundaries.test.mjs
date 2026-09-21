import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("Master 6/8 Repay runtime boundaries",function(){
  this.timeout(30000);
  let provider,owner,guardian,lender,borrower,payer,collateral,debt,registry,core,id;
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
    payer=await provider.getSigner(4);

    collateral=await deploy("MockERC20","mocks/MockERC20",owner,"COL","COL");
    debt=await deploy("MockERC20","mocks/MockERC20",owner,"DEBT","DEBT");
    const cp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,100_00000000n);
    const cs=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,100_00000000n);
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
      baseAprBps:1,
      slope1AprBps:0,
      slope2AprBps:0,
      optimalUtilizationBps:8000,
      reserveFactorBps:0,
      enabled:true
    })).wait();

    const index=await deploy("LQCLendingInterestIndex","lending/LQCLendingInterestIndex",owner,owner.address,model.target);
    await(await index.initializeMarket(id)).wait();
    core=await deploy("LQCLendingCore","lending/LQCLendingCore",owner,owner.address,registry.target,index.target);
    await(await index.setCore(core.target)).wait();

    await(await debt.mint(lender.address,ethers.parseEther("500"))).wait();
    await(await debt.mint(payer.address,ethers.parseEther("200"))).wait();
    await(await collateral.mint(borrower.address,ethers.parseEther("3"))).wait();
    await(await debt.connect(lender).approve(core.target,ethers.MaxUint256)).wait();
    await(await debt.connect(payer).approve(core.target,ethers.MaxUint256)).wait();
    await(await collateral.connect(borrower).approve(core.target,ethers.MaxUint256)).wait();

    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("300"),gas)).wait();
    await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"),gas)).wait();
  });

  it("allows risk-reducing partial third-party repayment while the market is paused",async()=>{
    await(await core.connect(borrower).borrow(id,ethers.parseEther("50"),borrower.address,gas)).wait();
    await(await registry.connect(guardian).setMarketEnabled(id,false)).wait();

    const sharesBefore=await core.debtSharesOf(id,borrower.address);
    const payerBefore=await debt.balanceOf(payer.address);
    await(await core.connect(payer).repay(id,ethers.parseEther("20"),borrower.address,gas)).wait();

    const sharesAfter=await core.debtSharesOf(id,borrower.address);
    const remaining=await core.debtOf(id,borrower.address);
    const payerAfter=await debt.balanceOf(payer.address);

    assert.ok(sharesAfter<sharesBefore);
    assert.ok(remaining>=ethers.parseEther("30"));
    assert.ok(remaining<ethers.parseEther("30.01"));
    assert.ok(payerBefore-payerAfter>0n);
    assert.ok(payerBefore-payerAfter<=ethers.parseEther("20"));
  });

  it("still rejects a paused partial repayment that would leave sub-minimum debt without drift",async()=>{
    await(await core.connect(borrower).borrow(id,ethers.parseEther("20"),borrower.address,gas)).wait();
    await(await registry.connect(guardian).setMarketEnabled(id,false)).wait();

    const sharesBefore=await core.debtSharesOf(id,borrower.address);
    const payerBefore=await debt.balanceOf(payer.address);
    await assert.rejects(core.connect(payer).repay(id,ethers.parseEther("15"),borrower.address));

    assert.equal(await core.debtSharesOf(id,borrower.address),sharesBefore);
    assert.equal(await debt.balanceOf(payer.address),payerBefore);
  });

  it("caps an overpayment at actual debt and clears all indexed debt shares",async()=>{
    await(await core.connect(borrower).borrow(id,ethers.parseEther("50"),borrower.address,gas)).wait();

    const payerBefore=await debt.balanceOf(payer.address);
    await(await core.connect(payer).repay(id,ethers.parseEther("100"),borrower.address,gas)).wait();
    const payerAfter=await debt.balanceOf(payer.address);

    assert.equal(await core.debtSharesOf(id,borrower.address),0n);
    assert.equal(await core.debtOf(id,borrower.address),0n);
    const paid=payerBefore-payerAfter;
    assert.ok(paid>=ethers.parseEther("50"));
    assert.ok(paid<ethers.parseEther("51"));
    assert.ok(paid<ethers.parseEther("100"));
  });
});
