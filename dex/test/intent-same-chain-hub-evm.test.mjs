import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";
import solc from "solc";

const artifact = (name, source) =>
  JSON.parse(
    fs.readFileSync(
      new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)
    )
  );

function compileIntentArtifact() {
  const intentSource = fs.readFileSync(
    new URL("../intent-contracts/LQCSameChainIntentHub.sol", import.meta.url),
    "utf8"
  );
  const safeTransferSource = fs.readFileSync(
    new URL("../contracts/libraries/SafeTransferLib.sol", import.meta.url),
    "utf8"
  );
  const input = {
    language: "Solidity",
    sources: {
      "intent-contracts/LQCSameChainIntentHub.sol": { content: intentSource },
      "contracts/libraries/SafeTransferLib.sol": { content: safeTransferSource }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "shanghai",
      outputSelection: {
        "intent-contracts/LQCSameChainIntentHub.sol": {
          LQCSameChainIntentHub: ["abi", "evm.bytecode.object"]
        }
      }
    }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
  if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));
  const compiled = output.contracts["intent-contracts/LQCSameChainIntentHub.sol"].LQCSameChainIntentHub;
  return { abi: compiled.abi, bytecode: `0x${compiled.evm.bytecode.object}` };
}

const intentArtifact = compileIntentArtifact();

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
  let proof;
  let hub;
  let dexId;
  let routeData;

  beforeEach(async () => {
    provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
    owner = await provider.getSigner(0);
    outsider = await provider.getSigner(1);

    const deploy = (name, source, ...args) => {
      const selected = source === "__intent" ? intentArtifact : artifact(name, source);
      return new ethers.ContractFactory(selected.abi, selected.bytecode, owner).deploy(...args);
    };

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
    proof = await deploy("LQCBestExecutionProof", "router-v2/LQCBestExecutionProof");
    await Promise.all([router.waitForDeployment(), adapter.waitForDeployment(), proof.waitForDeployment()]);

    hub = await deploy(
      "LQCSameChainIntentHub",
      "__intent",
      await router.getAddress(),
      await proof.getAddress(),
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
    const deadline = BigInt(block.timestamp + 300);
    const minimumAmountOut = (quote * 99n) / 100n;
    const intentId = await hub.lockIntent.staticCall(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      amount,
      minimumAmountOut,
      await owner.getAddress(),
      deadline
    );
    await (
      await hub.lockIntent(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amount,
        minimumAmountOut,
        await owner.getAddress(),
        deadline
      )
    ).wait();

    const request = {
      chainId: (await provider.getNetwork()).chainId,
      tokenIn: await tokenA.getAddress(),
      tokenOut: await tokenB.getAddress(),
      amountIn: amount,
      recipient: await owner.getAddress(),
      slippageBps: 100,
      validUntil: deadline
    };
    const quoteBlock = await provider.getBlockNumber();
    const routeHash = await proof.computeRouteHash(
      request,
      quoteBlock,
      dexId,
      await adapter.getAddress(),
      routeData,
      quote,
      0,
      0
    );
    const candidates = [{
      dexId,
      adapter: await adapter.getAddress(),
      quoteBlock,
      grossAmountOut: quote,
      gasCostInTokenOut: 0,
      protocolFeeInTokenOut: 0,
      netAmountOut: quote,
      minimumAmountOut,
      priority: 100,
      routeHash
    }];
    return { intentId, amount, request, candidates };
  }

  it("locks funds and atomically executes through Router 2.0", async () => {
    const { intentId, amount, request, candidates } = await lock();
    assert.equal(await tokenA.balanceOf(await hub.getAddress()), amount);

    const before = await tokenB.balanceOf(await owner.getAddress());
    await (await hub.executeProvenIntent(intentId, request, candidates, [routeData], 0)).wait();
    assert((await tokenB.balanceOf(await owner.getAddress())) > before);
    assert.equal(await tokenA.balanceOf(await hub.getAddress()), 0n);
    assert.equal((await hub.intents(intentId)).status, 2n);

    await assert.rejects(async () => {
      const replay = await hub.executeProvenIntent(intentId, request, candidates, [routeData], 0);
      await replay.wait();
    });
  });

  it("rejects an unauthorized solver and preserves escrow", async () => {
    const { intentId, amount, request, candidates } = await lock();
    await assert.rejects(async () => {
      const tx = await hub.connect(outsider).executeProvenIntent(intentId, request, candidates, [routeData], 0);
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

  it("allows anyone to trigger a safe refund after expiry", async () => {
    const { intentId, amount } = await lock();
    const intent = await hub.intents(intentId);
    await provider.send("evm_setTime", [Number(intent.deadline) * 1000 + 1000]);
    await provider.send("evm_mine", []);

    const before = await tokenA.balanceOf(await owner.getAddress());
    await (await hub.connect(outsider).refundExpiredIntent(intentId)).wait();
    assert.equal(await tokenA.balanceOf(await owner.getAddress()), before + amount);
    assert.equal(await tokenA.balanceOf(await hub.getAddress()), 0n);
    assert.equal((await hub.intents(intentId)).status, 3n);
  });

  it("rolls back status, funds, and approvals when Router execution fails", async () => {
    const { intentId, amount, request, candidates } = await lock();
    await (await registry.setDexEnabled(dexId, false)).wait();

    await assert.rejects(async () => {
      const tx = await hub.executeProvenIntent(intentId, request, candidates, [routeData], 0);
      await tx.wait();
    });

    assert.equal((await hub.intents(intentId)).status, 1n);
    assert.equal(await tokenA.balanceOf(await hub.getAddress()), amount);
    assert.equal(await tokenA.allowance(await hub.getAddress(), await router.getAddress()), 0n);
  });

  it("rejects route tampering before Router approval or execution", async () => {
    const { intentId, amount, request, candidates } = await lock();
    const forgedRoute = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]"],
      [[await tokenB.getAddress(), await tokenA.getAddress()]]
    );

    await assert.rejects(async () => {
      const tx = await hub.executeProvenIntent(intentId, request, candidates, [forgedRoute], 0);
      await tx.wait();
    });

    assert.equal((await hub.intents(intentId)).status, 1n);
    assert.equal(await tokenA.balanceOf(await hub.getAddress()), amount);
    assert.equal(await tokenA.allowance(await hub.getAddress(), await router.getAddress()), 0n);
  });

  async function signedIntentFixture(nonce = 77n) {
    const amount = ethers.parseEther("10");
    await (await tokenA.mint(await owner.getAddress(), amount)).wait();
    await (await tokenA.approve(await hub.getAddress(), amount)).wait();
    const quote = await adapter.quoteExactInput(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      amount,
      routeData
    );
    const block = await provider.getBlock("latest");
    const signedIntent = {
      owner: await owner.getAddress(),
      recipient: await owner.getAddress(),
      tokenIn: await tokenA.getAddress(),
      tokenOut: await tokenB.getAddress(),
      amountIn: amount,
      minimumAmountOut: (quote * 99n) / 100n,
      deadline: BigInt(block.timestamp + 300),
      nonce
    };
    const domain = {
      name: "LQC Same Chain Intent Hub",
      version: "1",
      chainId: (await provider.getNetwork()).chainId,
      verifyingContract: await hub.getAddress()
    };
    const types = {
      SignedIntent: [
        { name: "owner", type: "address" },
        { name: "recipient", type: "address" },
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "amountIn", type: "uint256" },
        { name: "minimumAmountOut", type: "uint256" },
        { name: "deadline", type: "uint64" },
        { name: "nonce", type: "uint256" }
      ]
    };
    const signature = await owner.signTypedData(domain, types, signedIntent);
    return { amount, signedIntent, signature };
  }

  it("locks an EIP-712 intent through an untrusted relayer and blocks nonce replay", async () => {
    const { amount, signedIntent, signature } = await signedIntentFixture();
    const intentId = await hub.connect(outsider).lockIntentBySig.staticCall(signedIntent, signature);
    await (await hub.connect(outsider).lockIntentBySig(signedIntent, signature)).wait();

    const stored = await hub.intents(intentId);
    assert.equal(stored.owner, signedIntent.owner);
    assert.equal(stored.recipient, signedIntent.recipient);
    assert.equal(stored.amountIn, amount);
    assert.equal(await tokenA.balanceOf(await hub.getAddress()), amount);
    assert.equal(await hub.signedNonceUsed(signedIntent.owner, signedIntent.nonce), true);

    await assert.rejects(async () => {
      const replay = await hub.connect(outsider).lockIntentBySig(signedIntent, signature);
      await replay.wait();
    });
  });

  it("rejects any relayer mutation of EIP-712 signed terms", async () => {
    const { signedIntent, signature } = await signedIntentFixture(78n);
    const tampered = { ...signedIntent, recipient: await outsider.getAddress() };

    await assert.rejects(async () => {
      const tx = await hub.connect(outsider).lockIntentBySig(tampered, signature);
      await tx.wait();
    });

    assert.equal(await hub.signedNonceUsed(signedIntent.owner, signedIntent.nonce), false);
    assert.equal(await tokenA.balanceOf(await hub.getAddress()), 0n);
  });
});
