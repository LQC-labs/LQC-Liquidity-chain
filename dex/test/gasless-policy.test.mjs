import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = JSON.parse(fs.readFileSync(new URL("../artifacts/contracts/gasless/LQCGaslessPolicy.sol/LQCGaslessPolicy.json", import.meta.url)));

describe("LQC Gasless policy foundation", function () {
  let eip1193, provider, owner, guardian, outsider, policy, target, token, zeroBalanceUser;
  const minimum = ethers.parseUnits("10", 18);
  const perTxGas = ethers.parseEther("0.01");
  const dailyBudget = ethers.parseEther("0.10");

  beforeEach(async function () {
    eip1193 = ganache.provider({ logging: { quiet: true } });
    provider = new ethers.BrowserProvider(eip1193);
    owner = await provider.getSigner(0);
    guardian = await provider.getSigner(1);
    outsider = await provider.getSigner(2);
    target = await (await provider.getSigner(3)).getAddress();
    token = ethers.Wallet.createRandom().address;
    zeroBalanceUser = ethers.Wallet.createRandom().address;
    const chainId = (await provider.getNetwork()).chainId;
    const Factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner);
    policy = await Factory.deploy(await owner.getAddress(), await guardian.getAddress(), chainId, minimum, perTxGas, dailyBudget, 5);
    await policy.waitForDeployment();
    await (await policy.setExecutor(await owner.getAddress())).wait();
    await (await policy.setEligibility(target, true, true)).wait();
    await (await policy.setEligibility(token, false, true)).wait();
  });

  it("authorizes only approved targets and tokens above the minimum notional", async function () {
    await (await policy.authorizeSponsorship(zeroBalanceUser, target, token, minimum, perTxGas)).wait();
    await assert.rejects(policy.authorizeSponsorship(zeroBalanceUser, await outsider.getAddress(), token, minimum, perTxGas));
    await assert.rejects(policy.authorizeSponsorship(zeroBalanceUser, target, ethers.Wallet.createRandom().address, minimum, perTxGas));
    await assert.rejects(policy.authorizeSponsorship(zeroBalanceUser, target, token, minimum - 1n, perTxGas));
  });

  it("requires insufficient native gas and rejects unauthorized executors", async function () {
    await assert.rejects(policy.authorizeSponsorship(await outsider.getAddress(), target, token, minimum, perTxGas));
    await assert.rejects(policy.connect(outsider).authorizeSponsorship(zeroBalanceUser, target, token, minimum, perTxGas));
  });

  it("enforces the five-transaction wallet daily quota and resets by UTC day", async function () {
    for (let i = 0; i < 5; i++) await (await policy.authorizeSponsorship(zeroBalanceUser, target, token, minimum, 1n)).wait();
    await assert.rejects(policy.authorizeSponsorship(zeroBalanceUser, target, token, minimum, 1n));
    await eip1193.request({ method: "evm_increaseTime", params: [86401] });
    await eip1193.request({ method: "evm_mine", params: [] });
    await (await policy.authorizeSponsorship(zeroBalanceUser, target, token, minimum, 1n)).wait();
  });

  it("enforces per-transaction and protocol daily sponsorship budgets", async function () {
    await assert.rejects(policy.authorizeSponsorship(zeroBalanceUser, target, token, minimum, perTxGas + 1n));
    await (await policy.setLimits(minimum, perTxGas, perTxGas, 5)).wait();
    await (await policy.authorizeSponsorship(zeroBalanceUser, target, token, minimum, perTxGas)).wait();
    await assert.rejects(policy.authorizeSponsorship(ethers.Wallet.createRandom().address, target, token, minimum, 1n));
  });

  it("gives the guardian pause-only authority and governance-controlled recovery", async function () {
    await assert.rejects(policy.connect(outsider).pause());
    await (await policy.connect(guardian).pause()).wait();
    await assert.rejects(policy.authorizeSponsorship(zeroBalanceUser, target, token, minimum, 1n));
    await assert.rejects(policy.connect(guardian).resume());
    await (await policy.resume()).wait();
    await (await policy.authorizeSponsorship(zeroBalanceUser, target, token, minimum, 1n)).wait();
  });

  it("blocks use on an unexpected chain and prevents quotas above five", async function () {
    const chainId = (await provider.getNetwork()).chainId;
    const Factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner);
    const wrongChain = await Factory.deploy(await owner.getAddress(), await guardian.getAddress(), chainId + 1n, minimum, perTxGas, dailyBudget, 5);
    await wrongChain.waitForDeployment();
    await (await wrongChain.setExecutor(await owner.getAddress())).wait();
    await (await wrongChain.setEligibility(target, true, true)).wait();
    await (await wrongChain.setEligibility(token, false, true)).wait();
    await assert.rejects(wrongChain.authorizeSponsorship(zeroBalanceUser, target, token, minimum, 1n));
    await assert.rejects(policy.setLimits(minimum, perTxGas, dailyBudget, 6));
  });
});
