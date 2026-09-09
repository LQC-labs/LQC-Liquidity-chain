import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source) => JSON.parse(fs.readFileSync(
  new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)
));

describe("LQC Liquidity Vault V1", function () {
  let provider, owner, guardian, user, other, token, vault;

  beforeEach(async function () {
    provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
    [owner, guardian, user, other] = await Promise.all([0, 1, 2, 3].map(index => provider.getSigner(index)));
    const Token = new ethers.ContractFactory(artifact("MockERC20", "mocks/MockERC20").abi,
      artifact("MockERC20", "mocks/MockERC20").bytecode, owner);
    token = await Token.deploy("Vault Asset", "VASSET");
    const Vault = new ethers.ContractFactory(artifact("LQCLiquidityVault", "vault/LQCLiquidityVault").abi,
      artifact("LQCLiquidityVault", "vault/LQCLiquidityVault").bytecode, owner);
    vault = await Vault.deploy(await token.getAddress(), await owner.getAddress(), ethers.parseEther("1000000"), "LQC Vault Share", "lvLQC");
    await Promise.all([token.waitForDeployment(), vault.waitForDeployment()]);
    await (await token.mint(await user.getAddress(), ethers.parseEther("100000"))).wait();
    await (await token.connect(user).approve(await vault.getAddress(), ethers.MaxUint256)).wait();
  });

  it("mints permanently locked initial shares and returns exact assets", async function () {
    const assets = ethers.parseEther("1000");
    await (await vault.connect(user).deposit(assets, await user.getAddress())).wait();
    assert.equal(await vault.totalAssets(), assets);
    assert.equal(await vault.totalSupply(), assets);
    assert.equal(await vault.balanceOf(ethers.ZeroAddress), 1000n);
    const shares = await vault.balanceOf(await user.getAddress());
    const redeemAssets = await vault.convertToAssets(shares);
    await (await vault.connect(user).redeem(shares, await user.getAddress(), await user.getAddress())).wait();
    assert.equal(await vault.totalAssets(), 1000n);
    assert.equal(redeemAssets, assets - 1000n);
  });

  it("ignores unsolicited donations when calculating later depositor shares", async function () {
    const assets = ethers.parseEther("1000");
    await (await vault.connect(user).deposit(assets, await user.getAddress())).wait();
    await (await token.mint(await other.getAddress(), assets)).wait();
    await (await token.connect(other).transfer(await vault.getAddress(), assets)).wait();
    await (await token.mint(await other.getAddress(), assets)).wait();
    await (await token.connect(other).approve(await vault.getAddress(), assets)).wait();
    await (await vault.connect(other).deposit(assets, await other.getAddress())).wait();
    assert.equal(await vault.balanceOf(await other.getAddress()), assets);
    assert.equal(await vault.totalAssets(), assets * 2n);
    assert.equal(await token.balanceOf(await vault.getAddress()), assets * 3n);
  });

  it("enforces the deposit cap and lets a guardian pause but never resume", async function () {
    await (await vault.setDepositCap(ethers.parseEther("1000"))).wait();
    await assert.rejects(vault.connect(user).deposit(ethers.parseEther("1001"), await user.getAddress()));
    await (await vault.setPauseAdmin(await guardian.getAddress())).wait();
    await (await vault.connect(guardian).pauseDeposits()).wait();
    await assert.rejects(vault.connect(user).deposit(ethers.parseEther("100"), await user.getAddress()));
    await assert.rejects(vault.connect(guardian).resumeDeposits());
    await (await vault.resumeDeposits()).wait();
    await (await vault.connect(user).deposit(ethers.parseEther("100"), await user.getAddress(), { gasLimit: 300_000 })).wait();
  });

  it("supports delegated withdrawals with exact share allowance", async function () {
    const assets = ethers.parseEther("1000");
    await (await vault.connect(user).deposit(assets, await user.getAddress())).wait();
    const withdrawAssets = ethers.parseEther("100");
    const shares = await vault.connect(user).withdraw.staticCall(withdrawAssets, await other.getAddress(), await user.getAddress());
    await (await vault.connect(user).approve(await other.getAddress(), shares)).wait();
    await (await vault.connect(other).withdraw(withdrawAssets, await other.getAddress(), await user.getAddress())).wait();
    assert.equal(await token.balanceOf(await other.getAddress()), withdrawAssets);
    assert.equal(await vault.allowance(await user.getAddress(), await other.getAddress()), 0n);
  });

  it("rejects fee-on-transfer assets and preserves all vault accounting", async function () {
    const FeeToken = new ethers.ContractFactory(artifact("MockFeeOnTransferToken", "mocks/MockFeeOnTransferToken").abi,
      artifact("MockFeeOnTransferToken", "mocks/MockFeeOnTransferToken").bytecode, owner);
    const feeToken = await FeeToken.deploy("Fee Asset", "FEE");
    const Vault = new ethers.ContractFactory(artifact("LQCLiquidityVault", "vault/LQCLiquidityVault").abi,
      artifact("LQCLiquidityVault", "vault/LQCLiquidityVault").bytecode, owner);
    const feeVault = await Vault.deploy(await feeToken.getAddress(), await owner.getAddress(), ethers.parseEther("1000"), "Fee Vault", "fvFEE");
    await Promise.all([feeToken.waitForDeployment(), feeVault.waitForDeployment()]);
    await (await feeToken.mint(await user.getAddress(), ethers.parseEther("100"))).wait();
    await (await feeToken.setFeeBps(100)).wait();
    await (await feeToken.connect(user).approve(await feeVault.getAddress(), ethers.MaxUint256)).wait();
    await assert.rejects(feeVault.connect(user).deposit(ethers.parseEther("100"), await user.getAddress()));
    assert.equal(await feeVault.totalAssets(), 0n);
    assert.equal(await feeToken.balanceOf(await feeVault.getAddress()), 0n);
  });

  it("uses two-step ownership transfer", async function () {
    await (await vault.beginOwnershipTransfer(await other.getAddress())).wait();
    await assert.rejects(vault.connect(user).acceptOwnership());
    await (await vault.connect(other).acceptOwnership()).wait();
    assert.equal(await vault.owner(), await other.getAddress());
    assert.equal(await vault.pauseAdmin(), await other.getAddress());
    assert.equal(await vault.strategyAdmin(), await other.getAddress());
    await assert.rejects(vault.setDepositCap(1));
    await assert.rejects(vault.pauseDeposits());
    await (await vault.connect(other).pauseDeposits()).wait();
  });

  it("preserves explicitly separated administrators across ownership transfer", async function () {
    await (await vault.setPauseAdmin(await guardian.getAddress())).wait();
    await (await vault.setStrategyAdmin(await user.getAddress())).wait();
    await (await vault.beginOwnershipTransfer(await other.getAddress())).wait();
    await (await vault.connect(other).acceptOwnership()).wait();

    assert.equal(await vault.owner(), await other.getAddress());
    assert.equal(await vault.pauseAdmin(), await guardian.getAddress());
    assert.equal(await vault.strategyAdmin(), await user.getAddress());
    await assert.rejects(vault.pauseDeposits());
    await (await vault.connect(guardian).pauseDeposits()).wait();
  });

  it("stages every Strategy change behind an allocation pause", async function () {
    const Adapter = new ethers.ContractFactory(artifact("LQCIdleStrategyAdapter", "vault/adapters/LQCIdleStrategyAdapter").abi,
      artifact("LQCIdleStrategyAdapter", "vault/adapters/LQCIdleStrategyAdapter").bytecode, owner);
    const first = await Adapter.deploy(await token.getAddress(), await vault.getAddress());
    const second = await Adapter.deploy(await token.getAddress(), await vault.getAddress());
    await Promise.all([first.waitForDeployment(), second.waitForDeployment()]);

    assert.equal(await vault.allocationsPaused(), true);
    await (await vault.setStrategy(await first.getAddress())).wait();
    await (await vault.resumeAllocations()).wait();
    await assert.rejects(vault.setStrategy(await second.getAddress()));
    assert.equal(await vault.strategy(), await first.getAddress());

    await (await vault.pauseAllocations()).wait();
    await (await vault.setStrategy(await second.getAddress(), { gasLimit: 500_000 })).wait();
    assert.equal(await vault.strategy(), await second.getAddress());
    assert.equal(await vault.allocationsPaused(), true);
  });

  it("allocates only to a matching approved strategy and recalls exact assets", async function () {
    const Adapter = new ethers.ContractFactory(artifact("LQCIdleStrategyAdapter", "vault/adapters/LQCIdleStrategyAdapter").abi,
      artifact("LQCIdleStrategyAdapter", "vault/adapters/LQCIdleStrategyAdapter").bytecode, owner);
    const adapter = await Adapter.deploy(await token.getAddress(), await vault.getAddress());
    await adapter.waitForDeployment();

    const deposit = ethers.parseEther("1000");
    const allocation = ethers.parseEther("400");
    await (await vault.connect(user).deposit(deposit, await user.getAddress())).wait();
    await (await vault.setStrategy(await adapter.getAddress())).wait();
    await (await vault.setStrategyLimits(allocation, 0)).wait();
    await (await vault.resumeAllocations()).wait();
    await (await vault.allocateToStrategy(allocation)).wait();

    assert.equal(await vault.strategyDebt(), allocation);
    assert.equal(await vault.idleAssets(), deposit - allocation);
    assert.equal(await adapter.totalManagedAssets(), allocation);
    assert.equal(await vault.totalAssets(), deposit);

    await (await vault.recallFromStrategy(allocation)).wait();
    assert.equal(await vault.strategyDebt(), 0n);
    assert.equal(await vault.idleAssets(), deposit);
    assert.equal(await adapter.totalManagedAssets(), 0n);
    assert.equal(await vault.totalAssets(), deposit);
  });

  it("separates strategy operations and enforces exposure and pause controls", async function () {
    const Adapter = new ethers.ContractFactory(artifact("LQCIdleStrategyAdapter", "vault/adapters/LQCIdleStrategyAdapter").abi,
      artifact("LQCIdleStrategyAdapter", "vault/adapters/LQCIdleStrategyAdapter").bytecode, owner);
    const adapter = await Adapter.deploy(await token.getAddress(), await vault.getAddress());
    await adapter.waitForDeployment();
    await (await vault.connect(user).deposit(ethers.parseEther("1000"), await user.getAddress())).wait();
    await (await vault.setStrategy(await adapter.getAddress())).wait();
    await (await vault.setStrategyLimits(ethers.parseEther("300"), 0)).wait();
    await (await vault.resumeAllocations()).wait();
    await (await vault.setStrategyAdmin(await guardian.getAddress())).wait();

    await assert.rejects(vault.connect(other).allocateToStrategy(1));
    await assert.rejects(vault.connect(guardian).allocateToStrategy(ethers.parseEther("301")));
    await (await vault.connect(guardian).allocateToStrategy(ethers.parseEther("300"))).wait();
    await assert.rejects(vault.setStrategy(ethers.ZeroAddress));

    await (await vault.pauseAllocations()).wait();
    await assert.rejects(vault.connect(guardian).allocateToStrategy(1));
    await assert.rejects(vault.connect(guardian).resumeAllocations());
    await (await vault.resumeAllocations({ gasLimit: 500_000n })).wait();
  });

  it("keeps user withdrawals within idle liquidity until strategy assets are recalled", async function () {
    const Adapter = new ethers.ContractFactory(artifact("LQCIdleStrategyAdapter", "vault/adapters/LQCIdleStrategyAdapter").abi,
      artifact("LQCIdleStrategyAdapter", "vault/adapters/LQCIdleStrategyAdapter").bytecode, owner);
    const adapter = await Adapter.deploy(await token.getAddress(), await vault.getAddress());
    await adapter.waitForDeployment();
    const deposit = ethers.parseEther("1000");
    await (await vault.connect(user).deposit(deposit, await user.getAddress())).wait();
    await (await vault.setStrategy(await adapter.getAddress())).wait();
    await (await vault.setStrategyLimits(ethers.parseEther("800"), 0)).wait();
    await (await vault.resumeAllocations()).wait();
    await (await vault.allocateToStrategy(ethers.parseEther("800"))).wait();

    await assert.rejects(vault.connect(user).withdraw(ethers.parseEther("201"), await user.getAddress(), await user.getAddress()));
    await (await vault.recallFromStrategy(ethers.parseEther("300"))).wait();
    await (await vault.connect(user).withdraw(ethers.parseEther("500"), await user.getAddress(), await user.getAddress())).wait();
  });

  it("rejects excessive strategy losses and recognizes losses within the configured bound", async function () {
    const Adapter = new ethers.ContractFactory(artifact("MockLossyStrategyAdapter", "mocks/MockLossyStrategyAdapter").abi,
      artifact("MockLossyStrategyAdapter", "mocks/MockLossyStrategyAdapter").bytecode, owner);
    const adapter = await Adapter.deploy(await token.getAddress(), await vault.getAddress());
    await adapter.waitForDeployment();
    const deposit = ethers.parseEther("1000");
    const allocation = ethers.parseEther("500");
    await (await vault.connect(user).deposit(deposit, await user.getAddress())).wait();
    await (await vault.setStrategy(await adapter.getAddress())).wait();
    await (await vault.setStrategyLimits(allocation, 100)).wait();
    await (await vault.resumeAllocations()).wait();
    await (await vault.allocateToStrategy(allocation)).wait();

    await (await adapter.setLossBps(200)).wait();
    await assert.rejects(vault.recallFromStrategy(ethers.parseEther("100")));
    assert.equal(await vault.strategyDebt(), allocation);

    await (await adapter.setLossBps(50)).wait();
    await (await vault.recallFromStrategy(ethers.parseEther("100"), { gasLimit: 500_000 })).wait();
    assert.equal(await vault.strategyDebt(), ethers.parseEther("400"));
    assert.equal(await vault.totalAssets(), deposit - ethers.parseEther("0.5"));
  });

  it("fails closed on reported Strategy loss and reconciles it only under shutdown governance", async function () {
    const Adapter = new ethers.ContractFactory(artifact("MockLossyStrategyAdapter", "mocks/MockLossyStrategyAdapter").abi,
      artifact("MockLossyStrategyAdapter", "mocks/MockLossyStrategyAdapter").bytecode, owner);
    const adapter = await Adapter.deploy(await token.getAddress(), await vault.getAddress());
    await adapter.waitForDeployment();
    const deposit = ethers.parseEther("1000");
    const allocation = ethers.parseEther("500");
    const loss = ethers.parseEther("100");
    await (await vault.connect(user).deposit(deposit, await user.getAddress())).wait();
    await (await vault.setStrategy(await adapter.getAddress())).wait();
    await (await vault.setStrategyLimits(allocation, 100)).wait();
    await (await vault.resumeAllocations()).wait();
    await (await vault.allocateToStrategy(allocation)).wait();
    await (await adapter.simulateReportedLoss(loss)).wait();

    await assert.rejects(vault.connect(user).deposit(ethers.parseEther("1"), await user.getAddress()));
    await assert.rejects(vault.connect(user).withdraw(ethers.parseEther("1"), await user.getAddress(), await user.getAddress()));
    await assert.rejects(vault.allocateToStrategy(1));
    await assert.rejects(vault.reconcileStrategyLoss(2000));
    await (await vault.pauseDeposits()).wait();
    await (await vault.pauseAllocations()).wait();
    await assert.rejects(vault.connect(guardian).reconcileStrategyLoss(2000));
    await assert.rejects(vault.reconcileStrategyLoss(1999));
    await (await vault.reconcileStrategyLoss(2000, { gasLimit: 500_000 })).wait();

    assert.equal(await vault.strategyDebt(), allocation - loss);
    assert.equal(await vault.totalAssets(), deposit - loss);
    await (await vault.recallFromStrategy(allocation - loss, { gasLimit: 500_000 })).wait();
    assert.equal(await vault.strategyDebt(), 0n);
    assert.equal(await vault.idleAssets(), deposit - loss);
    assert.equal(await token.balanceOf(await adapter.getAddress()), 0n);
    await (await vault.resumeAllocations()).wait();
    await (await vault.resumeDeposits()).wait();
    await (await vault.connect(user).withdraw(ethers.parseEther("1"), await user.getAddress(), await user.getAddress(),
      { gasLimit: 500_000 })).wait();
  });

  it("requires full shutdown and governance for an emergency loss override", async function () {
    const Adapter = new ethers.ContractFactory(artifact("MockLossyStrategyAdapter", "mocks/MockLossyStrategyAdapter").abi,
      artifact("MockLossyStrategyAdapter", "mocks/MockLossyStrategyAdapter").bytecode, owner);
    const adapter = await Adapter.deploy(await token.getAddress(), await vault.getAddress());
    await adapter.waitForDeployment();
    const deposit = ethers.parseEther("1000");
    const allocation = ethers.parseEther("500");
    await (await vault.connect(user).deposit(deposit, await user.getAddress())).wait();
    await (await vault.setStrategy(await adapter.getAddress())).wait();
    await (await vault.setStrategyLimits(allocation, 100)).wait();
    await (await vault.resumeAllocations()).wait();
    await (await vault.allocateToStrategy(allocation)).wait();
    await (await adapter.setLossBps(3000)).wait();

    await assert.rejects(vault.emergencyRecallFromStrategy(allocation, 3000));
    await (await vault.pauseDeposits()).wait();
    await (await vault.pauseAllocations()).wait();
    await assert.rejects(vault.connect(guardian).emergencyRecallFromStrategy(allocation, 3000));
    await (await vault.emergencyRecallFromStrategy(allocation, 3000, { gasLimit: 500_000 })).wait();

    assert.equal(await vault.strategyDebt(), 0n);
    assert.equal(await vault.totalAssets(), ethers.parseEther("850"));
  });

  it("fails closed after a total strategy loss makes the vault insolvent", async function () {
    const Adapter = new ethers.ContractFactory(artifact("MockLossyStrategyAdapter", "mocks/MockLossyStrategyAdapter").abi,
      artifact("MockLossyStrategyAdapter", "mocks/MockLossyStrategyAdapter").bytecode, owner);
    const adapter = await Adapter.deploy(await token.getAddress(), await vault.getAddress());
    await adapter.waitForDeployment();
    const deposit = ethers.parseEther("1000");

    await (await vault.connect(user).deposit(deposit, await user.getAddress())).wait();
    await (await vault.setStrategy(await adapter.getAddress())).wait();
    await (await vault.setStrategyLimits(deposit, 0)).wait();
    await (await vault.resumeAllocations()).wait();
    await (await vault.allocateToStrategy(deposit)).wait();
    await (await adapter.setLossBps(10_000)).wait();
    await (await vault.pauseDeposits()).wait();
    await (await vault.pauseAllocations()).wait();
    await (await vault.emergencyRecallFromStrategy(deposit, 10_000)).wait();

    assert.equal(await vault.strategyDebt(), 0n);
    assert.equal(await vault.totalAssets(), 0n);
    assert.equal(await vault.isInsolvent(), true);
    await assert.rejects(vault.convertToShares(1));
    await assert.rejects(vault.resumeDeposits());
    await assert.rejects(vault.connect(user).deposit(ethers.parseEther("1"), await user.getAddress()));
    assert.equal(await vault.depositsPaused(), true);
  });

  it("never allocates unsolicited donations as accounted strategy exposure", async function () {
    const Adapter = new ethers.ContractFactory(artifact("LQCIdleStrategyAdapter", "vault/adapters/LQCIdleStrategyAdapter").abi,
      artifact("LQCIdleStrategyAdapter", "vault/adapters/LQCIdleStrategyAdapter").bytecode, owner);
    const adapter = await Adapter.deploy(await token.getAddress(), await vault.getAddress());
    await adapter.waitForDeployment();
    const deposit = ethers.parseEther("100");
    const donation = ethers.parseEther("900");
    await (await vault.connect(user).deposit(deposit, await user.getAddress())).wait();
    await (await token.mint(await other.getAddress(), donation)).wait();
    await (await token.connect(other).transfer(await vault.getAddress(), donation)).wait();
    await (await vault.setStrategy(await adapter.getAddress())).wait();
    await (await vault.setStrategyLimits(ethers.parseEther("1000"), 0)).wait();
    await (await vault.resumeAllocations()).wait();

    await assert.rejects(vault.allocateToStrategy(deposit + 1n));
    await (await vault.allocateToStrategy(deposit)).wait();
    assert.equal(await vault.strategyDebt(), deposit);
    assert.equal(await vault.idleAssets(), donation);
    assert.equal(await vault.accountedIdleAssets(), 0n);
  });

  it("rejects adapters for another vault or asset and unsafe loss configuration", async function () {
    const Adapter = new ethers.ContractFactory(artifact("LQCIdleStrategyAdapter", "vault/adapters/LQCIdleStrategyAdapter").abi,
      artifact("LQCIdleStrategyAdapter", "vault/adapters/LQCIdleStrategyAdapter").bytecode, owner);
    const wrongVaultAdapter = await Adapter.deploy(await token.getAddress(), await other.getAddress());
    const otherToken = await new ethers.ContractFactory(artifact("MockERC20", "mocks/MockERC20").abi,
      artifact("MockERC20", "mocks/MockERC20").bytecode, owner).deploy("Other", "OTHER");
    const wrongAssetAdapter = await Adapter.deploy(await otherToken.getAddress(), await vault.getAddress());
    await Promise.all([wrongVaultAdapter.waitForDeployment(), otherToken.waitForDeployment(), wrongAssetAdapter.waitForDeployment()]);

    await assert.rejects(vault.setStrategy(await wrongVaultAdapter.getAddress()));
    await assert.rejects(vault.setStrategy(await wrongAssetAdapter.getAddress()));
    await assert.rejects(vault.setStrategy(await other.getAddress()));
    await assert.rejects(vault.setStrategyLimits(1, 2001));
  });
});
