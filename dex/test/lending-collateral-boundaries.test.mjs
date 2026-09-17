import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));
const gas={gasLimit:1_000_000n};

describe("LQC Lending 2/1 collateral boundaries",function(){
  this.timeout(30000);
  let provider,owner,guardian,borrower,collateral,debt,cp,cs,dp,ds,oracle,registry,model,index,core,id;
  const deploy=async(name,source,signer,...args)=>{const a=artifact(name,source),c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c};

  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));
    owner=await provider.getSigner(0);guardian=await provider.getSigner(1);borrower=await provider.getSigner(2);
    collateral=await deploy("MockERC20","mocks/MockERC20",owner,"Collateral","COL");debt=await deploy("MockERC20","mocks/MockERC20",owner,"Debt","DEBT");
    cp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,100_00000000n);cs=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,99_00000000n);dp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_00000000n);ds=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_01000000n);
    oracle=await deploy("LQCOracleManager","lending/LQCOracleManager",owner,owner.address,guardian.address);
    await(await oracle.configureAsset(collateral.target,cp.target,cs.target,3600,200)).wait();await(await oracle.configureAsset(debt.target,dp.target,ds.target,3600,200)).wait();
    registry=await deploy("LQCLendingMarketRegistry","lending/LQCLendingMarketRegistry",owner,owner.address,guardian.address,oracle.target);
    await(await registry.configureMarket({collateralAsset:collateral.target,debtAsset:debt.target,collateralDecimals:18,debtDecimals:18,maxLtvBps:5000,liquidationThresholdBps:7000,liquidationBonusBps:500,supplyCap:ethers.parseEther("1000"),borrowCap:ethers.parseEther("40000"),minBorrow:ethers.parseEther("10"),enabled:true})).wait();
    id=await registry.marketId(collateral.target,debt.target);
    model=await deploy("LQCInterestRateModel","lending/LQCInterestRateModel",owner,owner.address,guardian.address);await(await model.configureRate(id,{baseAprBps:200,slope1AprBps:800,slope2AprBps:9000,optimalUtilizationBps:8000,reserveFactorBps:1000,enabled:true})).wait();
    index=await deploy("LQCLendingInterestIndex","lending/LQCLendingInterestIndex",owner,owner.address,model.target);await(await index.initializeMarket(id)).wait();
    core=await deploy("LQCLendingCore","lending/LQCLendingCore",owner,owner.address,registry.target,index.target);await(await index.setCore(core.target)).wait();
    await(await collateral.mint(borrower.address,ethers.parseEther("1001"))).wait();await(await collateral.connect(borrower).approve(core.target,ethers.MaxUint256)).wait();
  });

  it("rejects zero collateral operations and a zero withdrawal receiver without changing state",async function(){
    await assert.rejects(core.connect(borrower).depositCollateral(id,0));
    await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"),gas)).wait();
    const before=await core.collateralOf(id,borrower.address),stateBefore=await core.marketStates(id),cashBefore=await collateral.balanceOf(core.target);
    await assert.rejects(core.connect(borrower).withdrawCollateral(id,0,borrower.address));
    await assert.rejects(core.connect(borrower).withdrawCollateral(id,ethers.parseEther("1"),ethers.ZeroAddress));
    assert.equal(await core.collateralOf(id,borrower.address),before);assert.equal((await core.marketStates(id)).totalCollateral,stateBefore.totalCollateral);assert.equal(await collateral.balanceOf(core.target),cashBefore);
  });

  it("rejects collateral over-withdrawal and preserves custody/accounting",async function(){
    await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"),gas)).wait();
    const accountBefore=await core.collateralOf(id,borrower.address),stateBefore=await core.marketStates(id),coreBefore=await collateral.balanceOf(core.target),userBefore=await collateral.balanceOf(borrower.address);
    await assert.rejects(core.connect(borrower).withdrawCollateral(id,ethers.parseEther("2.000000000000000001"),borrower.address));
    assert.equal(await core.collateralOf(id,borrower.address),accountBefore);assert.equal((await core.marketStates(id)).totalCollateral,stateBefore.totalCollateral);assert.equal(await collateral.balanceOf(core.target),coreBefore);assert.equal(await collateral.balanceOf(borrower.address),userBefore);
  });

  it("accepts the collateral cap exactly and rolls back a one-wei excess",async function(){
    const cap=ethers.parseEther("1000");await(await core.connect(borrower).depositCollateral(id,cap,gas)).wait();
    assert.equal(await core.collateralOf(id,borrower.address),cap);assert.equal((await core.marketStates(id)).totalCollateral,cap);assert.equal(await collateral.balanceOf(core.target),cap);
    const userBefore=await collateral.balanceOf(borrower.address);
    await assert.rejects(core.connect(borrower).depositCollateral(id,1n));
    assert.equal(await core.collateralOf(id,borrower.address),cap);assert.equal((await core.marketStates(id)).totalCollateral,cap);assert.equal(await collateral.balanceOf(core.target),cap);assert.equal(await collateral.balanceOf(borrower.address),userBefore);
  });
});
