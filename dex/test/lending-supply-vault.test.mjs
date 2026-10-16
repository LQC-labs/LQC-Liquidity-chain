import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source) =>
  JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)));

describe("LQC Lending Stage-3 supply vault", function () {
  let provider, owner, guardian, alice, bob, collateral, debt, registry, vault, marketId;

  beforeEach(async function () {
    provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
    owner = await provider.getSigner(0);
    guardian = await provider.getSigner(1);
    alice = await provider.getSigner(2);
    bob = await provider.getSigner(3);

    const Token = new ethers.ContractFactory(
      artifact("MockERC20", "mocks/MockERC20").abi,
      artifact("MockERC20", "mocks/MockERC20").bytecode,
      owner
    );
    collateral = await Token.deploy("Collateral", "COL");
    debt = await Token.deploy("Debt", "DEBT");
    await Promise.all([collateral.waitForDeployment(), debt.waitForDeployment()]);

    const Registry = new ethers.ContractFactory(
      artifact("LQCLendingMarketRegistry", "lending/LQCLendingMarketRegistry").abi,
      artifact("LQCLendingMarketRegistry", "lending/LQCLendingMarketRegistry").bytecode,
      owner
    );
    registry = await Registry.deploy(
      await owner.getAddress(),
      await guardian.getAddress(),
      await owner.getAddress()
    );
    await registry.waitForDeployment();

    const collateralAddress = await collateral.getAddress();
    const debtAddress = await debt.getAddress();
    await (await registry.configureMarket({
      collateralAsset: collateralAddress,
      debtAsset: debtAddress,
      collateralDecimals: 18,
      debtDecimals: 18,
      maxLtvBps: 4500,
      liquidationThresholdBps: 6000,
      liquidationBonusBps: 500,
      supplyCap: 150n,
      borrowCap: 100n,
      minBorrow: 1n,
      enabled: true
    })).wait();
    marketId = await registry.marketId(collateralAddress, debtAddress);

    const Vault = new ethers.ContractFactory(
      artifact("LQCLendingSupplyVault", "lending/LQCLendingSupplyVault").abi,
      artifact("LQCLendingSupplyVault", "lending/LQCLendingSupplyVault").bytecode,
      owner
    );
    vault = await Vault.deploy(await registry.getAddress());
    await vault.waitForDeployment();

    for (const signer of [alice, bob]) {
      await (await collateral.mint(await signer.getAddress(), 200n)).wait();
      await (await collateral.connect(signer).approve(await vault.getAddress(), ethers.MaxUint256)).wait();
    }
  });

  it("custodies exact collateral and maintains account and market accounting", async function () {
    await (await vault.connect(alice).supply(marketId, 100n)).wait();
    await (await vault.connect(bob).supply(marketId, 50n)).wait();

    assert.equal(await vault.supplied(marketId, await alice.getAddress()), 100n);
    assert.equal(await vault.supplied(marketId, await bob.getAddress()), 50n);
    assert.equal(await vault.totalSupplied(marketId), 150n);
    assert.equal(await collateral.balanceOf(await vault.getAddress()), 150n);
  });

  it("enforces the registry supply cap without changing balances on failure", async function () {
    await (await vault.connect(alice).supply(marketId, 100n)).wait();
    await assert.rejects(vault.connect(bob).supply(marketId, 51n));

    assert.equal(await vault.totalSupplied(marketId), 100n);
    assert.equal(await collateral.balanceOf(await vault.getAddress()), 100n);
    assert.equal(await vault.supplied(marketId, await bob.getAddress()), 0n);
  });

  it("preserves withdrawals after the guardian disables new market activity", async function () {
    await (await vault.connect(alice).supply(marketId, 100n)).wait();
    await (await registry.connect(guardian).setMarketEnabled(marketId, false)).wait();

    await assert.rejects(vault.connect(bob).supply(marketId, 1n));
    await (await vault.connect(alice).withdraw(marketId, 40n, await bob.getAddress())).wait();

    assert.equal(await vault.supplied(marketId, await alice.getAddress()), 60n);
    assert.equal(await vault.totalSupplied(marketId), 60n);
    assert.equal(await collateral.balanceOf(await bob.getAddress()), 240n);
  });

  it("rejects zero operations, invalid recipients, and over-withdrawal", async function () {
    await assert.rejects(vault.connect(alice).supply(marketId, 0n));
    await (await vault.connect(alice).supply(marketId, 10n)).wait();
    await assert.rejects(vault.connect(alice).withdraw(marketId, 0n, await alice.getAddress()));
    await assert.rejects(vault.connect(alice).withdraw(marketId, 1n, ethers.ZeroAddress));
    await assert.rejects(vault.connect(alice).withdraw(marketId, 11n, await alice.getAddress()));
  });

  it("keeps custody equal to total supplied through deterministic supply/withdraw sequences", async function () {
    const steps = [
      [alice, "supply", 31n], [bob, "supply", 29n], [alice, "withdraw", 7n],
      [bob, "withdraw", 11n], [alice, "supply", 17n], [bob, "supply", 13n]
    ];
    for (const [signer, action, amount] of steps) {
      if (action === "supply") await (await vault.connect(signer).supply(marketId, amount)).wait();
      else await (await vault.connect(signer).withdraw(marketId, amount, await signer.getAddress())).wait();
      assert.equal(await collateral.balanceOf(await vault.getAddress()), await vault.totalSupplied(marketId));
    }
  });
});
