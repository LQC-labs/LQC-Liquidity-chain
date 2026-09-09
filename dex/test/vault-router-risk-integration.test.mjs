import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source = name) => JSON.parse(fs.readFileSync(
  new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)
));

describe("LQC Vault-Router-Risk-Adapter isolation", function () {
  let provider, owner, user, recipient, riskAdmin;
  let tokenA, tokenB, vault, flowRouter, registry, risk, executionRouter, adapter;
  let dexId, routeData;
  const liquidity = ethers.parseEther("10000");
  const vaultDeposit = ethers.parseEther("100");

  beforeEach(async function () {
    provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
    owner = await provider.getSigner(0);
    user = await provider.getSigner(1);
    recipient = await provider.getSigner(2);
    riskAdmin = await provider.getSigner(3);

    const Token = new ethers.ContractFactory(artifact("MockERC20", "mocks/MockERC20").abi, artifact("MockERC20", "mocks/MockERC20").bytecode, owner);
    tokenA = await Token.deploy("Vault Asset", "VA");
    tokenB = await Token.deploy("Quote Asset", "QA");
    const WBNB = new ethers.ContractFactory(artifact("MockWBNB", "mocks/MockWBNB").abi, artifact("MockWBNB", "mocks/MockWBNB").bytecode, owner);
    const wbnb = await WBNB.deploy();
    const Factory = new ethers.ContractFactory(artifact("LQCFlowFactory").abi, artifact("LQCFlowFactory").bytecode, owner);
    const factory = await Factory.deploy(await owner.getAddress());
    await Promise.all([tokenA.waitForDeployment(), tokenB.waitForDeployment(), wbnb.waitForDeployment(), factory.waitForDeployment()]);

    const FlowRouter = new ethers.ContractFactory(artifact("LQCFlowRouter").abi, artifact("LQCFlowRouter").bytecode, owner);
    flowRouter = await FlowRouter.deploy(await factory.getAddress(), await wbnb.getAddress());
    const Registry = new ethers.ContractFactory(artifact("LQCDexRegistry", "router-v2/LQCDexRegistry").abi, artifact("LQCDexRegistry", "router-v2/LQCDexRegistry").bytecode, owner);
    registry = await Registry.deploy(await owner.getAddress());
    const Risk = new ethers.ContractFactory(artifact("LQCRiskRegistry", "router-v2/LQCRiskRegistry").abi, artifact("LQCRiskRegistry", "router-v2/LQCRiskRegistry").bytecode, owner);
    risk = await Risk.deploy(await owner.getAddress(), await riskAdmin.getAddress());
    await Promise.all([flowRouter.waitForDeployment(), registry.waitForDeployment(), risk.waitForDeployment()]);

    const Execution = new ethers.ContractFactory(artifact("LQCExecutionRouter", "router-v2/LQCExecutionRouter").abi, artifact("LQCExecutionRouter", "router-v2/LQCExecutionRouter").bytecode, owner);
    executionRouter = await Execution.deploy(await registry.getAddress(), await risk.getAddress());
    const Adapter = new ethers.ContractFactory(artifact("LQCFlowAdapter", "router-v2/adapters/LQCFlowAdapter").abi, artifact("LQCFlowAdapter", "router-v2/adapters/LQCFlowAdapter").bytecode, owner);
    adapter = await Adapter.deploy(await flowRouter.getAddress());
    const Vault = new ethers.ContractFactory(artifact("LQCLiquidityVault", "vault/LQCLiquidityVault").abi, artifact("LQCLiquidityVault", "vault/LQCLiquidityVault").bytecode, owner);
    vault = await Vault.deploy(await tokenA.getAddress(), await owner.getAddress(), ethers.parseEther("1000"), "LQC Vault Share", "lvVA");
    await Promise.all([executionRouter.waitForDeployment(), adapter.waitForDeployment(), vault.waitForDeployment()]);

    dexId = ethers.id("LQC_FLOW");
    const tokenAAddress = await tokenA.getAddress(), tokenBAddress = await tokenB.getAddress();
    await (await registry.addDex(dexId, await adapter.getAddress(), "LQC Flow", 100)).wait();
    await (await risk.setExecutor(await executionRouter.getAddress())).wait();
    await (await risk.setTokenLimits(tokenAAddress, true, ethers.parseEther("20"), ethers.parseEther("50"))).wait();
    await (await risk.setTokenLimits(tokenBAddress, true, ethers.parseEther("1000"), ethers.parseEther("1000"))).wait();
    await (await risk.setDexTokenCap(dexId, tokenAAddress, ethers.parseEther("20"))).wait();
    await (await registry.setDexEnabled(dexId, true)).wait();

    await (await tokenA.mint(await owner.getAddress(), liquidity)).wait();
    await (await tokenB.mint(await owner.getAddress(), liquidity)).wait();
    await (await tokenA.approve(await flowRouter.getAddress(), liquidity)).wait();
    await (await tokenB.approve(await flowRouter.getAddress(), liquidity)).wait();
    const block = await provider.getBlock("latest");
    await (await flowRouter.addLiquidity(tokenAAddress, tokenBAddress, liquidity, liquidity, 0, 0, await owner.getAddress(), BigInt(block.timestamp + 3600))).wait();

    await (await tokenA.mint(await user.getAddress(), ethers.parseEther("130"))).wait();
    await (await tokenA.connect(user).approve(await vault.getAddress(), vaultDeposit)).wait();
    await (await vault.connect(user).deposit(vaultDeposit, await user.getAddress())).wait();
    routeData = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[tokenAAddress, tokenBAddress]]);
  });

  const snapshotVault = async () => ({
    idle: await vault.idleAssets(),
    accounted: await vault.accountedAssets(),
    supply: await vault.totalSupply(),
    userShares: await vault.balanceOf(await user.getAddress()),
    routerAllowance: await tokenA.allowance(await vault.getAddress(), await executionRouter.getAddress()),
    adapterAllowance: await tokenA.allowance(await vault.getAddress(), await adapter.getAddress())
  });

  it("keeps Vault principal and share accounting unchanged during a successful risk-controlled swap", async function () {
    const before = await snapshotVault();
    const amountIn = ethers.parseEther("10");
    await (await tokenA.connect(user).approve(await executionRouter.getAddress(), amountIn)).wait();
    const block = await provider.getBlock("latest");
    await (await executionRouter.connect(user).swapExactInput(
      dexId, await tokenA.getAddress(), await tokenB.getAddress(), amountIn, 1n,
      await recipient.getAddress(), BigInt(block.timestamp + 3600), routeData
    )).wait();

    assert.deepEqual(await snapshotVault(), before);
    assert.equal(await tokenA.balanceOf(await executionRouter.getAddress()), 0n);
    assert.equal(await tokenA.balanceOf(await adapter.getAddress()), 0n);
    assert.equal((await risk.dailyUsage(await tokenA.getAddress())).amount, amountIn);
  });

  it("rolls back user, risk, Router, and Adapter state without touching Vault when a cap rejects the swap", async function () {
    const beforeVault = await snapshotVault();
    const amountIn = ethers.parseEther("21");
    const userBefore = await tokenA.balanceOf(await user.getAddress());
    await (await tokenA.connect(user).approve(await executionRouter.getAddress(), amountIn)).wait();
    const block = await provider.getBlock("latest");
    const tx = await executionRouter.connect(user).swapExactInput(
      dexId, await tokenA.getAddress(), await tokenB.getAddress(), amountIn, 1n,
      await recipient.getAddress(), BigInt(block.timestamp + 3600), routeData, { gasLimit: 1000000n }
    );
    await assert.rejects(tx.wait());

    assert.deepEqual(await snapshotVault(), beforeVault);
    assert.equal(await tokenA.balanceOf(await user.getAddress()), userBefore);
    assert.equal((await risk.dailyUsage(await tokenA.getAddress())).amount, 0n);
    assert.equal(await tokenA.balanceOf(await executionRouter.getAddress()), 0n);
    assert.equal(await tokenA.balanceOf(await adapter.getAddress()), 0n);
  });

  it("does not expose Vault funds or approvals when the DEX adapter is disabled", async function () {
    const beforeVault = await snapshotVault();
    const amountIn = ethers.parseEther("5");
    await (await tokenA.connect(user).approve(await executionRouter.getAddress(), amountIn)).wait();
    await (await registry.setDexEnabled(dexId, false)).wait();
    const block = await provider.getBlock("latest");
    const tx = await executionRouter.connect(user).swapExactInput(
      dexId, await tokenA.getAddress(), await tokenB.getAddress(), amountIn, 1n,
      await recipient.getAddress(), BigInt(block.timestamp + 3600), routeData, { gasLimit: 1000000n }
    );
    await assert.rejects(tx.wait());

    assert.deepEqual(await snapshotVault(), beforeVault);
    assert.equal(await tokenA.allowance(await vault.getAddress(), await executionRouter.getAddress()), 0n);
    assert.equal(await tokenA.allowance(await vault.getAddress(), await adapter.getAddress()), 0n);
  });

  it("keeps actively deployed strategy assets isolated from successful and rejected swaps", async function () {
    const IdleStrategy = new ethers.ContractFactory(
      artifact("LQCIdleStrategyAdapter", "vault/adapters/LQCIdleStrategyAdapter").abi,
      artifact("LQCIdleStrategyAdapter", "vault/adapters/LQCIdleStrategyAdapter").bytecode,
      owner
    );
    const strategy = await IdleStrategy.deploy(await tokenA.getAddress(), await vault.getAddress());
    await strategy.waitForDeployment();

    const allocated = ethers.parseEther("60");
    await (await vault.setStrategy(await strategy.getAddress())).wait();
    await (await vault.setStrategyLimits(allocated, 0)).wait();
    await (await vault.allocateToStrategy(allocated)).wait();

    const strategySnapshot = async () => ({
      vault: await snapshotVault(),
      debt: await vault.strategyDebt(),
      managed: await strategy.totalManagedAssets(),
      strategyBalance: await tokenA.balanceOf(await strategy.getAddress())
    });
    const before = await strategySnapshot();
    assert.equal(before.debt, allocated);
    assert.equal(before.managed, allocated);
    assert.equal(before.strategyBalance, allocated);

    const amountIn = ethers.parseEther("5");
    await (await tokenA.connect(user).approve(await executionRouter.getAddress(), amountIn * 2n)).wait();
    let block = await provider.getBlock("latest");
    await (await executionRouter.connect(user).swapExactInput(
      dexId, await tokenA.getAddress(), await tokenB.getAddress(), amountIn, 1n,
      await recipient.getAddress(), BigInt(block.timestamp + 3600), routeData
    )).wait();
    assert.deepEqual(await strategySnapshot(), before);

    await (await registry.setDexEnabled(dexId, false)).wait();
    block = await provider.getBlock("latest");
    const rejected = await executionRouter.connect(user).swapExactInput(
      dexId, await tokenA.getAddress(), await tokenB.getAddress(), amountIn, 1n,
      await recipient.getAddress(), BigInt(block.timestamp + 3600), routeData, { gasLimit: 1000000n }
    );
    await assert.rejects(rejected.wait());

    assert.deepEqual(await strategySnapshot(), before);
    assert.equal((await risk.dailyUsage(await tokenA.getAddress())).amount, amountIn);
    assert.equal(await tokenA.balanceOf(await executionRouter.getAddress()), 0n);
    assert.equal(await tokenA.balanceOf(await adapter.getAddress()), 0n);
  });
});
