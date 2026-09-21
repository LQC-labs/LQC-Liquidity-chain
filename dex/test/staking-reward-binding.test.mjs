import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact = (name, source) => JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)));

describe("Master 6/16 reward initialization boundary", function () {
  this.timeout(30000);
  let provider, owner, user, token, vault, module;
  async function deploy(name, source, ...args) {
    const a = artifact(name, source);
    const c = await new ethers.ContractFactory(a.abi, a.bytecode, owner).deploy(...args);
    await c.waitForDeployment();
    return c;
  }
  beforeEach(async function () {
    provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
    owner = await provider.getSigner(0);
    user = await provider.getSigner(1);
    token = await deploy("MockERC20", "mocks/MockERC20", "Test LQC", "TLQC");
    vault = await deploy("LQCStakingVault", "staking/LQCStakingVault", token.target, owner.address);
    module = await deploy("LQCStakingRewards", "staking/LQCStakingRewards", vault.target, owner.address);
    await (await token.mint(owner.address, ethers.parseEther("1000"))).wait();
    await (await token.mint(user.address, ethers.parseEther("100"))).wait();
    await (await token.approve(module.target, ethers.MaxUint256)).wait();
    await (await token.connect(user).approve(vault.target, ethers.MaxUint256)).wait();
  });

  it("rejects funding before mutual binding even when allowance and funds are sufficient", async function () {
    const amount = ethers.parseEther("100");
    await assert.rejects(module.fundRewards.staticCall(amount, 1000), /RewardModuleNotBound/);
    await assert.rejects(async () => {
      const tx = await module.fundRewards(amount, 1000, { gasLimit: 1000000 });
      await tx.wait();
    });
    assert.equal(await module.totalFunded(), 0n);
    assert.equal(await token.balanceOf(module.target), 0n);
    await (await vault.initializeRewardAccounting(module.target)).wait();
    await (await module.fundRewards(amount, 1000, { gasLimit: 1000000 })).wait();
    assert.equal(await module.rewardReserve(), amount);
  });

  it("rejects a reward module bound to another vault", async function () {
    const otherVault = await deploy("LQCStakingVault", "staking/LQCStakingVault", token.target, owner.address);
    const foreignModule = await deploy("LQCStakingRewards", "staking/LQCStakingRewards", otherVault.target, owner.address);
    await assert.rejects(vault.initializeRewardAccounting.staticCall(foreignModule.target), /InvalidModule/);
    assert.equal(await vault.rewardAccounting(), ethers.ZeroAddress);
  });

  it("does not introduce reward history after uncheckpointed stakes already exist", async function () {
    await (await vault.connect(user).stake(ethers.parseEther("1"), user.address)).wait();
    await assert.rejects(vault.initializeRewardAccounting.staticCall(module.target), /InvalidModule/);
    assert.equal(await vault.rewardAccounting(), ethers.ZeroAddress);
    assert.equal(await vault.stakedBalance(user.address), ethers.parseEther("1"));
  });

  it("does not let a second unbound module fund rewards for the same vault", async function () {
    await (await vault.initializeRewardAccounting(module.target)).wait();
    const duplicate = await deploy("LQCStakingRewards", "staking/LQCStakingRewards", vault.target, owner.address);
    await (await token.approve(duplicate.target, ethers.MaxUint256)).wait();
    await assert.rejects(duplicate.fundRewards.staticCall(ethers.parseEther("100"), 1000), /RewardModuleNotBound/);
    await assert.rejects(vault.initializeRewardAccounting.staticCall(duplicate.target), /AlreadyConfigured/);
  });
});
