import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(
  new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)
));

describe("Master 6/18 LQC Staking Governance Emergency Controls",function(){
  this.timeout(30000);

  let provider,owner,guardian,user,other,token,vault,rewards;
  const cooldown=300;
  const maxCooldown=30*24*60*60;
  const budgetCap=ethers.parseEther("10000");
  const maxRate=ethers.parseEther("100");
  const maxDuration=365*24*60*60;

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
    user=await provider.getSigner(2);
    other=await provider.getSigner(3);

    token=await deploy("MockERC20","mocks/MockERC20",owner,"LQC Test","tLQC");
    vault=await deploy(
      "LQCStakingVault","staking/LQCStakingVault",owner,
      token.target,owner.address,guardian.address,cooldown,maxCooldown
    );
    rewards=await deploy(
      "LQCStakingRewards","staking/LQCStakingRewards",owner,
      vault.target,owner.address,guardian.address,budgetCap,maxRate,maxDuration
    );
    await(await vault.initializeRewardAccounting(rewards.target)).wait();

    await(await token.mint(user.address,ethers.parseEther("1000"))).wait();
    await(await token.mint(other.address,ethers.parseEther("1000"))).wait();
    await(await token.mint(owner.address,ethers.parseEther("20000"))).wait();

    await(await token.connect(user).approve(vault.target,ethers.MaxUint256)).wait();
    await(await token.connect(other).approve(vault.target,ethers.MaxUint256)).wait();
    await(await token.approve(rewards.target,ethers.MaxUint256)).wait();
  });

  it("lets guardian pause new staking while preserving user exits",async function(){
    const amount=ethers.parseEther("100");
    await(await vault.connect(user).stake(amount,user.address)).wait();

    await(await vault.connect(guardian).pauseNewStaking()).wait();
    assert.equal(await vault.stakingPaused(),true);

    await assert.rejects(vault.connect(other).stake(1,other.address));
    const block=await provider.getBlock("latest");
    await assert.rejects(vault.connect(user).extendLock(Number(block.timestamp)+600));

    await(await vault.connect(user).requestUnstake(amount)).wait();
    const [pending]=await vault.pendingUnstakeOf(user.address);
    assert.equal(pending,amount);

    await assert.rejects(vault.connect(guardian).resumeNewStaking());
    await(await vault.resumeNewStaking()).wait();
    assert.equal(await vault.stakingPaused(),false);
  });

  it("allows guardian to enable immediate user-controlled emergency exit without principal custody",async function(){
    const amount=ethers.parseEther("100");
    await(await vault.connect(user).stake(amount,user.address)).wait();

    const block=await provider.getBlock("latest");
    await(await vault.connect(user).extendLock(Number(block.timestamp)+3600)).wait();

    await(await vault.connect(guardian).enableEmergencyExit()).wait();
    assert.equal(await vault.emergencyExitEnabled(),true);
    assert.equal(await vault.stakingPaused(),true);

    await(await vault.connect(user).requestUnstake(amount,{gasLimit:500_000})).wait();
    const [pending,availableAt]=await vault.pendingUnstakeOf(user.address);
    assert.equal(pending,amount);

    const latest=await provider.getBlock("latest");
    assert.ok(availableAt<=BigInt(latest.timestamp));

    const before=await token.balanceOf(user.address);
    await(await vault.connect(user).completeUnstake(user.address,{gasLimit:500_000})).wait();
    assert.equal((await token.balanceOf(user.address))-before,amount);
    assert.equal(await vault.totalPendingUnstake(),0n);

    await assert.rejects(vault.connect(guardian).disableEmergencyExit());
    await(await vault.disableEmergencyExit()).wait();
    assert.equal(await vault.emergencyExitEnabled(),false);
  });

  it("bounds cooldown governance and leaves existing pending exits unchanged",async function(){
    const amount=ethers.parseEther("100");
    await(await vault.connect(user).stake(amount,user.address)).wait();
    await(await vault.connect(user).requestUnstake(amount)).wait();
    const [,oldAvailableAt]=await vault.pendingUnstakeOf(user.address);

    await assert.rejects(vault.connect(guardian).setCooldownDuration(600));
    await assert.rejects(vault.setCooldownDuration(0));
    await assert.rejects(vault.setCooldownDuration(maxCooldown+1));

    await(await vault.setCooldownDuration(600)).wait();
    assert.equal(await vault.cooldownDuration(),600n);

    const [,stillAvailableAt]=await vault.pendingUnstakeOf(user.address);
    assert.equal(stillAvailableAt,oldAvailableAt);
  });

  it("separates guardian pause power from owner-only role recovery",async function(){
    await assert.rejects(vault.connect(user).setGuardian(other.address));
    await assert.rejects(vault.connect(guardian).setGuardian(other.address));

    await(await vault.setGuardian(other.address)).wait();
    assert.equal(await vault.guardian(),other.address);

    await assert.rejects(vault.connect(guardian).pauseNewStaking());
    await(await vault.connect(other).pauseNewStaking()).wait();
    assert.equal(await vault.stakingPaused(),true);
  });

  it("lets guardian pause reward funding while preserving already-earned claims",async function(){
    const stake=ethers.parseEther("100");
    const budget=ethers.parseEther("1000");

    await(await vault.connect(user).stake(stake,user.address)).wait();
    await(await rewards.fundRewards(budget,1000)).wait();

    await provider.send("evm_increaseTime",[500]);
    await provider.send("evm_mine",[]);

    await(await rewards.connect(guardian).pauseFunding()).wait();
    assert.equal(await rewards.fundingPaused(),true);
    await assert.rejects(rewards.fundRewards(ethers.parseEther("1"),100));

    const before=await token.balanceOf(user.address);
    await(await rewards.connect(user).claim()).wait();
    assert.ok((await token.balanceOf(user.address))>before);

    await assert.rejects(rewards.connect(guardian).resumeFunding());
    await(await rewards.resumeFunding()).wait();
    assert.equal(await rewards.fundingPaused(),false);
  });

  it("enforces deployment-time reward budget rate and duration ceilings",async function(){
    const Tight=artifact("LQCStakingRewards","staking/LQCStakingRewards");
    const tight=await new ethers.ContractFactory(Tight.abi,Tight.bytecode,owner).deploy(
      vault.target,
      owner.address,
      guardian.address,
      ethers.parseEther("1000"),
      ethers.parseEther("10"),
      1000
    );
    await tight.waitForDeployment();
    await(await token.approve(tight.target,ethers.MaxUint256)).wait();

    await assert.rejects(tight.fundRewards(ethers.parseEther("100"),1001));
    await assert.rejects(tight.fundRewards(ethers.parseEther("100"),1));

    await(await tight.fundRewards(ethers.parseEther("900"),1000)).wait();
    await assert.rejects(tight.fundRewards(ethers.parseEther("101"),1000));

    assert.equal(await tight.totalFunded(),ethers.parseEther("900"));
  });

  it("keeps emergency governance non-custodial and isolated from Lending",async function(){
    const vaultAbi=artifact("LQCStakingVault","staking/LQCStakingVault").abi;
    const names=new Set(vaultAbi.filter(x=>x.type==="function").map(x=>x.name.toLowerCase()));

    for(const forbidden of[
      "sweep","rescueprincipal","withdrawuserfunds","seize","borrow","repay","supplyliquidity"
    ]){
      assert.equal(names.has(forbidden),false,forbidden);
    }

    const vaultSource=fs.readFileSync(new URL("../contracts/staking/LQCStakingVault.sol",import.meta.url),"utf8");
    const rewardSource=fs.readFileSync(new URL("../contracts/staking/LQCStakingRewards.sol",import.meta.url),"utf8");
    assert.ok(!vaultSource.includes("LQCLendingCore"));
    assert.ok(!rewardSource.includes("LQCLendingCore"));
    assert.ok(!vaultSource.includes("mint("));
    assert.ok(!rewardSource.includes("mint("));
  });
});
