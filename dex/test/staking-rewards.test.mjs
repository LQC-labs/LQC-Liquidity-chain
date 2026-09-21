import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(
  new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)
));

describe("Master 6/16 LQC Staking Reward Accounting",function(){
  this.timeout(30000);
  let provider,owner,user,other,token,vault,rewards;

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
    vault=await deploy("LQCStakingVault","staking/LQCStakingVault",owner,token.target,owner.address);
    rewards=await deploy("LQCStakingRewards","staking/LQCStakingRewards",owner,vault.target,owner.address);
    await(await vault.initializeRewardAccounting(rewards.target)).wait();

    await(await token.mint(user.address,ethers.parseEther("1000"))).wait();
    await(await token.mint(other.address,ethers.parseEther("1000"))).wait();
    await(await token.mint(owner.address,ethers.parseEther("5000"))).wait();

    await(await token.connect(user).approve(vault.target,ethers.MaxUint256)).wait();
    await(await token.connect(other).approve(vault.target,ethers.MaxUint256)).wait();
    await(await token.approve(rewards.target,ethers.MaxUint256)).wait();
  });

  it("keeps reward custody separate from staking principal",async function(){
    const principal=ethers.parseEther("100");
    const reward=ethers.parseEther("1000");

    await(await vault.connect(user).stake(principal,user.address)).wait();
    await(await rewards.fundRewards(reward,1000)).wait();

    assert.equal(await token.balanceOf(vault.target),principal);
    assert.equal(await token.balanceOf(rewards.target),reward);
    assert.equal(await vault.totalStaked(),principal);
    assert.equal(await rewards.rewardReserve(),reward);
    assert.equal(await rewards.isFullyBacked(),true);
  });

  it("prevents a late staker from receiving retroactive rewards",async function(){
    const stake=ethers.parseEther("100");
    const budget=ethers.parseEther("1000");

    await(await vault.connect(user).stake(stake,user.address)).wait();
    await(await rewards.fundRewards(budget,1000)).wait();

    await provider.send("evm_increaseTime",[500]);
    await provider.send("evm_mine",[]);

    const firstHalf=await rewards.earned(user.address);
    assert.ok(firstHalf>ethers.parseEther("490"));
    assert.ok(firstHalf<ethers.parseEther("510"));

    await(await vault.connect(other).stake(stake,other.address)).wait();
    const lateImmediate=await rewards.earned(other.address);
    assert.ok(lateImmediate<ethers.parseEther("2"));

    await provider.send("evm_increaseTime",[500]);
    await provider.send("evm_mine",[]);

    const userEarned=await rewards.earned(user.address);
    const otherEarned=await rewards.earned(other.address);
    assert.ok(userEarned>otherEarned);
    assert.ok(userEarned>ethers.parseEther("730"));
    assert.ok(userEarned<ethers.parseEther("770"));
    assert.ok(otherEarned>ethers.parseEther("230"));
    assert.ok(otherEarned<ethers.parseEther("270"));
  });

  it("claims only earned pre-funded rewards and preserves principal custody",async function(){
    const principal=ethers.parseEther("100");
    const budget=ethers.parseEther("1000");

    await(await vault.connect(user).stake(principal,user.address)).wait();
    await(await rewards.fundRewards(budget,1000)).wait();

    await provider.send("evm_increaseTime",[1000]);
    await provider.send("evm_mine",[]);

    const before=await token.balanceOf(user.address);
    await(await rewards.connect(user).claim()).wait();
    const claimed=(await token.balanceOf(user.address))-before;

    assert.ok(claimed>ethers.parseEther("990"));
    assert.ok(claimed<=budget);
    assert.equal(await token.balanceOf(vault.target),principal);
    assert.equal(await vault.stakedBalance(user.address),principal);
    assert.equal(await rewards.totalClaimed(),claimed);
    assert.equal(await rewards.rewardReserve(),budget-claimed);
  });

  it("allows only the canonical vault to checkpoint account rewards",async function(){
    await assert.rejects(rewards.connect(user).checkpoint(user.address));
  });

  it("allows only the reward owner to fund a schedule",async function(){
    await(await token.connect(user).approve(rewards.target,ethers.MaxUint256)).wait();
    await assert.rejects(rewards.connect(user).fundRewards(ethers.parseEther("1"),100));
  });

  it("binds the reward accounting module only once",async function(){
    const second=await deploy("LQCStakingRewards","staking/LQCStakingRewards",owner,vault.target,owner.address);
    await assert.rejects(vault.initializeRewardAccounting(second.target));
  });

  it("rejects fee-on-transfer reward funding so reserve accounting cannot drift",async function(){
    const feeToken=await deploy("MockFeeOnTransferToken","mocks/MockFeeOnTransferToken",owner,"Fee LQC","fLQC");
    const feeVault=await deploy("LQCStakingVault","staking/LQCStakingVault",owner,feeToken.target,owner.address);
    const feeRewards=await deploy("LQCStakingRewards","staking/LQCStakingRewards",owner,feeVault.target,owner.address);
    await(await feeVault.initializeRewardAccounting(feeRewards.target)).wait();

    const amount=ethers.parseEther("100");
    await(await feeToken.mint(owner.address,amount)).wait();
    await(await feeToken.approve(feeRewards.target,ethers.MaxUint256)).wait();
    await(await feeToken.setFeeBps(100)).wait();

    await assert.rejects(feeRewards.fundRewards(amount,1000));
    assert.equal(await feeRewards.rewardReserve(),0n);
    assert.equal(await feeToken.balanceOf(feeRewards.target),0n);
  });

  it("contains no mint authority, fixed-rate API or Lending accounting dependency",async function(){
    const source=fs.readFileSync(new URL("../contracts/staking/LQCStakingRewards.sol",import.meta.url),"utf8");
    const abi=artifact("LQCStakingRewards","staking/LQCStakingRewards").abi;
    const names=new Set(abi.filter(x=>x.type==="function").map(x=>x.name.toLowerCase()));
    assert.ok(!source.includes("mint("));
    assert.ok(!source.includes("LQCLendingCore"));
    for(const forbidden of["setapy","setapr","setfixedapy","setfixedapr","mint"]){
      assert.equal(names.has(forbidden),false,forbidden);
    }
    assert.ok(source.includes("fundRewards"));
    assert.ok(source.includes("rewardReserve"));
  });
});
