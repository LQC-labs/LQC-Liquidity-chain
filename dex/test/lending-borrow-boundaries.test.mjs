import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("Master 6/7 Borrow runtime boundaries",function(){
  this.timeout(30000);
  let provider,owner,guardian,lender,borrowerA,borrowerB,collateral,debt,registry,core,id;
  const deploy=async(name,source,signer,...args)=>{const a=artifact(name,source),c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c};
  const gas={gasLimit:1_000_000n};

  beforeEach(async()=>{
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true},wallet:{totalAccounts:6}}));
    owner=await provider.getSigner(0);guardian=await provider.getSigner(1);lender=await provider.getSigner(2);borrowerA=await provider.getSigner(3);borrowerB=await provider.getSigner(4);
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
      collateralAsset:collateral.target,debtAsset:debt.target,collateralDecimals:18,debtDecimals:18,
      maxLtvBps:5000,liquidationThresholdBps:7000,liquidationBonusBps:500,
      supplyCap:ethers.parseEther("1000"),borrowCap:ethers.parseEther("120"),minBorrow:ethers.parseEther("10"),enabled:true
    })).wait();
    id=await registry.marketId(collateral.target,debt.target);
    const model=await deploy("LQCInterestRateModel","lending/LQCInterestRateModel",owner,owner.address,guardian.address);
    await(await model.configureRate(id,{baseAprBps:1,slope1AprBps:0,slope2AprBps:0,optimalUtilizationBps:8000,reserveFactorBps:0,enabled:true})).wait();
    const index=await deploy("LQCLendingInterestIndex","lending/LQCLendingInterestIndex",owner,owner.address,model.target);
    await(await index.initializeMarket(id)).wait();
    core=await deploy("LQCLendingCore","lending/LQCLendingCore",owner,owner.address,registry.target,index.target);
    await(await index.setCore(core.target)).wait();

    await(await debt.mint(lender.address,ethers.parseEther("500"))).wait();
    await(await collateral.mint(borrowerA.address,ethers.parseEther("3"))).wait();
    await(await collateral.mint(borrowerB.address,ethers.parseEther("3"))).wait();
    await(await debt.connect(lender).approve(core.target,ethers.MaxUint256)).wait();
    await(await collateral.connect(borrowerA).approve(core.target,ethers.MaxUint256)).wait();
    await(await collateral.connect(borrowerB).approve(core.target,ethers.MaxUint256)).wait();
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("300"),gas)).wait();
    await(await core.connect(borrowerA).depositCollateral(id,ethers.parseEther("2"),gas)).wait();
    await(await core.connect(borrowerB).depositCollateral(id,ethers.parseEther("2"),gas)).wait();
  });

  it("enforces minimum debt, cumulative borrow cap, indexed shares and pause without accounting drift",async()=>{
    const aCash0=await debt.balanceOf(borrowerA.address);
    await assert.rejects(core.connect(borrowerA).borrow(id,ethers.parseEther("9"),borrowerA.address));
    assert.equal(await core.debtSharesOf(id,borrowerA.address),0n);
    assert.equal(await debt.balanceOf(borrowerA.address),aCash0);

    await(await core.connect(borrowerA).borrow(id,ethers.parseEther("60"),borrowerA.address,gas)).wait();
    assert.ok((await core.debtSharesOf(id,borrowerA.address))>0n);
    assert.equal(await debt.balanceOf(borrowerA.address),aCash0+ethers.parseEther("60"));

    await(await core.connect(borrowerB).borrow(id,ethers.parseEther("50"),borrowerB.address,gas)).wait();
    const bShares=await core.debtSharesOf(id,borrowerB.address);
    const bCash=await debt.balanceOf(borrowerB.address);
    assert.ok((await core.totalBorrow(id))<ethers.parseEther("120"));

    await assert.rejects(core.connect(borrowerB).borrow(id,ethers.parseEther("11"),borrowerB.address));
    assert.equal(await core.debtSharesOf(id,borrowerB.address),bShares);
    assert.equal(await debt.balanceOf(borrowerB.address),bCash);

    await(await registry.connect(guardian).setMarketEnabled(id,false)).wait();
    const aShares=await core.debtSharesOf(id,borrowerA.address);
    await assert.rejects(core.connect(borrowerA).borrow(id,ethers.parseEther("1"),borrowerA.address));
    assert.equal(await core.debtSharesOf(id,borrowerA.address),aShares);
  });
});
