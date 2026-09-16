import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)));

describe("LQC Lending economic attack invariants",function(){
  this.timeout(60000);
  const gas={gasLimit:1_200_000n};
  let provider,owner,guardian,lender,liquidator,borrowers,collateral,debt,cp,cs,dp,ds,oracle,registry,model,index,core,engine,id;
  const deploy=async(name,source,signer,...args)=>{const a=artifact(name,source),c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);await c.waitForDeployment();return c};
  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));owner=await provider.getSigner(0);guardian=await provider.getSigner(1);lender=await provider.getSigner(2);liquidator=await provider.getSigner(3);borrowers=await Promise.all([4,5,6,7].map(i=>provider.getSigner(i)));
    collateral=await deploy("MockERC20","mocks/MockERC20",owner,"Collateral","COL");debt=await deploy("MockERC20","mocks/MockERC20",owner,"Debt","DEBT");
    cp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,100_00000000n);cs=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,99_00000000n);dp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_00000000n);ds=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_01000000n);
    oracle=await deploy("LQCOracleManager","lending/LQCOracleManager",owner,owner.address,guardian.address);await(await oracle.configureAsset(collateral.target,cp.target,cs.target,3600,200)).wait();await(await oracle.configureAsset(debt.target,dp.target,ds.target,3600,200)).wait();
    registry=await deploy("LQCLendingMarketRegistry","lending/LQCLendingMarketRegistry",owner,owner.address,guardian.address,oracle.target);await(await registry.configureMarket({collateralAsset:collateral.target,debtAsset:debt.target,collateralDecimals:18,debtDecimals:18,maxLtvBps:5000,liquidationThresholdBps:7000,liquidationBonusBps:500,supplyCap:ethers.parseEther("1000"),borrowCap:ethers.parseEther("900"),minBorrow:ethers.parseEther("10"),enabled:true})).wait();id=await registry.marketId(collateral.target,debt.target);
    model=await deploy("LQCInterestRateModel","lending/LQCInterestRateModel",owner,owner.address,guardian.address);await(await model.configureRate(id,{baseAprBps:200,slope1AprBps:800,slope2AprBps:9000,optimalUtilizationBps:8000,reserveFactorBps:1000,enabled:true})).wait();
    index=await deploy("LQCLendingInterestIndex","lending/LQCLendingInterestIndex",owner,owner.address,model.target);await(await index.initializeMarket(id)).wait();core=await deploy("LQCLendingCore","lending/LQCLendingCore",owner,owner.address,registry.target,index.target);await(await index.setCore(core.target)).wait();engine=await deploy("LQCLiquidationEngine","lending/LQCLiquidationEngine",owner,core.target);await(await core.setLiquidationEngine(engine.target)).wait();
    await(await debt.mint(lender.address,ethers.parseEther("1000"))).wait();await(await debt.mint(liquidator.address,ethers.parseEther("1000"))).wait();await(await debt.mint(owner.address,ethers.parseEther("1000"))).wait();await(await debt.connect(lender).approve(core.target,ethers.MaxUint256)).wait();await(await debt.connect(liquidator).approve(core.target,ethers.MaxUint256)).wait();await(await debt.approve(core.target,ethers.MaxUint256)).wait();
    for(const borrower of borrowers){await(await collateral.mint(borrower.address,ethers.parseEther("3"))).wait();await(await debt.mint(borrower.address,ethers.parseEther("2"))).wait();await(await collateral.connect(borrower).approve(core.target,ethers.MaxUint256)).wait();}
  });
  const open=async(borrower,collateralAmount="2",borrowAmount="90")=>{await(await core.connect(borrower).depositCollateral(id,ethers.parseEther(collateralAmount),gas)).wait();await(await core.connect(borrower).borrow(id,ethers.parseEther(borrowAmount),borrower.address,gas)).wait()};
  const refreshDebtFeeds=async()=>{await(await dp.setAnswer(1_00000000n,gas)).wait();await(await ds.setAnswer(1_01000000n,gas)).wait()};

  it("never seizes more collateral than deposited across sequential liquidations",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("500"),gas)).wait();for(const borrower of borrowers.slice(0,3))await open(borrower);
    await(await cp.setAnswer(50_00000000n,gas)).wait();await(await cs.setAnswer(50_00000000n,gas)).wait();let seized=0n;
    for(const borrower of borrowers.slice(0,3)){const before=await collateral.balanceOf(liquidator.address);await(await engine.connect(liquidator).liquidate(id,borrower.address,ethers.parseEther("90"),liquidator.address,gas)).wait();seized+=await collateral.balanceOf(liquidator.address)-before;assert.ok(await core.collateralOf(id,borrower.address)>=0n);}
    assert.ok(seized<=ethers.parseEther("6"));assert.ok(await core.totalBorrow(id)<ethers.parseEther("270"));
  });

  it("bounds high-utilization interest while preserving supplier and reserve ordering",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("300"),gas)).wait();for(const borrower of borrowers.slice(0,3))await open(borrower,"2","90");
    const debtBefore=await core.totalBorrow(id),supplyBefore=await core.totalLiquidity(id);await provider.send("evm_increaseTime",[180*86400]);await provider.send("evm_mine",[]);await refreshDebtFeeds();await(await cp.setAnswer(100_00000000n,gas)).wait();await(await cs.setAnswer(99_00000000n,gas)).wait();await(await core.accrueInterest(id,gas)).wait();
    const debtAfter=await core.totalBorrow(id),supplyAfter=await core.totalLiquidity(id),reserves=await core.accruedReserves(id);assert.ok(debtAfter>debtBefore);assert.ok(debtAfter<debtBefore*2n);assert.ok(supplyAfter>supplyBefore);const distributed=(supplyAfter-supplyBefore)+reserves,accrued=debtAfter-debtBefore;assert.ok(distributed>=accrued&&distributed-accrued<=100_000_000_000n);
  });

  it("cannot borrow or withdraw beyond actual market cash",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("300"),gas)).wait();for(const borrower of borrowers.slice(0,3))await open(borrower,"2","90");assert.equal(await core.availableLiquidity(id),ethers.parseEther("30"));
    await(await core.connect(borrowers[3]).depositCollateral(id,ethers.parseEther("2"),gas)).wait();
    await assert.rejects(core.connect(borrowers[3]).borrow(id,ethers.parseEther("31"),borrowers[3].address));await assert.rejects(core.connect(lender).withdrawLiquidity(id,ethers.parseEther("31"),lender.address));
  });

  it("leaves every position unchanged when oracle feeds diverge",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("300"),gas)).wait();await open(borrowers[0]);const collateralBefore=await core.collateralOf(id,borrowers[0].address),debtSharesBefore=await core.debtSharesOf(id,borrowers[0].address);
    await(await cp.setAnswer(40_00000000n,gas)).wait();await assert.rejects(engine.connect(liquidator).liquidate(id,borrowers[0].address,ethers.parseEther("45"),liquidator.address));assert.equal(await core.collateralOf(id,borrowers[0].address),collateralBefore);assert.equal(await core.debtSharesOf(id,borrowers[0].address),debtSharesBefore);
  });

  it("preserves assets versus supplier and reserve claims through recapitalization",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("300"),gas)).wait();await open(borrowers[0]);await(await cp.setAnswer(10_00000000n,gas)).wait();await(await cs.setAnswer(10_00000000n,gas)).wait();await(await engine.connect(liquidator).liquidate(id,borrowers[0].address,ethers.parseEther("90"),liquidator.address,gas)).wait();
    const beforeAssets=await core.availableLiquidity(id)+await core.totalBorrow(id),beforeClaims=await core.totalLiquidity(id)+await core.accruedReserves(id);assert.ok(beforeAssets+10n>=beforeClaims);
    await(await core.recapitalizeBadDebt(id,borrowers[0].address,ethers.parseEther("10"),gas)).wait();const afterAssets=await core.availableLiquidity(id)+await core.totalBorrow(id),afterClaims=await core.totalLiquidity(id)+await core.accruedReserves(id);assert.ok(afterAssets+10n>=afterClaims);assert.ok(afterAssets>=beforeAssets-10n);
  });
});
