import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source = name) => JSON.parse(
  fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url))
);

describe("LQC Router governance timelock", function () {
  let eip1193, provider, multisig, guardian, outsider, timelock, router, wbnb, adapter;

  beforeEach(async function () {
    eip1193 = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 4 } });
    provider = new ethers.BrowserProvider(eip1193);
    multisig = await provider.getSigner(0);
    guardian = await provider.getSigner(1);
    outsider = await provider.getSigner(2);

    const Timelock = new ethers.ContractFactory(
      artifact("LQCRouterTimelock").abi, artifact("LQCRouterTimelock").bytecode, multisig
    );
    timelock = await Timelock.deploy(await multisig.getAddress(), 3600);
    const WBNB = new ethers.ContractFactory(
      artifact("MockWBNB", "mocks/MockWBNB").abi,
      artifact("MockWBNB", "mocks/MockWBNB").bytecode,
      multisig
    );
    wbnb = await WBNB.deploy();
    await Promise.all([timelock.waitForDeployment(), wbnb.waitForDeployment()]);

    const Router = new ethers.ContractFactory(
      artifact("LQCFlowRouterV2").abi, artifact("LQCFlowRouterV2").bytecode, multisig
    );
    router = await Router.deploy(
      await timelock.getAddress(), await guardian.getAddress(), await wbnb.getAddress()
    );
    const Adapter = new ethers.ContractFactory(
      artifact("MockDEXAdapter", "mocks/MockDEXAdapter").abi,
      artifact("MockDEXAdapter", "mocks/MockDEXAdapter").bytecode,
      multisig
    );
    adapter = await Adapter.deploy(100, 100, 100);
    await Promise.all([router.waitForDeployment(), adapter.waitForDeployment()]);
  });

  const salt = (label) => ethers.id(label);
  const advanceDelay = async () => {
    await eip1193.request({ method: "evm_increaseTime", params: [3601] });
    await eip1193.request({ method: "evm_mine", params: [] });
  };

  it("delays privileged router changes and prevents replay", async function () {
    const target = await router.getAddress();
    const data = router.interface.encodeFunctionData("setAdapter", [await adapter.getAddress(), true]);
    const operationSalt = salt("enable-adapter-a");

    await assert.rejects(timelock.connect(outsider).schedule(target, 0, data, operationSalt));
    await (await timelock.schedule(target, 0, data, operationSalt)).wait();
    await assert.rejects(timelock.execute(target, 0, data, operationSalt));
    assert.equal(await router.isAdapterEnabled(await adapter.getAddress()), false);

    await advanceDelay();
    await (await timelock.execute(target, 0, data, operationSalt, { gasLimit: 500_000 })).wait();
    assert.equal(await router.isAdapterEnabled(await adapter.getAddress()), true);
    await assert.rejects(timelock.execute(target, 0, data, operationSalt));
  });

  it("allows guardian pause but reserves resume for delayed governance", async function () {
    await (await router.connect(guardian).setSwapsPaused(true)).wait();
    assert.equal(await router.swapsPaused(), true);
    await assert.rejects(router.connect(guardian).setSwapsPaused(false));
    await assert.rejects(router.connect(outsider).setSwapsPaused(true));

    const target = await router.getAddress();
    const data = router.interface.encodeFunctionData("setSwapsPaused", [false]);
    const operationSalt = salt("resume-swaps");
    await (await timelock.schedule(target, 0, data, operationSalt)).wait();
    await advanceDelay();
    await (await timelock.execute(target, 0, data, operationSalt)).wait();
    assert.equal(await router.swapsPaused(), false);
  });

  it("cancels queued operations and transfers timelock administration in two steps", async function () {
    const target = await router.getAddress();
    const data = router.interface.encodeFunctionData("setPauseGuardian", [await outsider.getAddress()]);
    const operationSalt = salt("replace-guardian");
    const id = await timelock.hashOperation(target, 0, data, operationSalt);
    await (await timelock.schedule(target, 0, data, operationSalt)).wait();
    await (await timelock.cancel(id)).wait();
    await advanceDelay();
    await assert.rejects(timelock.execute(target, 0, data, operationSalt));

    await (await timelock.transferAdmin(await guardian.getAddress())).wait();
    await assert.rejects(timelock.connect(outsider).acceptAdmin());
    await (await timelock.connect(guardian).acceptAdmin()).wait();
    assert.equal(await timelock.admin(), await guardian.getAddress());
    await assert.rejects(timelock.schedule(target, 0, data, salt("old-admin")));
  });

  it("rejects unsafe delay bounds", async function () {
    const Timelock = new ethers.ContractFactory(
      artifact("LQCRouterTimelock").abi, artifact("LQCRouterTimelock").bytecode, multisig
    );
    await assert.rejects(Timelock.deploy(await multisig.getAddress(), 3599));
    await assert.rejects(Timelock.deploy(await multisig.getAddress(), 30 * 24 * 3600 + 1));
  });
});
