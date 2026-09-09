import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source) => JSON.parse(fs.readFileSync(
  new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)
));

describe("LQC critical attack paths", function () {
  let provider, owner, riskAdmin, attacker, user;
  const deploy = async (signer, name, source, args = []) => {
    const value = artifact(name, source);
    const contract = await new ethers.ContractFactory(value.abi, value.bytecode, signer).deploy(...args);
    await contract.waitForDeployment();
    return contract;
  };

  beforeEach(async function () {
    provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
    [owner, riskAdmin, attacker, user] = await Promise.all([0, 1, 2, 3].map(index => provider.getSigner(index)));
  });

  it("rolls back balances and approvals when a malicious DEX adapter reenters", async function () {
    const tokenIn = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Input", "IN"]);
    const tokenOut = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Output", "OUT"]);
    const registry = await deploy(owner, "LQCDexRegistry", "router-v2/LQCDexRegistry", [await owner.getAddress()]);
    const router = await deploy(owner, "LQCExecutionRouter", "router-v2/LQCExecutionRouter", [await registry.getAddress(), ethers.ZeroAddress]);
    const dexId = ethers.id("REENTRANT_DEX");
    const adapter = await deploy(owner, "MockReentrantExecutionAdapter", "mocks/MockReentrantExecutionAdapter", [await router.getAddress(), dexId]);
    await (await registry.addDex(dexId, await adapter.getAddress(), "Adversarial", 1)).wait();
    const amount = ethers.parseEther("10"), ownerAddress = await owner.getAddress();
    await (await tokenIn.mint(ownerAddress, amount)).wait();
    await (await tokenIn.approve(await router.getAddress(), amount)).wait();
    const before = await tokenIn.balanceOf(ownerAddress), deadline = BigInt((await provider.getBlock("latest")).timestamp + 3600);
    await assert.rejects(router.swapExactInput(dexId, await tokenIn.getAddress(), await tokenOut.getAddress(),
      amount, 1n, ownerAddress, deadline, "0x"));
    assert.equal(await tokenIn.balanceOf(ownerAddress), before);
    assert.equal(await tokenIn.balanceOf(await router.getAddress()), 0n);
    assert.equal(await tokenIn.allowance(await router.getAddress(), await adapter.getAddress()), 0n);
  });

  it("prevents authority theft and pause bypass without consuming risk limits", async function () {
    const risk = await deploy(owner, "LQCRiskRegistry", "router-v2/LQCRiskRegistry", [await owner.getAddress(), await riskAdmin.getAddress()]);
    const tokenIn = "0x00000000000000000000000000000000000000a1", tokenOut = "0x00000000000000000000000000000000000000b1", dexId = ethers.id("DEX");
    await (await risk.setExecutor(await owner.getAddress())).wait();
    await (await risk.setTokenLimits(tokenIn, true, 1000n, 2000n)).wait();
    await (await risk.setTokenLimits(tokenOut, true, 1000n, 2000n)).wait();
    await (await risk.setDexTokenCap(dexId, tokenIn, 1000n)).wait();
    await assert.rejects(risk.connect(attacker).setExecutor(await attacker.getAddress()));
    await assert.rejects(risk.connect(attacker).beginOwnershipTransfer(await attacker.getAddress()));
    await (await risk.connect(riskAdmin).pauseSwaps()).wait();
    await assert.rejects(risk.connect(attacker).resumeSwaps());
    await assert.rejects(risk.consumeSwap(tokenIn, tokenOut, [dexId], [100n]));
    const usage = await risk.dailyUsage(tokenIn);
    assert.equal(usage.amount, 0n);
    assert.equal(await risk.swapsPaused(), true);
    assert.equal(await risk.owner(), await owner.getAddress());
  });

  it("prevents an attacker from reopening or reconfiguring a paused Vault", async function () {
    const token = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Vault", "VLT"]);
    const vault = await deploy(owner, "LQCLiquidityVault", "vault/LQCLiquidityVault",
      [await token.getAddress(), await owner.getAddress(), ethers.parseEther("1000"), "Share", "SHARE"]);
    await (await token.mint(await user.getAddress(), ethers.parseEther("100"))).wait();
    await (await token.connect(user).approve(await vault.getAddress(), ethers.MaxUint256)).wait();
    await (await vault.connect(user).deposit(ethers.parseEther("10"), await user.getAddress())).wait();
    await (await vault.pauseDeposits()).wait();
    const cap = await vault.depositCap(), assets = await vault.totalAssets();
    await assert.rejects(vault.connect(attacker).resumeDeposits());
    await assert.rejects(vault.connect(attacker).setDepositCap(ethers.MaxUint256));
    await assert.rejects(vault.connect(attacker).setStrategy(await attacker.getAddress()));
    await assert.rejects(vault.connect(attacker).beginOwnershipTransfer(await attacker.getAddress()));
    assert.equal(await vault.depositsPaused(), true);
    assert.equal(await vault.depositCap(), cap);
    assert.equal(await vault.totalAssets(), assets);
    assert.equal(await vault.owner(), await owner.getAddress());
  });

  it("rolls back a Strategy callback attack during Vault allocation", async function () {
    const token = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Vault", "VLT"]);
    const vault = await deploy(owner, "LQCLiquidityVault", "vault/LQCLiquidityVault",
      [await token.getAddress(), await owner.getAddress(), ethers.parseEther("1000"), "Share", "SHARE"]);
    const strategy = await deploy(owner, "MockReentrantStrategyAdapter", "mocks/MockReentrantStrategyAdapter",
      [await token.getAddress(), await vault.getAddress()]);
    const assets = ethers.parseEther("100"), allocation = ethers.parseEther("20");
    await (await token.mint(await user.getAddress(), assets)).wait();
    await (await token.connect(user).approve(await vault.getAddress(), assets)).wait();
    await (await vault.connect(user).deposit(assets, await user.getAddress())).wait();
    await (await vault.setStrategy(await strategy.getAddress())).wait();
    await (await vault.setStrategyLimits(allocation, 100)).wait();
    await (await vault.resumeAllocations()).wait();
    await (await strategy.setAttackMode(1)).wait();
    await assert.rejects(vault.allocateToStrategy(allocation));
    assert.equal(await vault.strategyDebt(), 0n);
    assert.equal(await vault.idleAssets(), assets);
    assert.equal(await token.balanceOf(await strategy.getAddress()), 0n);
    assert.equal(await strategy.totalManagedAssets(), 0n);
  });

  it("rolls back a Strategy callback attack during Vault recall", async function () {
    const token = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Vault", "VLT"]);
    const vault = await deploy(owner, "LQCLiquidityVault", "vault/LQCLiquidityVault",
      [await token.getAddress(), await owner.getAddress(), ethers.parseEther("1000"), "Share", "SHARE"]);
    const strategy = await deploy(owner, "MockReentrantStrategyAdapter", "mocks/MockReentrantStrategyAdapter",
      [await token.getAddress(), await vault.getAddress()]);
    const assets = ethers.parseEther("100"), allocation = ethers.parseEther("20");
    await (await token.mint(await user.getAddress(), assets)).wait();
    await (await token.connect(user).approve(await vault.getAddress(), assets)).wait();
    await (await vault.connect(user).deposit(assets, await user.getAddress())).wait();
    await (await vault.setStrategy(await strategy.getAddress())).wait();
    await (await vault.setStrategyLimits(allocation, 100)).wait();
    await (await vault.resumeAllocations()).wait();
    await (await vault.allocateToStrategy(allocation)).wait();
    await (await strategy.setAttackMode(2)).wait();
    await assert.rejects(vault.recallFromStrategy(allocation));
    assert.equal(await vault.strategyDebt(), allocation);
    assert.equal(await vault.idleAssets(), assets - allocation);
    assert.equal(await token.balanceOf(await strategy.getAddress()), allocation);
    assert.equal(await strategy.totalManagedAssets(), allocation);
  });

  it("rejects false Strategy deployment receipts and managed-asset accounting", async function () {
    const token = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Vault", "VLT"]);
    const vault = await deploy(owner, "LQCLiquidityVault", "vault/LQCLiquidityVault",
      [await token.getAddress(), await owner.getAddress(), ethers.parseEther("1000"), "Share", "SHARE"]);
    const strategy = await deploy(owner, "MockDishonestStrategyAdapter", "mocks/MockDishonestStrategyAdapter",
      [await token.getAddress(), await vault.getAddress()]);
    const assets = ethers.parseEther("100"), allocation = ethers.parseEther("20");
    await (await token.mint(await user.getAddress(), assets)).wait();
    await (await token.connect(user).approve(await vault.getAddress(), assets)).wait();
    await (await vault.connect(user).deposit(assets, await user.getAddress())).wait();
    await (await vault.setStrategy(await strategy.getAddress())).wait();
    await (await vault.setStrategyLimits(allocation, 100)).wait();
    await (await vault.resumeAllocations()).wait();
    for (const mode of [1, 2]) {
      await (await strategy.setLieMode(mode)).wait();
      await assert.rejects(vault.allocateToStrategy(allocation));
      assert.equal(await vault.strategyDebt(), 0n);
      assert.equal(await vault.idleAssets(), assets);
      assert.equal(await strategy.totalManagedAssets(), 0n);
      assert.equal(await token.balanceOf(await strategy.getAddress()), 0n);
    }
  });

  it("rejects false Strategy withdrawal amounts, balances, and debt reduction", async function () {
    const token = await deploy(owner, "MockERC20", "mocks/MockERC20", ["Vault", "VLT"]);
    const vault = await deploy(owner, "LQCLiquidityVault", "vault/LQCLiquidityVault",
      [await token.getAddress(), await owner.getAddress(), ethers.parseEther("1000"), "Share", "SHARE"]);
    const strategy = await deploy(owner, "MockDishonestStrategyAdapter", "mocks/MockDishonestStrategyAdapter",
      [await token.getAddress(), await vault.getAddress()]);
    const assets = ethers.parseEther("100"), allocation = ethers.parseEther("20");
    await (await token.mint(await user.getAddress(), assets)).wait();
    await (await token.connect(user).approve(await vault.getAddress(), assets)).wait();
    await (await vault.connect(user).deposit(assets, await user.getAddress())).wait();
    await (await vault.setStrategy(await strategy.getAddress())).wait();
    await (await vault.setStrategyLimits(allocation, 100)).wait();
    await (await vault.resumeAllocations()).wait();
    await (await vault.allocateToStrategy(allocation)).wait();
    for (const mode of [3, 4, 5]) {
      await (await strategy.setLieMode(mode)).wait();
      await assert.rejects(vault.recallFromStrategy(allocation));
      assert.equal(await vault.strategyDebt(), allocation);
      assert.equal(await vault.idleAssets(), assets - allocation);
      assert.equal(await strategy.totalManagedAssets(), allocation);
      assert.equal(await token.balanceOf(await strategy.getAddress()), allocation);
    }
  });

  it("ignores a positive token rebase when pricing later Vault deposits", async function () {
    const token = await deploy(owner, "MockRebasingToken", "mocks/MockRebasingToken", ["Rebase", "RBS"]);
    const vault = await deploy(owner, "LQCLiquidityVault", "vault/LQCLiquidityVault",
      [await token.getAddress(), await owner.getAddress(), ethers.parseEther("1000"), "Share", "SHARE"]);
    const deposit = ethers.parseEther("100"), donation = ethers.parseEther("20");
    for (const signer of [user, attacker]) {
      await (await token.mint(await signer.getAddress(), deposit)).wait();
      await (await token.connect(signer).approve(await vault.getAddress(), deposit)).wait();
    }
    await (await vault.connect(user).deposit(deposit, await user.getAddress())).wait();
    await (await token.increaseBalance(await vault.getAddress(), donation)).wait();
    await (await vault.connect(attacker).deposit(deposit, await attacker.getAddress())).wait();
    assert.equal(await vault.balanceOf(await attacker.getAddress()), deposit);
    assert.equal(await vault.totalAssets(), deposit * 2n);
    assert.equal(await vault.idleAssets(), deposit * 2n + donation);
  });

  it("fails closed after a negative token rebase creates an idle-backing deficit", async function () {
    const token = await deploy(owner, "MockRebasingToken", "mocks/MockRebasingToken", ["Rebase", "RBS"]);
    const vault = await deploy(owner, "LQCLiquidityVault", "vault/LQCLiquidityVault",
      [await token.getAddress(), await owner.getAddress(), ethers.parseEther("1000"), "Share", "SHARE"]);
    const strategy = await deploy(owner, "LQCIdleStrategyAdapter", "vault/adapters/LQCIdleStrategyAdapter",
      [await token.getAddress(), await vault.getAddress()]);
    const deposit = ethers.parseEther("100"), loss = ethers.parseEther("20"), allocation = ethers.parseEther("20");
    await (await token.mint(await user.getAddress(), deposit)).wait();
    await (await token.mint(await attacker.getAddress(), deposit)).wait();
    await (await token.connect(user).approve(await vault.getAddress(), deposit)).wait();
    await (await token.connect(attacker).approve(await vault.getAddress(), deposit)).wait();
    await (await vault.connect(user).deposit(deposit, await user.getAddress())).wait();
    await (await vault.setStrategy(await strategy.getAddress())).wait();
    await (await vault.setStrategyLimits(allocation, 100)).wait();
    await (await vault.resumeAllocations()).wait();
    await (await token.decreaseBalance(await vault.getAddress(), loss)).wait();
    const supply = await vault.totalSupply(), userShares = await vault.balanceOf(await user.getAddress());
    await assert.rejects(vault.allocateToStrategy(allocation));
    await assert.rejects(vault.connect(attacker).deposit(deposit, await attacker.getAddress()));
    await assert.rejects(vault.connect(user).withdraw(ethers.parseEther("1"), await user.getAddress(), await user.getAddress()));
    await assert.rejects(vault.connect(user).redeem(ethers.parseEther("1"), await user.getAddress(), await user.getAddress()));
    assert.equal(await vault.totalAssets(), deposit);
    assert.equal(await vault.idleAssets(), deposit - loss);
    assert.equal(await vault.strategyDebt(), 0n);
    assert.equal(await strategy.totalManagedAssets(), 0n);
    assert.equal(await token.balanceOf(await strategy.getAddress()), 0n);
    assert.equal(await vault.totalSupply(), supply);
    assert.equal(await vault.balanceOf(await user.getAddress()), userShares);
    assert.equal(await vault.balanceOf(await attacker.getAddress()), 0n);
    assert.equal(await token.balanceOf(await attacker.getAddress()), deposit);
  });

  it("accepts empty ERC-20 returns but rejects false and malformed transferFrom returns atomically", async function () {
    const token = await deploy(owner, "MockNonStandardERC20", "mocks/MockNonStandardERC20");
    const harness = await deploy(owner, "SafeTransferHarness", "mocks/SafeTransferHarness");
    const amount = ethers.parseEther("10"), userAddress = await user.getAddress();
    await (await token.mint(userAddress, amount * 4n)).wait();
    await (await token.connect(user).approve(await harness.getAddress(), ethers.MaxUint256)).wait();
    await (await token.setBehavior(2, false)).wait();
    await (await harness.pull(await token.getAddress(), userAddress, amount)).wait();
    assert.equal(await token.balanceOf(await harness.getAddress()), amount);
    for (const mode of [1, 3, 4]) {
      await (await token.setBehavior(mode, false)).wait();
      const before = await token.balanceOf(userAddress);
      await assert.rejects(async () => (await harness.pull(await token.getAddress(), userAddress, amount)).wait(), `mode ${mode}`);
      assert.equal(await token.balanceOf(userAddress), before);
      assert.equal(await token.balanceOf(await harness.getAddress()), amount);
    }
  });

  it("rejects false and malformed transfer returns without leaking harness custody", async function () {
    const token = await deploy(owner, "MockNonStandardERC20", "mocks/MockNonStandardERC20");
    const harness = await deploy(owner, "SafeTransferHarness", "mocks/SafeTransferHarness");
    const amount = ethers.parseEther("10"), recipient = await user.getAddress();
    await (await token.mint(await harness.getAddress(), amount * 4n)).wait();
    for (const mode of [1, 3, 4]) {
      await (await token.setBehavior(mode, false)).wait();
      const before = await token.balanceOf(await harness.getAddress());
      await assert.rejects(async () => (await harness.push(await token.getAddress(), recipient, amount)).wait());
      assert.equal(await token.balanceOf(await harness.getAddress()), before);
      assert.equal(await token.balanceOf(recipient), 0n);
    }
  });

  it("supports zero-first approvals and rejects malformed approval return data", async function () {
    const token = await deploy(owner, "MockNonStandardERC20", "mocks/MockNonStandardERC20");
    const harness = await deploy(owner, "SafeTransferHarness", "mocks/SafeTransferHarness");
    const spender = await attacker.getAddress(), tokenAddress = await token.getAddress();
    await (await harness.approveExact(tokenAddress, spender, 10n)).wait();
    await (await token.setBehavior(0, true)).wait();
    await (await harness.approveExact(tokenAddress, spender, 20n)).wait();
    assert.equal(await token.allowance(await harness.getAddress(), spender), 20n);
    for (const mode of [1, 3, 4]) {
      await (await token.setBehavior(mode, false)).wait();
      await assert.rejects(async () => (await harness.approveExact(tokenAddress, spender, 30n)).wait());
      assert.equal(await token.allowance(await harness.getAddress(), spender), 20n);
    }
  });

  it("fails Vault deposits closed on reverting or short balanceOf responses", async function () {
    const token = await deploy(owner, "MockAdversarialERC20", "mocks/MockAdversarialERC20");
    const vault = await deploy(owner, "LQCLiquidityVault", "vault/LQCLiquidityVault",
      [await token.getAddress(), await owner.getAddress(), ethers.parseEther("1000"), "Share", "SHARE"]);
    const amount = ethers.parseEther("10"), userAddress = await user.getAddress();
    await (await token.mint(userAddress, amount)).wait();
    await (await token.connect(user).approve(await vault.getAddress(), amount)).wait();
    for (const mode of [1, 2]) {
      await (await token.setBalanceMode(mode)).wait();
      await assert.rejects(vault.connect(user).deposit(amount, userAddress));
      assert.equal(await vault.totalAssets(), 0n);
      assert.equal(await vault.totalSupply(), 0n);
      assert.equal(await token.rawBalanceOf(userAddress), amount);
      assert.equal(await token.rawBalanceOf(await vault.getAddress()), 0n);
    }
  });

  it("rolls back token callback reentrancy during Vault deposit and withdrawal", async function () {
    const token = await deploy(owner, "MockAdversarialERC20", "mocks/MockAdversarialERC20");
    const vault = await deploy(owner, "LQCLiquidityVault", "vault/LQCLiquidityVault",
      [await token.getAddress(), await owner.getAddress(), ethers.parseEther("1000"), "Share", "SHARE"]);
    const amount = ethers.parseEther("100"), userAddress = await user.getAddress(), vaultAddress = await vault.getAddress();
    await (await token.mint(userAddress, amount)).wait();
    await (await token.connect(user).approve(vaultAddress, amount)).wait();
    const depositAttack = vault.interface.encodeFunctionData("deposit", [1n, userAddress]);
    await (await token.setCallback(vaultAddress, depositAttack)).wait();
    await assert.rejects(vault.connect(user).deposit(amount, userAddress));
    assert.equal(await vault.totalAssets(), 0n);
    assert.equal(await token.rawBalanceOf(userAddress), amount);
    await (await token.setCallback(ethers.ZeroAddress, "0x")).wait();
    await (await vault.connect(user).deposit(amount, userAddress, { gasLimit: 1_000_000 })).wait();
    const shares = await vault.balanceOf(userAddress), supply = await vault.totalSupply();
    const withdrawAttack = vault.interface.encodeFunctionData("withdraw", [1n, userAddress, userAddress]);
    await (await token.setCallback(vaultAddress, withdrawAttack)).wait();
    await assert.rejects(vault.connect(user).withdraw(ethers.parseEther("1"), userAddress, userAddress));
    assert.equal(await vault.totalAssets(), amount);
    assert.equal(await vault.totalSupply(), supply);
    assert.equal(await vault.balanceOf(userAddress), shares);
    assert.equal(await token.rawBalanceOf(vaultAddress), amount);
  });
});
