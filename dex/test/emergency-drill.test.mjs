import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source) => JSON.parse(fs.readFileSync(
  new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)
));

describe("LQC emergency pause and timelocked recovery drill", function () {
  it("blocks swaps and a DEX immediately, then permits recovery only after the timelock", async function () {
    const eip1193 = ganache.provider({ logging: { quiet: true } });
    const provider = new ethers.BrowserProvider(eip1193);
    const governance = await provider.getSigner(0);
    const guardian = await provider.getSigner(1);
    const executor = await provider.getSigner(2);
    const publicExecutor = await provider.getSigner(3);

    const Factory = (name, source, signer = governance) => new ethers.ContractFactory(
      artifact(name, source).abi, artifact(name, source).bytecode, signer
    );
    const registry = await Factory("LQCDexRegistry", "router-v2/LQCDexRegistry").deploy(await governance.getAddress());
    const risk = await Factory("LQCRiskRegistry", "router-v2/LQCRiskRegistry").deploy(
      await governance.getAddress(), await governance.getAddress()
    );
    const timelock = await Factory("LQCTimelockController", "router-v2/LQCTimelockController").deploy(
      await governance.getAddress(), 3600
    );
    await Promise.all([registry.waitForDeployment(), risk.waitForDeployment(), timelock.waitForDeployment()]);
    const emergency = await Factory("LQCEmergencyController", "router-v2/LQCEmergencyController").deploy(
      await governance.getAddress(), await registry.getAddress(), await risk.getAddress()
    );
    const adapter = await Factory("LQCFlowAdapter", "router-v2/adapters/LQCFlowAdapter").deploy(await registry.getAddress());
    await Promise.all([emergency.waitForDeployment(), adapter.waitForDeployment()]);

    const dexId = ethers.id("LQC_FLOW");
    const tokenIn = await guardian.getAddress();
    const tokenOut = await publicExecutor.getAddress();
    await (await registry.addDex(dexId, await adapter.getAddress(), "LQC Flow", 100)).wait();
    await (await registry.setPauseAdmin(await emergency.getAddress())).wait();
    await (await risk.setPauseAdmin(await emergency.getAddress())).wait();
    await (await emergency.setGuardian(await guardian.getAddress(), true)).wait();
    await (await risk.setExecutor(await executor.getAddress())).wait();
    await (await risk.setTokenLimits(tokenIn, true, 100n, 1000n)).wait();
    await (await risk.setTokenLimits(tokenOut, true, 100n, 1000n)).wait();
    await (await risk.setDexTokenCap(dexId, tokenIn, 100n)).wait();

    await (await registry.beginOwnershipTransfer(await timelock.getAddress())).wait();
    await (await timelock.acceptRegistryOwnership(await registry.getAddress())).wait();
    await (await risk.beginOwnershipTransfer(await timelock.getAddress())).wait();
    await (await timelock.acceptRegistryOwnership(await risk.getAddress())).wait();

    await (await risk.connect(executor).consumeSwap(tokenIn, tokenOut, [dexId], [10n])).wait();
    const initialUsage = await risk.dailyUsage(tokenIn);
    await (await emergency.connect(guardian).pauseDex(dexId)).wait();
    await (await emergency.connect(guardian).pauseAllSwaps()).wait();
    assert.equal((await registry.getDex(dexId)).enabled, false);
    assert.equal(await risk.swapsPaused(), true);
    const blockedSwap = await risk.connect(executor).consumeSwap(tokenIn, tokenOut, [dexId], [10n], { gasLimit: 500000n });
    await assert.rejects(blockedSwap.wait());
    const unauthorizedResume = await risk.connect(guardian).resumeSwaps({ gasLimit: 500000n });
    await assert.rejects(unauthorizedResume.wait());
    const unauthorizedEnable = await registry.connect(guardian).setDexEnabled(dexId, true, { gasLimit: 500000n });
    await assert.rejects(unauthorizedEnable.wait());

    const resumeData = risk.interface.encodeFunctionData("resumeSwaps");
    const enableData = registry.interface.encodeFunctionData("setDexEnabled", [dexId, true]);
    const resumeSalt = ethers.id("emergency-drill-resume-swaps-v1");
    const enableSalt = ethers.id("emergency-drill-enable-dex-v1");
    await (await timelock.schedule(await risk.getAddress(), 0, resumeData, resumeSalt)).wait();
    await (await timelock.schedule(await registry.getAddress(), 0, enableData, enableSalt)).wait();
    const earlyResume = await timelock.connect(publicExecutor).execute(
      await risk.getAddress(), 0, resumeData, resumeSalt, { gasLimit: 500000n }
    );
    await assert.rejects(earlyResume.wait());
    const earlyEnable = await timelock.connect(publicExecutor).execute(
      await registry.getAddress(), 0, enableData, enableSalt, { gasLimit: 500000n }
    );
    await assert.rejects(earlyEnable.wait());

    await eip1193.request({ method: "evm_increaseTime", params: [3601] });
    await eip1193.request({ method: "evm_mine", params: [] });
    await (await timelock.connect(publicExecutor).execute(await risk.getAddress(), 0, resumeData, resumeSalt)).wait();
    await (await timelock.connect(publicExecutor).execute(await registry.getAddress(), 0, enableData, enableSalt)).wait();

    assert.equal(await risk.swapsPaused(), false);
    assert.equal((await registry.getDex(dexId)).enabled, true);
    await (await risk.connect(executor).consumeSwap(tokenIn, tokenOut, [dexId], [10n])).wait();
    const finalBlock = await provider.getBlock("latest");
    const finalDay = BigInt(Math.floor(finalBlock.timestamp / 86400));
    const expectedUsage = initialUsage.day === finalDay ? 20n : 10n;
    assert.equal((await risk.dailyUsage(tokenIn)).amount, expectedUsage);
  });
});
