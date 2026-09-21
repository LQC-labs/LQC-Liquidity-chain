import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(
  new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)
));

describe("Master 6/17 LQC Staking Lock Cooldown Unstake",function(){
  this.timeout(30000);
  let provider,owner,user,other,token,vault,rewards;
  const cooldown=300;

  const deploy=async(name,source,signer,...args)=>{
    const a=artifact(name,source);
    const c=await new ethers.ContractFactory(a.abi,a.bytecode,signer).deploy(...args);
    await c.waitForDeployment();
    return c;
  };

  beforeEach(async function(){
    provider=new ethers.BrowserProvider(ganache.provider({logging:{quiet:true}}));
    owner=await provider.getSigner(0);
    user=await provider.getSigner(1);
    other=await provider.getSigner(2);

    token=await deploy("MockERC20","mocks/MockERC20",owner,"LQC Test","tLQC");
    vault=await deploy("LQCStakingVault","staking/LQCStakingVault",owner,token.target,owner.address,other.address,cooldown,30*24*60*60);
    rewards=await deploy("LQCStakingRewards","staking/LQCStakingRewards",owner,vault.target,owner.address,other.address,ethers.parseEther("10000"),ethers.parseEther("100"),365*24*60*60);
    await(await vault.initializeRewardAccounting(rewards.target)).wait();

    await(await token.mint(user.address,ethers.parseEther("1000"))).wait();
    await(await token.mint(other.address,ethers.parseEther("1000"))).wait();
    await(await token.mint(owner.address,ethers.parseEther("5000"))).wait();

    await(await token.connect(user).approve(vault.target,ethers.MaxUint256)).wait();
    await(await token.connect(other).approve(vault.target,ethers.MaxUint256)).wait();
    await(await token.approve(rewards.target,ethers.MaxUint256)).wait();
  });

  it("supports a voluntary monotonic lock and blocks unstake requests until expiry",async function(){
    const amount=ethers.parseEther("100");
    await(await vault.connect(user).stake(amount,user.address)).wait();

    const block=await provider.getBlock("latest");
    const unlock=Number(block.timestamp)+600;
    await(await vault.connect(user).extendLock(unlock)).wait();

    assert.equal(await vault.lockUntil(user.address),BigInt(unlock));
    await assert.rejects(vault.connect(user).requestUnstake(amount));

    await assert.rejects(vault.connect(user).extendLock(unlock-1));
    await provider.send("evm_increaseTime",[601]);
    await provider.send("evm_mine",[]);

    await(await vault.connect(user).requestUnstake(amount,{gasLimit:500_000})).wait();
    const [pending,availableAt]=await vault.pendingUnstakeOf(user.address);
    assert.equal(pending,amount);
    assert.ok(availableAt>0n);
  });

  it("moves requested principal out of active reward weight and into cooldown custody",async function(){
    const amount=ethers.parseEther("100");
    const budget=ethers.parseEther("1000");
    await(await vault.connect(user).stake(amount,user.address)).wait();
    await(await rewards.fundRewards(budget,1000)).wait();

    await provider.send("evm_increaseTime",[400]);
    await provider.send("evm_mine",[]);
    await(await vault.connect(user).requestUnstake(amount)).wait();

    const earnedAtRequest=await rewards.earned(user.address);
    assert.ok(earnedAtRequest>ethers.parseEther("390"));
    assert.ok(earnedAtRequest<ethers.parseEther("410"));
    assert.equal(await vault.stakedBalance(user.address),0n);
    assert.equal(await vault.totalStaked(),0n);
    assert.equal(await vault.totalPendingUnstake(),amount);
    assert.equal(await token.balanceOf(vault.target),amount);
    assert.equal(await vault.isFullyBacked(),true);

    await provider.send("evm_increaseTime",[200]);
    await provider.send("evm_mine",[]);
    const earnedDuringCooldown=await rewards.earned(user.address);
    assert.equal(earnedDuringCooldown,earnedAtRequest);
  });

  it("cannot complete before cooldown and transfers exact principal after cooldown",async function(){
    const amount=ethers.parseEther("100");
    await(await vault.connect(user).stake(amount,user.address)).wait();
    await(await vault.connect(user).requestUnstake(amount)).wait();

    await assert.rejects(vault.connect(user).completeUnstake(user.address));

    await provider.send("evm_increaseTime",[cooldown+1]);
    await provider.send("evm_mine",[]);

    const before=await token.balanceOf(user.address);
    await(await vault.connect(user).completeUnstake(user.address,{gasLimit:500_000})).wait();
    assert.equal((await token.balanceOf(user.address))-before,amount);
    assert.equal(await vault.totalPendingUnstake(),0n);
    const [pending,availableAt]=await vault.pendingUnstakeOf(user.address);
    assert.equal(pending,0n);
    assert.equal(availableAt,0n);
    assert.equal(await vault.isFullyBacked(),true);
  });

  it("supports partial exit while keeping the remaining stake active",async function(){
    const total=ethers.parseEther("100");
    const exit=ethers.parseEther("40");
    await(await vault.connect(user).stake(total,user.address)).wait();
    await(await vault.connect(user).requestUnstake(exit)).wait();

    assert.equal(await vault.stakedBalance(user.address),total-exit);
    assert.equal(await vault.totalStaked(),total-exit);
    assert.equal(await vault.totalPendingUnstake(),exit);
  });

  it("allows cancelling cooldown without granting retroactive rewards",async function(){
    const amount=ethers.parseEther("100");
    const budget=ethers.parseEther("1000");
    await(await vault.connect(user).stake(amount,user.address)).wait();
    await(await rewards.fundRewards(budget,1000)).wait();

    await provider.send("evm_increaseTime",[200]);
    await provider.send("evm_mine",[]);
    await(await vault.connect(user).requestUnstake(amount)).wait();
    const beforeCooldown=await rewards.earned(user.address);

    await provider.send("evm_increaseTime",[100]);
    await provider.send("evm_mine",[]);
    await(await vault.connect(user).cancelUnstake()).wait();

    const afterCancel=await rewards.earned(user.address);
    assert.equal(afterCancel,beforeCooldown);
    assert.equal(await vault.stakedBalance(user.address),amount);
    assert.equal(await vault.totalPendingUnstake(),0n);
  });

  it("prevents overlapping exit requests and rejects requests above active stake",async function(){
    const amount=ethers.parseEther("100");
    await(await vault.connect(user).stake(amount,user.address)).wait();

    await assert.rejects(vault.connect(user).requestUnstake(amount+1n));
    await(await vault.connect(user).requestUnstake(ethers.parseEther("40"))).wait();
    await assert.rejects(vault.connect(user).requestUnstake(ethers.parseEther("1")));
  });

  it("does not let an account with no active stake create a lock",async function(){
    const block=await provider.getBlock("latest");
    await assert.rejects(vault.connect(user).extendLock(Number(block.timestamp)+600));
  });

  it("keeps exit state read-only for future ecosystem consumers",async function(){
    const abi=artifact("LQCStakingVault","staking/LQCStakingVault").abi;
    const names=new Set(abi.filter(x=>x.type==="function").map(x=>x.name));
    for(const required of["stakedBalance","totalStaked","lockUntil","pendingUnstakeOf","isFullyBacked"]){
      assert.equal(names.has(required),true,required);
    }
    for(const forbidden of["borrow","repay","supplyLiquidity","setLaunchpadTier"]){
      assert.equal(names.has(forbidden),false,forbidden);
    }
  });
});
