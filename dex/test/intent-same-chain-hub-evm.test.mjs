import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source) =>
  JSON.parse(
    fs.readFileSync(
      new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)
    )
  );

describe("LQC Gate 2 same-chain intent hub", function () {
  this.timeout(30000);

  let provider;
  let owner;
  let outsider;
  let tokenA;
  let tokenB;
  let flow;
  let registry;
  let router;
  let adapter;
  let hub;
  let dexId;
  let routeData;

  beforeEach(async () => {
    provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
    owner = await provider.getSigner(0);
    outsider = await provider.getSigner(1);

    const deploy = (name, source, ...args) =>
      new ethers.ContractFactory(artifact(name, source).abi, artifact(name, source).bytecode, owner).deploy(...args);

    tokenA = await deploy("MockERC20", "mocks/MockERC20", "A", "A");
    tokenB = await deploy("MockERC20", "mocks/MockERC20", "B", "B");
    const wbnb = await deploy("MockWBNB", "mocks/MockWBNB");
    const factory = await deploy("LQCFlowFactory", "LQCFlowFactory", await owner.getAddress());
    await Promise.all([
      tokenA.waitForDeployment(),
      tokenB.waitForDeployment(),
      wbnb.waitForDeployment(),
      factory.waitForDeployment()
    ]);

    flow = await deploy("LQCFlowRouter", "LQCFlowRouter", await factory.getAddress(), await wbnb.getAddress());
    registry = await deploy("LQCDexRegistry", "router-v2/LQCDexRegistry", await owner.getAddress());
    await Promise.all([flow.waitForDeployment(), registry.waitForDeployment()]);

    router = await deploy(
      "LQCExecutionRouter",
      "router-v2/LQCExecutionRouter",
      await registry.getAddress(),
      ethers.ZeroAddress
    );
    adapter = await deploy("LQCFlowAdapter", "router-v2/adapters/LQCFlowAdapter", await flow.getAddress());
    await Promise.all([router.waitForDeployment(), adapter.waitForDeployment()]);

    hub = await deploy(
      "LQCSameChainIntentHub",
      "intent/LQCSameChainIntentHub",
      await router.getAddress(),
      await owner.getAddress()
    );
    await hub.waitForDeployment();
    await (await hub.setSolver(await owner.getAddress(), true)).wait();

    const liquidity = ethers.parseEther("10000");
    await (await tokenA.mint(await owner.getAddress(), liquidity)).wait();
    await (await tokenB.mint(await owner.getAddress(), liquidity)).wait();
    await (await tokenA.approve(await flow.getAddress(), liquidity)).wait();
    await (await tokenB.approve(await flow.getAddress(), liquidity)).wait();
    const block = await provider.getBlock("latest");
    await (
      await flow.addLiquidity(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        liquidity,
        liquidity,
        0,
        0,
        await owner.getAddress(),
        block.timestamp + 3600
      )
    ).wait();

    dexId = ethers.id("FLOW");
    await (await registry.addDex(dexId, await adapter.getAddress(), "Flow", 100)).wait();
    routeData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]"],
      [[await tokenA.getAddress(), await tokenB.getAddress()]]
    );
  });

  async function lock(amount = ethers.parseEther("10")) {
    await (await tokenA.mint(await owner.getAddress(), amount)).wait();
    await (await tokenA.approve(await hub.getAddress(), amount)).wait();
    const quote = await adapter.quoteExactInput(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      amount,
      routeData
    );
    const block = await provider.getBlock("latest");
    const intentId = await hub.lockIntent.staticCall(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      amount,
      (quote * 99n) / 100n,
      await owner.getAddress(),
      block.timestamp + 300
    );
    await (
      await hub.lockIntent(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amount,
        (quote * 99n) / 100n,
        await owner.getAddress(),
        block.timestamp + 300
      )
    ).wait();
    return { intentId, amount };
  }

  it("locks funds and atomically executes through Router 2.0", async () => {
    const { intentId, amount } = await lock();
    assert.equal(await tokenA.balanceOf(await hub.getAddress()), amount);

    const before = await tokenB.balanceOf(await owner.getAddress());
    await (await hub.executeIntent(intentId, dexId, routeData)).wait();
    assert((await tokenB.balanceOf(await owner.getAddress())) > before);
    assert.equal(await tokenA.balanceOf(await hub.getAddress()), 0n);
    assert.equal((await hub.intents(intentId)).status, 2n);

    await assert.rejects(async () => {
      const replay = await hub.executeIntent(intentId, dexId, routeData);
      await replay.wait();
    });
  });

  it("rejects an unauthorized solver and preserves escrow", async () => {
    const { intentId, amount } = await lock();
    await assert.rejects(async () => {
      const tx = await hub.connect(outsider).executeIntent(intentId, dexId, routeData);
      await tx.wait();
    });
    assert.equal(await tokenA.balanceOf(await hub.getAddress()), amount);
    assert.equal((await hub.intents(intentId)).status, 1n);
  });

  it("allows the owner to cancel and refund a locked intent", async () => {
    const { intentId, amount } = await lock();
    const before = await tokenA.balanceOf(await owner.getAddress());
    await (await hub.cancelIntent(intentId)).wait();
    assert.equal(await tokenA.balanceOf(await owner.getAddress()), before + amount);
    assert.equal(await tokenA.balanceOf(await hub.getAddress()), 0n);
    assert.equal((await hub.intents(intentId)).status, 3n);
  });
});
