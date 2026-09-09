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
});
