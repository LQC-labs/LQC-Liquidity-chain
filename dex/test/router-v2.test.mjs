import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source = name) => JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)));

describe("LQC Router 2.0", function () {
  let provider, owner, other, tokenA, tokenB, flowRouter, registry, quoteRouter, executionRouter, adapter;

  beforeEach(async function () {
    provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
    owner = await provider.getSigner(0);
    other = await provider.getSigner(1);
    const Token = new ethers.ContractFactory(artifact("MockERC20", "mocks/MockERC20").abi, artifact("MockERC20", "mocks/MockERC20").bytecode, owner);
    tokenA = await Token.deploy("Token A", "TKA");
    tokenB = await Token.deploy("Token B", "TKB");
    const WBNB = new ethers.ContractFactory(artifact("MockWBNB", "mocks/MockWBNB").abi, artifact("MockWBNB", "mocks/MockWBNB").bytecode, owner);
    const wbnb = await WBNB.deploy();
    const Factory = new ethers.ContractFactory(artifact("LQCFlowFactory").abi, artifact("LQCFlowFactory").bytecode, owner);
    const factory = await Factory.deploy(await owner.getAddress());
    await Promise.all([tokenA.waitForDeployment(), tokenB.waitForDeployment(), wbnb.waitForDeployment(), factory.waitForDeployment()]);
    const FlowRouter = new ethers.ContractFactory(artifact("LQCFlowRouter").abi, artifact("LQCFlowRouter").bytecode, owner);
    flowRouter = await FlowRouter.deploy(await factory.getAddress(), await wbnb.getAddress());
    const Registry = new ethers.ContractFactory(artifact("LQCDexRegistry", "router-v2/LQCDexRegistry").abi, artifact("LQCDexRegistry", "router-v2/LQCDexRegistry").bytecode, owner);
    registry = await Registry.deploy(await owner.getAddress());
    await Promise.all([flowRouter.waitForDeployment(), registry.waitForDeployment()]);
    const QuoteRouter = new ethers.ContractFactory(artifact("LQCQuoteRouter", "router-v2/LQCQuoteRouter").abi, artifact("LQCQuoteRouter", "router-v2/LQCQuoteRouter").bytecode, owner);
    quoteRouter = await QuoteRouter.deploy(await registry.getAddress());
    const ExecutionRouter = new ethers.ContractFactory(artifact("LQCExecutionRouter", "router-v2/LQCExecutionRouter").abi, artifact("LQCExecutionRouter", "router-v2/LQCExecutionRouter").bytecode, owner);
    executionRouter = await ExecutionRouter.deploy(await registry.getAddress());
    const Adapter = new ethers.ContractFactory(artifact("LQCFlowAdapter", "router-v2/adapters/LQCFlowAdapter").abi, artifact("LQCFlowAdapter", "router-v2/adapters/LQCFlowAdapter").bytecode, owner);
    adapter = await Adapter.deploy(await flowRouter.getAddress());
    await Promise.all([quoteRouter.waitForDeployment(), executionRouter.waitForDeployment(), adapter.waitForDeployment()]);
    const amount = ethers.parseEther("10000");
    await (await tokenA.mint(await owner.getAddress(), amount)).wait();
    await (await tokenB.mint(await owner.getAddress(), amount)).wait();
    await (await tokenA.approve(await flowRouter.getAddress(), amount)).wait();
    await (await tokenB.approve(await flowRouter.getAddress(), amount)).wait();
    const block = await provider.getBlock("latest");
    await (await flowRouter.addLiquidity(await tokenA.getAddress(), await tokenB.getAddress(), amount, amount, 0, 0, await owner.getAddress(), BigInt(block.timestamp + 3600))).wait();
  });

  it("registers LQC Flow and returns its live pool quote", async function () {
    const dexId = ethers.id("LQC_FLOW");
    await (await registry.addDex(dexId, await adapter.getAddress(), "LQC Flow", 100)).wait();
    const path = [await tokenA.getAddress(), await tokenB.getAddress()];
    const amountIn = ethers.parseEther("10");
    const expected = await flowRouter.getAmountsOut(amountIn, path);
    const data = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [path]);
    const best = await quoteRouter.quoteBest(path[0], path[1], amountIn, [data]);
    assert.equal(best.dexId, dexId);
    assert.equal(best.adapter, await adapter.getAddress());
    assert.equal(best.amountOut, expected[1]);
  });

  it("isolates a failing route while another registered DEX can quote", async function () {
    const badId = ethers.id("BAD_ROUTE");
    const flowId = ethers.id("LQC_FLOW");
    await (await registry.addDex(badId, await adapter.getAddress(), "Bad route", 200)).wait();
    await (await registry.addDex(flowId, await adapter.getAddress(), "LQC Flow", 100)).wait();
    const path = [await tokenA.getAddress(), await tokenB.getAddress()];
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const best = await quoteRouter.quoteBest(path[0], path[1], ethers.parseEther("10"), [coder.encode(["address[]"], [[path[1], path[0]]]), coder.encode(["address[]"], [path])]);
    assert.equal(best.dexId, flowId);
  });

  it("restricts registry changes and supports emergency disabling", async function () {
    const dexId = ethers.id("LQC_FLOW");
    await assert.rejects(registry.connect(other).addDex(dexId, await adapter.getAddress(), "LQC Flow", 100));
    await (await registry.addDex(dexId, await adapter.getAddress(), "LQC Flow", 100)).wait();
    await (await registry.setDexEnabled(dexId, false)).wait();
    const path = [await tokenA.getAddress(), await tokenB.getAddress()];
    const data = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [path]);
    await assert.rejects(quoteRouter.quoteBest(path[0], path[1], 1n, [data]));
  });

  it("compares LQC Flow with a PancakeSwap V2-compatible pool and selects the better quote", async function () {
    const Factory = new ethers.ContractFactory(artifact("LQCFlowFactory").abi, artifact("LQCFlowFactory").bytecode, owner);
    const pancakeFactory = await Factory.deploy(await owner.getAddress());
    const WBNB = new ethers.ContractFactory(artifact("MockWBNB", "mocks/MockWBNB").abi, artifact("MockWBNB", "mocks/MockWBNB").bytecode, owner);
    const pancakeWbnb = await WBNB.deploy();
    await Promise.all([pancakeFactory.waitForDeployment(), pancakeWbnb.waitForDeployment()]);
    const FlowRouter = new ethers.ContractFactory(artifact("LQCFlowRouter").abi, artifact("LQCFlowRouter").bytecode, owner);
    const pancakeRouter = await FlowRouter.deploy(await pancakeFactory.getAddress(), await pancakeWbnb.getAddress());
    await pancakeRouter.waitForDeployment();
    const PancakeAdapter = new ethers.ContractFactory(artifact("PancakeV2Adapter", "router-v2/adapters/PancakeV2Adapter").abi, artifact("PancakeV2Adapter", "router-v2/adapters/PancakeV2Adapter").bytecode, owner);
    const pancakeAdapter = await PancakeAdapter.deploy(await pancakeRouter.getAddress());
    await pancakeAdapter.waitForDeployment();

    const amountA = ethers.parseEther("10000");
    const amountB = ethers.parseEther("12000");
    await (await tokenA.mint(await owner.getAddress(), amountA)).wait();
    await (await tokenB.mint(await owner.getAddress(), amountB)).wait();
    await (await tokenA.approve(await pancakeRouter.getAddress(), amountA)).wait();
    await (await tokenB.approve(await pancakeRouter.getAddress(), amountB)).wait();
    const block = await provider.getBlock("latest");
    await (await pancakeRouter.addLiquidity(await tokenA.getAddress(), await tokenB.getAddress(), amountA, amountB, 0, 0, await owner.getAddress(), BigInt(block.timestamp + 3600))).wait();

    const flowId = ethers.id("LQC_FLOW");
    const pancakeId = ethers.id("PANCAKE_V2");
    await (await registry.addDex(flowId, await adapter.getAddress(), "LQC Flow", 100)).wait();
    await (await registry.addDex(pancakeId, await pancakeAdapter.getAddress(), "PancakeSwap V2", 90)).wait();
    const path = [await tokenA.getAddress(), await tokenB.getAddress()];
    const data = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [path]);
    const best = await quoteRouter.quoteBest(path[0], path[1], ethers.parseEther("10"), [data, data]);
    assert.equal(best.dexId, pancakeId);
    assert.equal(best.adapter, await pancakeAdapter.getAddress());
  });

  it("adapts a packed PancakeSwap V3 path and isolates malformed paths", async function () {
    const Quoter = new ethers.ContractFactory(artifact("MockV3Quoter", "mocks/MockV3Quoter").abi, artifact("MockV3Quoter", "mocks/MockV3Quoter").bytecode, owner);
    const quoter = await Quoter.deploy(2);
    await quoter.waitForDeployment();
    const Adapter = new ethers.ContractFactory(artifact("PancakeV3Adapter", "router-v2/adapters/PancakeV3Adapter").abi, artifact("PancakeV3Adapter", "router-v2/adapters/PancakeV3Adapter").bytecode, owner);
    const v3Adapter = await Adapter.deploy(await quoter.getAddress());
    await v3Adapter.waitForDeployment();
    const tokenInAddress = await tokenA.getAddress();
    const tokenOutAddress = await tokenB.getAddress();
    const packedPath = ethers.solidityPacked(["address", "uint24", "address"], [tokenInAddress, 2500, tokenOutAddress]);
    assert.equal(await v3Adapter.quoteExactInput(tokenInAddress, tokenOutAddress, 100n, packedPath), 200n);
    await assert.rejects(v3Adapter.quoteExactInput(tokenInAddress, tokenOutAddress, 100n, "0x1234"));
    const reversed = ethers.solidityPacked(["address", "uint24", "address"], [tokenOutAddress, 2500, tokenInAddress]);
    await assert.rejects(v3Adapter.quoteExactInput(tokenInAddress, tokenOutAddress, 100n, reversed));
  });

  it("executes an approved exact-input route with minimum-output and deadline protection", async function () {
    const dexId = ethers.id("LQC_FLOW");
    await (await registry.addDex(dexId, await adapter.getAddress(), "LQC Flow", 100)).wait();
    const tokenIn = await tokenA.getAddress();
    const tokenOut = await tokenB.getAddress();
    const path = [tokenIn, tokenOut];
    const routeData = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [path]);
    const amountIn = ethers.parseEther("10");
    const expected = await flowRouter.getAmountsOut(amountIn, path);
    await (await tokenA.mint(await owner.getAddress(), amountIn)).wait();
    await (await tokenA.approve(await executionRouter.getAddress(), amountIn)).wait();
    const before = await tokenB.balanceOf(await other.getAddress());
    const block = await provider.getBlock("latest");

    await (await executionRouter.swapExactInput(
      dexId, tokenIn, tokenOut, amountIn, expected[1], await other.getAddress(), BigInt(block.timestamp + 3600), routeData
    )).wait();

    assert.equal((await tokenB.balanceOf(await other.getAddress())) - before, expected[1]);
    assert.equal(await tokenA.balanceOf(await executionRouter.getAddress()), 0n);
    assert.equal(await tokenA.balanceOf(await adapter.getAddress()), 0n);
    assert.equal(await tokenA.allowance(await executionRouter.getAddress(), await adapter.getAddress()), 0n);
  });

  it("rejects disabled DEXes, expired swaps, and impossible minimum output", async function () {
    const dexId = ethers.id("LQC_FLOW");
    await (await registry.addDex(dexId, await adapter.getAddress(), "LQC Flow", 100)).wait();
    const tokenIn = await tokenA.getAddress();
    const tokenOut = await tokenB.getAddress();
    const amountIn = ethers.parseEther("10");
    const routeData = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[tokenIn, tokenOut]]);
    await (await tokenA.mint(await owner.getAddress(), amountIn * 3n)).wait();
    await (await tokenA.approve(await executionRouter.getAddress(), amountIn * 3n)).wait();
    const block = await provider.getBlock("latest");

    await assert.rejects(executionRouter.swapExactInput(
      dexId, tokenIn, tokenOut, amountIn, 1n, await owner.getAddress(), BigInt(block.timestamp - 1), routeData
    ));
    await assert.rejects(executionRouter.swapExactInput(
      dexId, tokenIn, tokenOut, amountIn, ethers.MaxUint256, await owner.getAddress(), BigInt(block.timestamp + 3600), routeData
    ));
    await (await registry.setDexEnabled(dexId, false)).wait();
    await assert.rejects(executionRouter.swapExactInput(
      dexId, tokenIn, tokenOut, amountIn, 1n, await owner.getAddress(), BigInt(block.timestamp + 3600), routeData
    ));
  });

  it("automatically executes the best net-output route after estimated gas cost", async function () {
    const Factory = new ethers.ContractFactory(artifact("LQCFlowFactory").abi, artifact("LQCFlowFactory").bytecode, owner);
    const pancakeFactory = await Factory.deploy(await owner.getAddress());
    const WBNB = new ethers.ContractFactory(artifact("MockWBNB", "mocks/MockWBNB").abi, artifact("MockWBNB", "mocks/MockWBNB").bytecode, owner);
    const pancakeWbnb = await WBNB.deploy();
    await Promise.all([pancakeFactory.waitForDeployment(), pancakeWbnb.waitForDeployment()]);
    const FlowRouter = new ethers.ContractFactory(artifact("LQCFlowRouter").abi, artifact("LQCFlowRouter").bytecode, owner);
    const pancakeRouter = await FlowRouter.deploy(await pancakeFactory.getAddress(), await pancakeWbnb.getAddress());
    await pancakeRouter.waitForDeployment();
    const PancakeAdapter = new ethers.ContractFactory(artifact("PancakeV2Adapter", "router-v2/adapters/PancakeV2Adapter").abi, artifact("PancakeV2Adapter", "router-v2/adapters/PancakeV2Adapter").bytecode, owner);
    const pancakeAdapter = await PancakeAdapter.deploy(await pancakeRouter.getAddress());
    await pancakeAdapter.waitForDeployment();

    const liquidityA = ethers.parseEther("10000");
    const liquidityB = ethers.parseEther("12000");
    await (await tokenA.mint(await owner.getAddress(), liquidityA)).wait();
    await (await tokenB.mint(await owner.getAddress(), liquidityB)).wait();
    await (await tokenA.approve(await pancakeRouter.getAddress(), liquidityA)).wait();
    await (await tokenB.approve(await pancakeRouter.getAddress(), liquidityB)).wait();
    const block = await provider.getBlock("latest");
    await (await pancakeRouter.addLiquidity(
      await tokenA.getAddress(), await tokenB.getAddress(), liquidityA, liquidityB,
      0, 0, await owner.getAddress(), BigInt(block.timestamp + 3600)
    )).wait();

    const flowId = ethers.id("LQC_FLOW");
    const pancakeId = ethers.id("PANCAKE_V2");
    await (await registry.addDex(flowId, await adapter.getAddress(), "LQC Flow", 100)).wait();
    await (await registry.addDex(pancakeId, await pancakeAdapter.getAddress(), "PancakeSwap V2", 90)).wait();
    const tokenIn = await tokenA.getAddress();
    const tokenOut = await tokenB.getAddress();
    const path = [tokenIn, tokenOut];
    const route = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [path]);
    const amountIn = ethers.parseEther("10");
    const flowQuote = (await flowRouter.getAmountsOut(amountIn, path))[1];
    const pancakeQuote = (await pancakeRouter.getAmountsOut(amountIn, path))[1];
    const pancakeCost = pancakeQuote - flowQuote + 1n;
    await (await tokenA.mint(await owner.getAddress(), amountIn)).wait();
    await (await tokenA.approve(await executionRouter.getAddress(), amountIn)).wait();

    const tx = await executionRouter.swapBestExactInput(
      tokenIn, tokenOut, amountIn, flowQuote, await other.getAddress(), BigInt(block.timestamp + 3600),
      [route, route], [0, pancakeCost]
    );
    const receipt = await tx.wait();
    const event = receipt.logs.map((log) => {
      try { return executionRouter.interface.parseLog(log); } catch { return null; }
    }).find((parsed) => parsed?.name === "SwapExecuted");
    assert.equal(event.args.dexId, flowId);
    assert.equal(event.args.amountOut, flowQuote);
  });

  it("atomically splits one order across two reviewed DEX routes", async function () {
    const Factory = new ethers.ContractFactory(artifact("LQCFlowFactory").abi, artifact("LQCFlowFactory").bytecode, owner);
    const secondFactory = await Factory.deploy(await owner.getAddress());
    const WBNB = new ethers.ContractFactory(artifact("MockWBNB", "mocks/MockWBNB").abi, artifact("MockWBNB", "mocks/MockWBNB").bytecode, owner);
    const secondWbnb = await WBNB.deploy();
    await Promise.all([secondFactory.waitForDeployment(), secondWbnb.waitForDeployment()]);
    const FlowRouter = new ethers.ContractFactory(artifact("LQCFlowRouter").abi, artifact("LQCFlowRouter").bytecode, owner);
    const secondRouter = await FlowRouter.deploy(await secondFactory.getAddress(), await secondWbnb.getAddress());
    await secondRouter.waitForDeployment();
    const PancakeAdapter = new ethers.ContractFactory(artifact("PancakeV2Adapter", "router-v2/adapters/PancakeV2Adapter").abi, artifact("PancakeV2Adapter", "router-v2/adapters/PancakeV2Adapter").bytecode, owner);
    const secondAdapter = await PancakeAdapter.deploy(await secondRouter.getAddress());
    await secondAdapter.waitForDeployment();

    const liquidity = ethers.parseEther("10000");
    await (await tokenA.mint(await owner.getAddress(), liquidity)).wait();
    await (await tokenB.mint(await owner.getAddress(), liquidity)).wait();
    await (await tokenA.approve(await secondRouter.getAddress(), liquidity)).wait();
    await (await tokenB.approve(await secondRouter.getAddress(), liquidity)).wait();
    const block = await provider.getBlock("latest");
    await (await secondRouter.addLiquidity(
      await tokenA.getAddress(), await tokenB.getAddress(), liquidity, liquidity,
      0, 0, await owner.getAddress(), BigInt(block.timestamp + 3600)
    )).wait();

    const flowId = ethers.id("LQC_FLOW");
    const secondId = ethers.id("PANCAKE_V2");
    await (await registry.addDex(flowId, await adapter.getAddress(), "LQC Flow", 100)).wait();
    await (await registry.addDex(secondId, await secondAdapter.getAddress(), "PancakeSwap V2", 90)).wait();
    const tokenIn = await tokenA.getAddress();
    const tokenOut = await tokenB.getAddress();
    const path = [tokenIn, tokenOut];
    const routeData = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [path]);
    const half = ethers.parseEther("5");
    const total = half * 2n;
    const flowOut = (await flowRouter.getAmountsOut(half, path))[1];
    const secondOut = (await secondRouter.getAmountsOut(half, path))[1];
    const routes = [
      { dexId: flowId, amountIn: half, amountOutMinimum: flowOut, routeData },
      { dexId: secondId, amountIn: half, amountOutMinimum: secondOut, routeData }
    ];
    await (await tokenA.mint(await owner.getAddress(), total)).wait();
    await (await tokenA.approve(await executionRouter.getAddress(), total)).wait();
    await assert.rejects(executionRouter.swapSplitExactInput(
      tokenIn, tokenOut, total + 1n, flowOut + secondOut, await other.getAddress(),
      BigInt(block.timestamp + 3600), routes
    ));

    const before = await tokenB.balanceOf(await other.getAddress());
    const tx = await executionRouter.swapSplitExactInput(
      tokenIn, tokenOut, total, flowOut + secondOut, await other.getAddress(),
      BigInt(block.timestamp + 3600), routes
    );
    const receipt = await tx.wait();
    const swaps = receipt.logs.map((log) => {
      try { return executionRouter.interface.parseLog(log); } catch { return null; }
    }).filter((parsed) => parsed?.name === "SwapExecuted");
    assert.equal(swaps.length, 2);
    assert.equal((await tokenB.balanceOf(await other.getAddress())) - before, flowOut + secondOut);
    assert.equal(await tokenA.balanceOf(await executionRouter.getAddress()), 0n);
  });
});
