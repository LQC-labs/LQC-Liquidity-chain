import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(
  new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)
));

describe("Master 6/19 Lending + Supply Earn + LQC Staking E2E",function(){
  this.timeout(30000);

  let provider,owner,guardian,lender,borrower,staker,other;
  let collateral,debt,lqc,cp,cs,dp,ds,oracle,registry,model,index,core,engine;
  let staking,rewards,id;

  const gas={gasLimit:1_000_000n};
  const deploy=async(name,source,signer,...args)=>{
    const a=artifact(name,source);
    const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);
    await c.waitForDeployment();
    return c;
  };

  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));
    owner=await provider.getSigner(0);
    guardian=await provider.getSigner(1);
    lender=await provider.getSigner(2);
    borrower=await provider.getSigner(3);
    staker=await provider.getSigner(4);
    other=await provider.getSigner(5);

    collateral=await deploy("MockERC20","mocks/MockERC20",owner,"Collateral","COL");
    debt=await deploy("MockERC20","mocks/MockERC20",owner,"Stable Debt","USDT");
    lqc=await deploy("MockERC20","mocks/MockERC20",owner,"LQC Test","tLQC");

    cp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,100_00000000n);
    cs=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,99_00000000n);
    dp=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_00000000n);
    ds=await deploy("MockPriceFeed","mocks/MockPriceFeed",owner,8,1_01000000n);

    oracle=await deploy("LQCOracleManager","lending/LQCOracleManager",owner,owner.address,guardian.address);
    await(await oracle.configureAsset(collateral.target,cp.target,cs.target,3600,200)).wait();
    await(await oracle.configureAsset(debt.target,dp.target,ds.target,3600,200)).wait();

    registry=await deploy(
      "LQCLendingMarketRegistry","lending/LQCLendingMarketRegistry",owner,
      owner.address,guardian.address,oracle.target
    );

    const config={
      collateralAsset:collateral.target,
      debtAsset:debt.target,
      collateralDecimals:18,
      debtDecimals:18,
      maxLtvBps:5000,
      liquidationThresholdBps:7000,
      liquidationBonusBps:500,
      supplyCap:ethers.parseEther("1000000"),
      borrowCap:ethers.parseEther("400000"),
      minBorrow:ethers.parseEther("10"),
      enabled:true
    };
    await(await registry.configureMarket(config)).wait();
    id=await registry.marketId(collateral.target,debt.target);

    model=await deploy(
      "LQCInterestRateModel","lending/LQCInterestRateModel",owner,
      owner.address,guardian.address
    );
    await(await model.configureRate(id,{
      baseAprBps:200,
      slope1AprBps:800,
      slope2AprBps:9000,
      optimalUtilizationBps:8000,
      reserveFactorBps:1000,
      enabled:true
    })).wait();

    index=await deploy(
      "LQCLendingInterestIndex","lending/LQCLendingInterestIndex",owner,
      owner.address,model.target
    );
    await(await index.initializeMarket(id)).wait();

    core=await deploy(
      "LQCLendingCore","lending/LQCLendingCore",owner,
      owner.address,registry.target,index.target
    );
    await(await index.setCore(core.target)).wait();

    engine=await deploy("LQCLiquidationEngine","lending/LQCLiquidationEngine",owner,core.target);
    await(await core.setLiquidationEngine(engine.target)).wait();

    staking=await deploy(
      "LQCStakingVault","staking/LQCStakingVault",owner,
      lqc.target,owner.address,guardian.address,300,30*24*60*60
    );
    rewards=await deploy(
      "LQCStakingRewards","staking/LQCStakingRewards",owner,
      staking.target,owner.address,guardian.address,
      ethers.parseEther("10000"),ethers.parseEther("100"),365*24*60*60
    );
    await(await staking.initializeRewardAccounting(rewards.target)).wait();

    await(await debt.mint(lender.address,ethers.parseEther("1000"))).wait();
    await(await debt.mint(borrower.address,ethers.parseEther("20"))).wait();
    await(await collateral.mint(borrower.address,ethers.parseEther("10"))).wait();
    await(await lqc.mint(staker.address,ethers.parseEther("1000"))).wait();
    await(await lqc.mint(owner.address,ethers.parseEther("5000"))).wait();

    await(await debt.connect(lender).approve(core.target,ethers.MaxUint256)).wait();
    await(await debt.connect(borrower).approve(core.target,ethers.MaxUint256)).wait();
    await(await collateral.connect(borrower).approve(core.target,ethers.MaxUint256)).wait();
    await(await lqc.connect(staker).approve(staking.target,ethers.MaxUint256)).wait();
    await(await lqc.approve(rewards.target,ethers.MaxUint256)).wait();
  });

  it("runs Lending, borrower-interest Supply Earn, Staking rewards and user exit without mixing custody",async function(){
    const supply=ethers.parseEther("500");
    const borrow=ethers.parseEther("90");
    const stake=ethers.parseEther("100");
    const rewardBudget=ethers.parseEther("1000");

    await(await core.connect(lender).supplyLiquidity(id,supply,gas)).wait();
    await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"),gas)).wait();
    await(await core.connect(borrower).borrow(id,borrow,borrower.address,gas)).wait();

    await(await staking.connect(staker).stake(stake,staker.address)).wait();
    await(await rewards.fundRewards(rewardBudget,1000)).wait();

    const lenderBefore=await core.liquidityOf(id,lender.address);
    const debtBefore=await core.debtOf(id,borrower.address);

    await provider.send("evm_increaseTime",[500]);
    await provider.send("evm_mine",[]);
    await(await core.accrueInterest(id,gas)).wait();

    const lenderAfter=await core.liquidityOf(id,lender.address);
    const debtAfter=await core.debtOf(id,borrower.address);
    const reserve=await core.accruedReserves(id);
    const stakingEarned=await rewards.earned(staker.address);

    assert.ok(lenderAfter>lenderBefore,"Supply Earn must increase supplier claim");
    assert.ok(debtAfter>debtBefore,"borrower debt must accrue interest");
    assert.ok(reserve>0n,"protocol reserve must accrue separately");
    assert.ok(stakingEarned>ethers.parseEther("490"));
    assert.ok(stakingEarned<ethers.parseEther("510"));

    assert.equal(await lqc.balanceOf(core.target),0n,"Lending Core must not custody LQC staking principal");
    assert.equal(await debt.balanceOf(staking.target),0n,"Staking Vault must not custody Lending debt assets");
    assert.equal(await lqc.balanceOf(staking.target),stake);
    assert.equal(await lqc.balanceOf(rewards.target),rewardBudget);

    await(await rewards.connect(staker).claim()).wait();
    assert.equal(await lqc.balanceOf(staking.target),stake,"reward claim must not consume principal");

    await(await core.connect(borrower).repay(id,ethers.parseEther("200"),borrower.address,gas)).wait();
    await(await core.connect(borrower).withdrawCollateral(id,ethers.parseEther("2"),borrower.address,gas)).wait();
    assert.equal(await core.debtOf(id,borrower.address),0n);

    const lenderClaim=await core.liquidityOf(id,lender.address);
    await(await core.connect(lender).withdrawLiquidity(id,lenderClaim,lender.address,gas)).wait();
    assert.ok((await debt.balanceOf(lender.address))>ethers.parseEther("1000"),"supplier must realize variable earn");

    await(await staking.connect(staker).requestUnstake(stake)).wait();
    assert.equal(await staking.totalStaked(),0n);
    assert.equal(await staking.totalPendingUnstake(),stake);

    await provider.send("evm_increaseTime",[301]);
    await provider.send("evm_mine",[]);

    const beforePrincipal=await lqc.balanceOf(staker.address);
    await(await staking.connect(staker).completeUnstake(staker.address,{gasLimit:500_000})).wait();
    assert.equal((await lqc.balanceOf(staker.address))-beforePrincipal,stake);
    assert.equal(await staking.totalPendingUnstake(),0n);
    assert.equal(await staking.isFullyBacked(),true);
  });

  it("isolates emergency Staking controls from healthy Lending operations",async function(){
    await(await core.connect(lender).supplyLiquidity(id,ethers.parseEther("500"),gas)).wait();
    await(await core.connect(borrower).depositCollateral(id,ethers.parseEther("2"),gas)).wait();

    await(await staking.connect(staker).stake(ethers.parseEther("100"),staker.address)).wait();
    await(await rewards.fundRewards(ethers.parseEther("1000"),1000)).wait();

    await(await staking.connect(guardian).pauseNewStaking()).wait();
    await(await rewards.connect(guardian).pauseFunding()).wait();

    await assert.rejects(staking.connect(staker).stake(1,staker.address));
    await assert.rejects(rewards.fundRewards(ethers.parseEther("1"),100));

    await(await core.connect(borrower).borrow(id,ethers.parseEther("50"),borrower.address,gas)).wait();
    assert.ok((await core.debtOf(id,borrower.address))>=ethers.parseEther("50"));

    await provider.send("evm_increaseTime",[100]);
    await provider.send("evm_mine",[]);
    const earned=await rewards.earned(staker.address);
    assert.ok(earned>0n);
    await(await rewards.connect(staker).claim()).wait();

    const block=await provider.getBlock("latest");
    await assert.rejects(staking.connect(staker).extendLock(Number(block.timestamp)+3600));

    await(await staking.connect(guardian).enableEmergencyExit()).wait();
    await(await staking.connect(staker).requestUnstake(ethers.parseEther("100"),{gasLimit:500_000})).wait();
    await(await staking.connect(staker).completeUnstake(staker.address,{gasLimit:500_000})).wait();

    assert.equal(await staking.totalStaked(),0n);
    assert.equal(await staking.totalPendingUnstake(),0n);

    await(await core.connect(borrower).repay(id,ethers.parseEther("100"),borrower.address,gas)).wait();
    assert.equal(await core.debtOf(id,borrower.address),0n);
  });

  it("keeps the integrated Stage 6 modules in explicit independent accounting domains",function(){
    const lending=fs.readFileSync(new URL("../contracts/lending/LQCLendingCore.sol",import.meta.url),"utf8");
    const stakingSource=fs.readFileSync(new URL("../contracts/staking/LQCStakingVault.sol",import.meta.url),"utf8");
    const rewardsSource=fs.readFileSync(new URL("../contracts/staking/LQCStakingRewards.sol",import.meta.url),"utf8");

    assert.ok(!lending.includes("LQCStakingVault"));
    assert.ok(!lending.includes("LQCStakingRewards"));
    assert.ok(!stakingSource.includes("LQCLendingCore"));
    assert.ok(!rewardsSource.includes("LQCLendingCore"));
  });
});
