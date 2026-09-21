import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact=(name,source)=>JSON.parse(fs.readFileSync(
  new URL(`../artifacts/contracts/${source}.sol/${name}.json`,import.meta.url)
));

describe("Master 6/15 LQC Staking Vault",function(){
  this.timeout(30000);
  let provider,owner,user,other,token,vault;

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
    vault=await deploy("LQCStakingVault","staking/LQCStakingVault",owner,token.target,owner.address,other.address,7*24*60*60,30*24*60*60);

    await(await token.mint(user.address,ethers.parseEther("1000"))).wait();
    await(await token.connect(user).approve(vault.target,ethers.MaxUint256)).wait();
  });

  it("custodies and accounts staking principal exactly one-for-one",async function(){
    const amount=ethers.parseEther("100");
    await(await vault.connect(user).stake(amount,user.address)).wait();

    assert.equal(await vault.asset(),token.target);
    assert.equal(await vault.stakedBalance(user.address),amount);
    assert.equal(await vault.totalStaked(),amount);
    assert.equal(await token.balanceOf(vault.target),amount);
    assert.equal(await vault.isFullyBacked(),true);
  });

  it("allows staking for another account without transferring staking ownership",async function(){
    const amount=ethers.parseEther("25");
    await(await vault.connect(user).stake(amount,other.address)).wait();

    assert.equal(await vault.stakedBalance(user.address),0n);
    assert.equal(await vault.stakedBalance(other.address),amount);
    assert.equal(await vault.totalStaked(),amount);
  });

  it("rejects zero amount and zero-account staking",async function(){
    await assert.rejects(vault.connect(user).stake(0,user.address));
    await assert.rejects(vault.connect(user).stake(1,ethers.ZeroAddress));
  });

  it("rejects fee-on-transfer staking assets so accounting cannot drift",async function(){
    const feeToken=await deploy("MockFeeOnTransferToken","mocks/MockFeeOnTransferToken",owner,"Fee LQC","fLQC");
    const feeVault=await deploy("LQCStakingVault","staking/LQCStakingVault",owner,feeToken.target,owner.address,other.address,7*24*60*60,30*24*60*60);
    const amount=ethers.parseEther("100");

    await(await feeToken.mint(user.address,amount)).wait();
    await(await feeToken.setFeeBps(100)).wait();
    await(await feeToken.connect(user).approve(feeVault.target,ethers.MaxUint256)).wait();

    await assert.rejects(feeVault.connect(user).stake(amount,user.address));
    assert.equal(await feeVault.totalStaked(),0n);
    assert.equal(await feeVault.stakedBalance(user.address),0n);
    assert.equal(await feeToken.balanceOf(feeVault.target),0n);
  });

  it("does not credit unsolicited token donations as staking principal",async function(){
    const stake=ethers.parseEther("100");
    const donation=ethers.parseEther("50");
    await(await vault.connect(user).stake(stake,user.address)).wait();

    await(await token.mint(other.address,donation)).wait();
    await(await token.connect(other).transfer(vault.target,donation)).wait();

    assert.equal(await vault.stakedBalance(user.address),stake);
    assert.equal(await vault.totalStaked(),stake);
    assert.equal(await token.balanceOf(vault.target),stake+donation);
    assert.equal(await vault.isFullyBacked(),true);
  });

  it("uses two-step ownership transfer and rejects unauthorized acceptance",async function(){
    await assert.rejects(vault.connect(user).transferOwnership(other.address));
    await(await vault.transferOwnership(other.address)).wait();
    await assert.rejects(vault.connect(user).acceptOwnership());
    await(await vault.connect(other).acceptOwnership()).wait();

    assert.equal(await vault.owner(),other.address);
    assert.equal(await vault.pendingOwner(),ethers.ZeroAddress);
  });

  it("preserves the 6/15 principal-isolation invariants as later Staking stages evolve",async function(){
    const abi=artifact("LQCStakingVault","staking/LQCStakingVault").abi;
    const names=new Set(abi.filter(x=>x.type==="function").map(x=>x.name));
    for(const forbidden of["claim","rewardRate","notifyReward","borrow","repay","supplyLiquidity","mint"]){
      assert.equal(names.has(forbidden),false,forbidden);
    }

    const source=fs.readFileSync(new URL("../contracts/staking/LQCStakingVault.sol",import.meta.url),"utf8");
    assert.ok(!source.includes("LQCLendingCore"));
    assert.ok(!source.includes("mint("));
  });
});
