import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "./support/anvil-compat.mjs";
import { ethers } from "ethers";

const artifact = (name, source) => JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)));
const E = ethers.parseEther;
const gas = { gasLimit: 3000000n };
const rejected = async fn => assert.rejects(async () => { const tx = await fn(); await tx.wait(); });

describe("Master 6/16 independently funded staking rewards", function () {
  this.timeout(30000);
  let provider, owner, alice, bob, outsider, token, revenue, vault, rewards;
  async function deploy(name, source, ...args) {
    const a = artifact(name, source);
    const c = await new ethers.ContractFactory(a.abi, a.bytecode, owner).deploy(...args);
    await c.waitForDeployment();
    return c;
  }
  async function at(timestamp) {
    await provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
    await provider.send("evm_mine", []);
  }
  async function fund(source = 0, amount = E("3600")) {
    await (await rewards.fundEpoch(source, amount, 3600, gas)).wait();
    return await rewards.streams(source);
  }
  beforeEach(async function () {
    provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }), undefined, { cacheTimeout: -1 });
    [owner, alice, bob, outsider] = await Promise.all([0, 1, 2, 3].map(i => provider.getSigner(i)));
    token = await deploy("MockERC20", "mocks/MockERC20", "Test LQC", "TLQC");
    revenue = await deploy("MockFeeOnTransferToken", "mocks/MockFeeOnTransferToken", "Test revenue", "TREV");
    vault = await deploy("LQCStakingVault", "staking/LQCStakingVault", token.target, owner.address);
    rewards = await deploy("LQCStakingRewards", "staking/LQCStakingRewards", vault.target, owner.address, revenue.target);
    await (await vault.setRewardController(rewards.target, gas)).wait();
    for (const account of [owner, alice, bob]) {
      await (await token.mint(account.address, E("100000"))).wait();
      await (await token.connect(account).approve(vault.target, ethers.MaxUint256)).wait();
    }
    await (await revenue.mint(owner.address, E("100000"))).wait();
    await (await token.approve(rewards.target, ethers.MaxUint256)).wait();
    await (await revenue.approve(rewards.target, ethers.MaxUint256)).wait();
  });

  it("pays rewards from reward custody without moving or minting principal", async function () {
    await (await vault.connect(alice).stake(E("100"), alice.address, gas)).wait();
    const supply = await token.totalSupply();
    const epoch = await fund();
    await at(epoch.finish);
    assert.equal(await rewards.earned(0, alice.address), E("3600"));
    await (await rewards.connect(alice).claim(0, alice.address, gas)).wait();
    assert.equal(await vault.totalStaked(), E("100"));
    assert.equal(await token.balanceOf(vault.target), E("100"));
    assert.equal(await token.totalSupply(), supply);
    assert.equal(await rewards.reservedByToken(token.target), 0n);
    assert.equal(await rewards.earned(0, alice.address), 0n);
    await rejected(() => rewards.connect(alice).claim(0, alice.address, gas));
  });

  it("settles the old balance before a late staker joins", async function () {
    await (await vault.connect(alice).stake(E("100"), alice.address, gas)).wait();
    const epoch = await fund();
    await provider.send("evm_setNextBlockTimestamp", [Number(epoch.updated + 1800n)]);
    const receipt = await (await vault.connect(bob).stake(E("100"), bob.address, gas)).wait();
    const block = await provider.getBlock(receipt.blockNumber);
    const late = BigInt(block.timestamp);
    await at(epoch.finish);
    const earlyOnly = (late - epoch.updated) * epoch.rate;
    const shared = (epoch.finish - late) * epoch.rate;
    assert.equal(await rewards.earned(0, alice.address), earlyOnly + shared / 2n);
    assert.equal(await rewards.earned(0, bob.address), shared / 2n);
  });

  it("does not grant an increased stake retroactive rewards", async function () {
    await (await vault.connect(alice).stake(E("100"), alice.address, gas)).wait();
    await (await vault.connect(bob).stake(E("100"), bob.address, gas)).wait();
    const epoch = await fund();
    await provider.send("evm_setNextBlockTimestamp", [Number(epoch.updated + 1800n)]);
    const receipt = await (await vault.connect(alice).stake(E("200"), alice.address, gas)).wait();
    const changedAt = BigInt((await provider.getBlock(receipt.blockNumber)).timestamp);
    await at(epoch.finish);
    const before = (changedAt - epoch.updated) * epoch.rate;
    const after = (epoch.finish - changedAt) * epoch.rate;
    assert.equal(await rewards.earned(0, alice.address), before / 2n + after * 3n / 4n);
    assert.equal(await rewards.earned(0, bob.address), before / 2n + after / 4n);
  });

  it("keeps ecosystem and revenue budgets separate even with the same token", async function () {
    const v2 = await deploy("LQCStakingVault", "staking/LQCStakingVault", token.target, owner.address);
    const r2 = await deploy("LQCStakingRewards", "staking/LQCStakingRewards", v2.target, owner.address, token.target);
    await (await v2.setRewardController(r2.target, gas)).wait();
    await (await token.connect(alice).approve(v2.target, E("100"))).wait();
    await (await v2.connect(alice).stake(E("100"), alice.address, gas)).wait();
    await (await token.approve(r2.target, E("10800"))).wait();
    await (await r2.fundEpoch(0, E("3600"), 3600, gas)).wait();
    await (await r2.fundEpoch(1, E("7200"), 3600, gas)).wait();
    await at((await r2.streams(1)).finish);
    await (await r2.connect(alice).claim(0, alice.address, gas)).wait();
    assert.equal((await r2.streams(1)).paid, 0n);
    assert.equal(await r2.reservedByToken(token.target), E("7200"));
    await (await r2.connect(alice).claim(1, alice.address, gas)).wait();
    assert.equal(await r2.reservedByToken(token.target), 0n);
    assert.equal(await token.balanceOf(v2.target), E("100"));
  });

  it("returns only never-allocated rewards after a zero-staker epoch", async function () {
    const amount = E("3600") + 7n;
    const epoch = await fund(0, amount);
    await rejected(() => rewards.returnUnused(0, 1, owner.address, gas));
    await at(epoch.finish);
    await (await rewards.returnUnused(0, amount, owner.address, gas)).wait();
    assert.equal((await rewards.streams(0)).refunded, amount);
    assert.equal(await rewards.reservedByToken(token.target), 0n);
    await (await vault.connect(alice).stake(E("10"), alice.address, gas)).wait();
    assert.equal(await rewards.earned(0, alice.address), 0n);
  });

  it("keeps allocated unclaimed rewards protected across later epochs", async function () {
    await (await vault.connect(alice).stake(E("100"), alice.address, gas)).wait();
    const first = await fund();
    await at(first.finish);
    await rejected(() => rewards.returnUnused(0, 1, owner.address, gas));
    const second = await fund(0, E("7200"));
    await at(second.finish);
    assert.equal(await rewards.earned(0, alice.address), E("10800"));
    await (await rewards.connect(alice).claim(0, alice.address, gas)).wait();
    assert.equal((await rewards.streams(0)).paid, E("10800"));
  });

  it("rejects active-epoch rewrites, unfunded rewards and unauthorized funding", async function () {
    await rejected(() => rewards.connect(outsider).fundEpoch(0, 3600, 3600, gas));
    await rejected(() => rewards.fundEpoch(2, 3600, 3600, gas));
    await rejected(() => rewards.fundEpoch(0, 1, 3600, gas));
    await (await token.approve(rewards.target, 0)).wait();
    await rejected(() => rewards.fundEpoch(0, E("3600"), 3600, gas));
    assert.equal((await rewards.streams(0)).funded, 0n);
    await (await token.approve(rewards.target, ethers.MaxUint256)).wait();
    await fund();
    await rejected(() => rewards.fundEpoch(0, E("3600"), 3600, gas));
  });

  it("rejects reward-token transfer fees and rolls back a failed claim", async function () {
    await (await revenue.setFeeBps(100)).wait();
    await rejected(() => rewards.fundEpoch(1, E("3600"), 3600, gas));
    assert.equal((await rewards.streams(1)).funded, 0n);
    await (await revenue.setFeeBps(0)).wait();
    await (await vault.connect(alice).stake(E("100"), alice.address, gas)).wait();
    const epoch = await fund(1);
    await at(epoch.finish);
    await (await revenue.setFeeBps(100)).wait();
    await rejected(() => rewards.connect(alice).claim(1, alice.address, gas));
    assert.equal((await rewards.streams(1)).paid, 0n);
    assert.equal(await rewards.earned(1, alice.address), E("3600"));
    await (await revenue.setFeeBps(0)).wait();
    await (await rewards.connect(alice).claim(1, alice.address, gas)).wait();
  });

  it("never interprets a donation as funded emission or an accounted stake", async function () {
    await (await vault.connect(alice).stake(E("100"), alice.address, gas)).wait();
    await (await token.transfer(rewards.target, E("999"))).wait();
    await (await token.transfer(vault.target, E("999"))).wait();
    const epoch = await fund();
    await at(epoch.finish);
    assert.equal(await rewards.earned(0, alice.address), E("3600"));
    await (await rewards.connect(alice).claim(0, alice.address, gas)).wait();
    assert.equal(await token.balanceOf(rewards.target), E("999"));
    assert.equal(await vault.totalStaked(), E("100"));
  });

  it("binds the controller once before deposits and restricts checkpoints to the vault", async function () {
    await rejected(() => vault.setRewardController(rewards.target, gas));
    await rejected(() => rewards.connect(outsider).checkpoint(alice.address, gas));
    const v2 = await deploy("LQCStakingVault", "staking/LQCStakingVault", token.target, owner.address);
    const r2 = await deploy("LQCStakingRewards", "staking/LQCStakingRewards", v2.target, owner.address, revenue.target);
    await rejected(() => rewards.connect(outsider).returnUnused(0, 1, outsider.address, gas));
    await rejected(() => r2.fundEpoch(0, 3600, 3600, gas));
    await rejected(() => v2.setRewardController(rewards.target, gas));
    await (await token.connect(alice).approve(v2.target, E("1"))).wait();
    await (await v2.connect(alice).stake(E("1"), alice.address, gas)).wait();
    await rejected(() => v2.setRewardController(r2.target, gas));
  });

  it("preserves claim ownership, valid receivers and two-step governance", async function () {
    await (await vault.connect(alice).stake(E("100"), alice.address, gas)).wait();
    const epoch = await fund();
    await at(epoch.finish);
    await rejected(() => rewards.connect(bob).claim(0, bob.address, gas));
    for (const receiver of [ethers.ZeroAddress, vault.target, rewards.target]) {
      await rejected(() => rewards.connect(alice).claim(0, receiver, gas));
    }
    await rejected(() => rewards.connect(bob).transferOwnership(bob.address, gas));
    await (await rewards.transferOwnership(bob.address)).wait();
    await rejected(() => rewards.connect(alice).acceptOwnership(gas));
    await (await rewards.connect(bob).acceptOwnership()).wait();
    assert.equal(await rewards.owner(), bob.address);
    await (await rewards.connect(alice).claim(0, alice.address, gas)).wait();
  });
});
