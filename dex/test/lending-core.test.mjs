import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC minimal Lending core",function(){
  this.timeout(30000);
  let provider,owner,guardian,lender,borrower,other,collateral,debt,oracle,registry,core,model,index,id;
  const deploy=async(name,source,signer,...args)=>{const a=artifact(name,source),c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c};
  const gas={gasLimit:1_000_000n};
  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));
    owner=await provider.getSigner(0);guardian=await provider.getSigner(1);lender=await provider.getSigner(2);borrower=await provider.getSigner(3);other=await provider.getSigner(4);
    collateral=await deploy("MockERC20","mocks/MockERC20",owner,"Collateral","COL");debt=await deploy("MockERC20","mocks/MockERC20",owner,"Debt","DEBT");
    const cp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,100_00000000n),cs=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,99_00000000n),dp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_00000000n),ds=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_01000000n);
    oracle=await deploy("LQCOracleManager","lending/LQCOracleManager",owner,owner.address,guardian.address);
    await(await oracle.configureAsset(collateral.target,cp.target,cs.target,3600,200)).wait();await(await oracle.configureAsset(debt.target,dp.target,ds.target,3600,200)).wait();
    registry=await deploy("LQCLendingMarketRegistry","lending/LQCLendingMarketRegistry",owner,owner.address,guardian.address,oracle.target);
    const config={collateralAsset:collateral.target,debtAsset:debt.target,collateralDecimals:18,debtDecimals:18,maxLtvBps:5000,liquidationThresholdBps:7000,liquidationBonusBps:500,supplyCap:ethers.parseEther("1000"),borrowCap:ethers.parseEther("40000"),minBorrow:ethers.parseEther("10"),enabled:true};
    await(await registry.configureMarket(config)).wait();id=await registry.marketId(collateral.target,debt.target);
    model=await deploy("LQCInterestRateModel","lending/LQCInterestRateModel",owner,owner.address,guardian.address);
    await(await model.configureRate(id,{baseAprBps:200,slope1AprBps:800,slope2AprBps:9000,optimalUtilizationBps:8000,reserveFactorBps:1000,enabled:true})).wait();
    index=await deploy("LQCLendingInterestIndex","lending/LQCLendingInterestIndex",owner,owner.address,model.target);await(await index.initializeMarket(id)).wait();
    core=await deploy("LQCLendingCore","lending/LQCLendingCore",owner,owner.address,registry.target,index.target);await(await index.setCore(core.target)).wait();
    await(await collateral.mint(borrower.address,ethers.parseEther("10"))).wait();await(await debt.mint(lender.address,ethers.parseEther("1000"))).wait();await(await debt.mint(other.address,ethers.parseEther("1000"))).wait();
    await(await collateral.connect(borrower).approve(core.target,ethers.MaxUint256)).wait();await(await debt.connect(lender).approve(core.target,ethers.MaxUint256)).wait();await(await debt.connect(other).approve(core.target,ethers.MaxUint256)).wait();
  });

  it("custodies collateral, supplies liquidity, borrows and repays principal",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("500"),gas)).wait();
    await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"),gas)).wait();
    await(await core.connect(borrower).borrow(id,ethers.parseEther("90"),borrower.address,gas)).wait();
    assert.equal(await core.debtOf(id,borrower.address),ethers.parseEther("90"));assert.equal(await debt.balanceOf(borrower.address),ethers.parseEther("90"));
    await(await debt.connect(borrower).approve(core.target,ethers.MaxUint256)).wait();
    await(await core.connect(borrower).repay(id,ethers.parseEther("40"),borrower.address,gas)).wait();
    const remaining=await core.debtOf(id,borrower.address);assert.ok(remaining>=ethers.parseEther("50"));assert.ok(remaining<ethers.parseEther("50.001"));
    await(await core.connect(borrower).repay(id,ethers.parseEther("100"),borrower.address,gas)).wait();
    await(await core.connect(borrower).withdrawCollateral(id,ethers.parseEther("2"),borrower.address,gas)).wait();
    assert.equal(await core.debtOf(id,borrower.address),0n);assert.equal(await collateral.balanceOf(borrower.address),ethers.parseEther("10"));
  });

  it("rejects borrowing or collateral withdrawal above the 50 percent LTV",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("500"),gas)).wait();await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"),gas)).wait();
    await assert.rejects(core.connect(borrower).borrow(id,ethers.parseEther("100"),borrower.address));
    await(await core.connect(borrower).borrow(id,ethers.parseEther("90"),borrower.address,gas)).wait();
    await assert.rejects(core.connect(borrower).withdrawCollateral(id,ethers.parseEther("1"),borrower.address));
  });

  it("protects lender withdrawals while debt is outstanding",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("500"),gas)).wait();await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"),gas)).wait();await(await core.connect(borrower).borrow(id,ethers.parseEther("90"),borrower.address,gas)).wait();
    assert.equal(await core.availableLiquidity(id),ethers.parseEther("410"));
    await assert.rejects(core.connect(lender).withdrawLiquidity(id,ethers.parseEther("411"),lender.address));
    await(await core.connect(lender).withdrawLiquidity(id,ethers.parseEther("410"),lender.address,gas)).wait();
  });

  it("blocks new risk when paused but permits repayment and safe exits",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("500"),gas)).wait();await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"),gas)).wait();await(await core.connect(borrower).borrow(id,ethers.parseEther("50"),borrower.address,gas)).wait();
    await(await registry.connect(guardian).setMarketEnabled(id,false)).wait();
    await assert.rejects(core.connect(borrower).depositCollateral(id,ethers.parseEther("1")));await assert.rejects(core.connect(borrower).borrow(id,ethers.parseEther("1"),borrower.address));
    await(await debt.connect(borrower).approve(core.target,ethers.MaxUint256)).wait();await(await core.connect(borrower).repay(id,ethers.parseEther("50"),borrower.address,gas)).wait();
    await(await core.connect(borrower).withdrawCollateral(id,ethers.parseEther("2"),borrower.address,gas)).wait();await(await core.connect(lender).withdrawLiquidity(id,ethers.parseEther("500"),lender.address,gas)).wait();
  });

  it("enforces per-account minimum debt and allows third-party repayment",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("500"),gas)).wait();await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"),gas)).wait();
    await assert.rejects(core.connect(borrower).borrow(id,ethers.parseEther("9"),borrower.address));
    await(await core.connect(borrower).borrow(id,ethers.parseEther("20"),borrower.address,gas)).wait();
    await assert.rejects(core.connect(other).repay(id,ethers.parseEther("15"),borrower.address));
    await(await core.connect(other).repay(id,ethers.parseEther("21"),borrower.address,gas)).wait();assert.equal(await core.debtOf(id,borrower.address),0n);
  });

  it("connects borrower interest, supplier yield and protocol reserves",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("500"),gas)).wait();await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("3"),gas)).wait();await(await core.connect(borrower).borrow(id,ethers.parseEther("100"),borrower.address,gas)).wait();
    const debtBefore=await core.debtOf(id,borrower.address),supplyBefore=await core.liquidityOf(id,lender.address);
    await provider.send("evm_increaseTime",[30*86400]);await provider.send("evm_mine",[]);await(await core.accrueInterest(id,gas)).wait();
    const debtAfter=await core.debtOf(id,borrower.address),supplyAfter=await core.liquidityOf(id,lender.address),reserves=await core.accruedReserves(id);
    assert.ok(debtAfter>debtBefore);assert.ok(supplyAfter>supplyBefore);assert.ok(reserves>0n);assert.equal(debtAfter-debtBefore,(supplyAfter-supplyBefore)+reserves);
  });
});
