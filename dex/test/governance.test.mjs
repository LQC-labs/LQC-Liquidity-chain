import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source) => JSON.parse(fs.readFileSync(
  new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)
));

describe("LQC Router governance controls", function () {
  let eip1193, provider, proposer, guardian, outsider, registry, risk, timelock, emergency;

  beforeEach(async function () {
    eip1193 = ganache.provider({ logging: { quiet: true } });
    provider = new ethers.BrowserProvider(eip1193);
    proposer = await provider.getSigner(0);
    guardian = await provider.getSigner(1);
    outsider = await provider.getSigner(2);
    const Registry = new ethers.ContractFactory(
      artifact("LQCDexRegistry", "router-v2/LQCDexRegistry").abi,
      artifact("LQCDexRegistry", "router-v2/LQCDexRegistry").bytecode,
      proposer
    );
    registry = await Registry.deploy(await proposer.getAddress());
    const Risk = new ethers.ContractFactory(
      artifact("LQCRiskRegistry", "router-v2/LQCRiskRegistry").abi,
      artifact("LQCRiskRegistry", "router-v2/LQCRiskRegistry").bytecode,
      proposer
    );
    risk = await Risk.deploy(await proposer.getAddress(), await proposer.getAddress());
    const Timelock = new ethers.ContractFactory(
      artifact("LQCTimelockController", "router-v2/LQCTimelockController").abi,
      artifact("LQCTimelockController", "router-v2/LQCTimelockController").bytecode,
      proposer
    );
    timelock = await Timelock.deploy(await proposer.getAddress(), 3600);
    const Emergency = new ethers.ContractFactory(
      artifact("LQCEmergencyController", "router-v2/LQCEmergencyController").abi,
      artifact("LQCEmergencyController", "router-v2/LQCEmergencyController").bytecode,
      proposer
    );
    emergency = await Emergency.deploy(await proposer.getAddress(), await registry.getAddress(), await risk.getAddress());
    await Promise.all([registry.waitForDeployment(), risk.waitForDeployment(), timelock.waitForDeployment(), emergency.waitForDeployment()]);
  });

  it("lets guardians pause all swaps but never resume them", async function () {
    await (await risk.setPauseAdmin(await emergency.getAddress())).wait();
    await (await emergency.setGuardian(await guardian.getAddress(), true)).wait();
    await assert.rejects(emergency.connect(outsider).pauseAllSwaps());
    await (await emergency.connect(guardian).pauseAllSwaps()).wait();
    assert.equal(await risk.swapsPaused(), true);
    await assert.rejects(risk.connect(guardian).resumeSwaps());
    await (await risk.resumeSwaps()).wait();
    assert.equal(await risk.swapsPaused(), false);
  });

  it("lets guardians pause immediately but only governance re-enable", async function () {
    const dexId = ethers.id("LQC_FLOW");
    await (await registry.addDex(dexId, await outsider.getAddress(), "LQC Flow", 100)).wait();
    await (await registry.setPauseAdmin(await emergency.getAddress())).wait();
    await (await emergency.setGuardian(await guardian.getAddress(), true)).wait();
    await assert.rejects(emergency.connect(outsider).pauseDex(dexId));
    await (await emergency.connect(guardian).pauseDex(dexId)).wait();
    assert.equal((await registry.getDex(dexId)).enabled, false);
    await assert.rejects(registry.connect(guardian).setDexEnabled(dexId, true));
    await (await registry.setDexEnabled(dexId, true)).wait();
    assert.equal((await registry.getDex(dexId)).enabled, true);
  });

  it("delays structural registry changes and prevents replay", async function () {
    const dexId = ethers.id("NEW_DEX");
    await (await registry.beginOwnershipTransfer(await timelock.getAddress())).wait();
    await (await timelock.acceptRegistryOwnership(await registry.getAddress())).wait();
    const data = registry.interface.encodeFunctionData("addDex", [
      dexId, await outsider.getAddress(), "New reviewed DEX", 50
    ]);
    const salt = ethers.id("add-new-dex-v1");
    const id = await timelock.operationId(await registry.getAddress(), 0, data, salt);
    await assert.rejects(timelock.connect(outsider).schedule(await registry.getAddress(), 0, data, salt));
    await (await timelock.schedule(await registry.getAddress(), 0, data, salt)).wait();
    await assert.rejects(timelock.execute(await registry.getAddress(), 0, data, salt));
    await eip1193.request({ method: "evm_increaseTime", params: [3601] });
    await eip1193.request({ method: "evm_mine", params: [] });
    await (await timelock.connect(outsider).execute(await registry.getAddress(), 0, data, salt)).wait();
    assert.equal((await registry.getDex(dexId)).enabled, true);
    assert.equal(await timelock.readyAt(id), 0n);
    await assert.rejects(timelock.execute(await registry.getAddress(), 0, data, salt));
  });

  it("allows the proposer to cancel a queued operation", async function () {
    const data = registry.interface.encodeFunctionData("setPauseAdmin", [await outsider.getAddress()]);
    const salt = ethers.id("cancelled-change");
    const id = await timelock.operationId(await registry.getAddress(), 0, data, salt);
    await (await timelock.schedule(await registry.getAddress(), 0, data, salt)).wait();
    await assert.rejects(timelock.connect(outsider).cancel(id));
    await (await timelock.cancel(id)).wait();
    assert.equal(await timelock.readyAt(id), 0n);
  });
});
