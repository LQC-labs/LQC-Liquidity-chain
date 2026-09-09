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
    await assert.rejects(vault.setDepositCap(1));
  });
});
