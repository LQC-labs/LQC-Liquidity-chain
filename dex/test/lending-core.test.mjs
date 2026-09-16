import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC minimal Lending core",function(){
  this.timeout(30000);
  let owner,guardian,lender,borrower,other,collateral,debt,oracle,registry,core,id;
  const deploy=async(name,source,signer,...args)=>{const a=artifact(name,source),c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c};
  beforeEach(async function(){
    const provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));
    owner=await provider.getSigner(0);guardian=await provider.getSigner(1);lender=await provider.getSigner(2);borrower=await provider.getSigner(3);other=await provider.getSigner(4);
    collateral=await deploy("MockERC20","mocks/MockERC20",owner,"Collateral","COL");debt=await deploy("MockERC20","mocks/MockERC20",owner,"Debt","DEBT");
    const cp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,100_00000000n),cs=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,99_00000000n),dp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_00000000n),ds=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_01000000n);
    oracle=await deploy("LQCOracleManager","lending/LQCOracleManager",owner,owner.address,guardian.address);
    await(await oracle.configureAsset(collateral.target,cp.target,cs.target,3600,200)).wait();await(await oracle.configureAsset(debt.target,dp.target,ds.target,3600,200)).wait();
    registry=await deploy("LQCLendingMarketRegistry","lending/LQCLendingMarketRegistry",owner,owner.address,guardian.address,oracle.target);
    const config={collateralAsset:collateral.target,debtAsset:debt.target,collateralDecimals:18,debtDecimals:18,maxLtvBps:5000,liquidationThresholdBps:7000,liquidationBonusBps:500,supplyCap:ethers.parseEther("1000"),borrowCap:ethers.parseEther("40000"),minBorrow:ethers.parseEther("10"),enabled:true};
    await(await registry.configureMarket(config)).wait();id=await registry.marketId(collateral.target,debt.target);
    core=await deploy("LQCLendingCore","lending/LQCLendingCore",owner,registry.target);
    await(await collateral.mint(borrower.address,ethers.parseEther("10"))).wait();await(await debt.mint(lender.address,ethers.parseEther("1000"))).wait();await(await debt.mint(other.address,ethers.parseEther("1000"))).wait();
    await(await collateral.connect(borrower).approve(core.target,ethers.MaxUint256)).wait();await(await debt.connect(lender).approve(core.target,ethers.MaxUint256)).wait();await(await debt.connect(other).approve(core.target,ethers.MaxUint256)).wait();
  });

  it("custodies collateral, supplies liquidity, borrows and repays principal",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("500"))).wait();
    await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"))).wait();
    await(await core.connect(borrower).borrow(id,ethers.parseEther("90"),borrower.address)).wait();
    assert.equal(await core.debtOf(id,borrower.address),ethers.parseEther("90"));assert.equal(await debt.balanceOf(borrower.address),ethers.parseEther("90"));
    await(await debt.connect(borrower).approve(core.target,ethers.MaxUint256)).wait();
    await(await core.connect(borrower).repay(id,ethers.parseEther("40"),borrower.address)).wait();
    assert.equal(await core.debtOf(id,borrower.address),ethers.parseEther("50"));
    await(await core.connect(borrower).repay(id,ethers.parseEther("100"),borrower.address)).wait();
    await(await core.connect(borrower).withdrawCollateral(id,ethers.parseEther("2"),borrower.address)).wait();
    assert.equal(await core.debtOf(id,borrower.address),0n);assert.equal(await collateral.balanceOf(borrower.address),ethers.parseEther("10"));
  });

  it("rejects borrowing or collateral withdrawal above the 50 percent LTV",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("500"))).wait();await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"))).wait();
    await assert.rejects(core.connect(borrower).borrow(id,ethers.parseEther("100"),borrower.address));
    await(await core.connect(borrower).borrow(id,ethers.parseEther("90"),borrower.address)).wait();
    await assert.rejects(core.connect(borrower).withdrawCollateral(id,ethers.parseEther("1"),borrower.address));
  });

  it("protects lender withdrawals while debt is outstanding",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("500"))).wait();await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"))).wait();await(await core.connect(borrower).borrow(id,ethers.parseEther("90"),borrower.address)).wait();
    assert.equal(await core.availableLiquidity(id),ethers.parseEther("410"));
    await assert.rejects(core.connect(lender).withdrawLiquidity(id,ethers.parseEther("411"),lender.address));
    await(await core.connect(lender).withdrawLiquidity(id,ethers.parseEther("410"),lender.address)).wait();
  });

  it("blocks new risk when paused but permits repayment and safe exits",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("500"))).wait();await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"))).wait();await(await core.connect(borrower).borrow(id,ethers.parseEther("50"),borrower.address)).wait();
    await(await registry.connect(guardian).setMarketEnabled(id,false)).wait();
    await assert.rejects(core.connect(borrower).depositCollateral(id,ethers.parseEther("1")));await assert.rejects(core.connect(borrower).borrow(id,ethers.parseEther("1"),borrower.address));
    await(await debt.connect(borrower).approve(core.target,ethers.MaxUint256)).wait();await(await core.connect(borrower).repay(id,ethers.parseEther("50"),borrower.address)).wait();
    await(await core.connect(borrower).withdrawCollateral(id,ethers.parseEther("2"),borrower.address)).wait();await(await core.connect(lender).withdrawLiquidity(id,ethers.parseEther("500"),lender.address)).wait();
  });

  it("enforces per-account minimum debt and allows third-party repayment",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("500"))).wait();await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"))).wait();
    await assert.rejects(core.connect(borrower).borrow(id,ethers.parseEther("9"),borrower.address));
    await(await core.connect(borrower).borrow(id,ethers.parseEther("20"),borrower.address)).wait();
    await assert.rejects(core.connect(other).repay(id,ethers.parseEther("15"),borrower.address));
    await(await core.connect(other).repay(id,ethers.parseEther("20"),borrower.address)).wait();assert.equal(await core.debtOf(id,borrower.address),0n);
  });
});
