import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source = name) => JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)));

describe("LQC Router 2.0", function () {
  let provider, owner, other, tokenA, tokenB, flowRouter, registry, quoteRouter, executionRouter, splitOptimizer, autoRouter, adapter;

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
    executionRouter = await ExecutionRouter.deploy(await registry.getAddress(), ethers.ZeroAddress);
    const SplitOptimizer = new ethers.ContractFactory(artifact("LQCSplitOptimizer", "router-v2/LQCSplitOptimizer").abi, artifact("LQCSplitOptimizer", "router-v2/LQCSplitOptimizer").bytecode, owner);
    splitOptimizer = await SplitOptimizer.deploy(await registry.getAddress());
    const AutoRouter = new ethers.ContractFactory(artifact("LQCAutoRouter", "router-v2/LQCAutoRouter").abi, artifact("LQCAutoRouter", "router-v2/LQCAutoRouter").bytecode, owner);
    autoRouter = await AutoRouter.deploy(await splitOptimizer.getAddress(), await executionRouter.getAddress());
    const Adapter = new ethers.ContractFactory(artifact("LQCFlowAdapter", "router-v2/adapters/LQCFlowAdapter").abi, artifact("LQCFlowAdapter", "router-v2/adapters/LQCFlowAdapter").bytecode, owner);
    adapter = await Adapter.deploy(await flowRouter.getAddress());
    await Promise.all([quoteRouter.waitForDeployment(), executionRouter.waitForDeployment(), splitOptimizer.waitForDeployment(), autoRouter.waitForDeployment(), adapter.waitForDeployment()]);
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
    const duplicateRoutes = [
      { dexId: flowId, amountIn: half, amountOutMinimum: flowOut, routeData },
      { dexId: flowId, amountIn: half, amountOutMinimum: flowOut, routeData }
    ];
    await assert.rejects(executionRouter.swapSplitExactInput(
      tokenIn, tokenOut, total, flowOut * 2n, await other.getAddress(),
      BigInt(block.timestamp + 3600), duplicateRoutes
    ));
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

  it("rolls back every split leg when a later adapter route fails", async function () {
    const firstId = ethers.id("LQC_FLOW_FIRST");
    const failingId = ethers.id("LQC_FLOW_FAILING");
    await (await registry.addDex(firstId, await adapter.getAddress(), "LQC Flow first", 100)).wait();
    await (await registry.addDex(failingId, await adapter.getAddress(), "LQC Flow failing", 90)).wait();
    const tokenIn = await tokenA.getAddress();
    const tokenOut = await tokenB.getAddress();
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const validRoute = coder.encode(["address[]"], [[tokenIn, tokenOut]]);
    const invalidRoute = coder.encode(["address[]"], [[tokenOut, tokenIn]]);
    const half = ethers.parseEther("5");
    const amountIn = half * 2n;
    const expectedFirst = (await flowRouter.getAmountsOut(half, [tokenIn, tokenOut]))[1];
    const routes = [
      { dexId: firstId, amountIn: half, amountOutMinimum: expectedFirst, routeData: validRoute },
      { dexId: failingId, amountIn: half, amountOutMinimum: 1n, routeData: invalidRoute }
    ];
    await (await tokenA.mint(await owner.getAddress(), amountIn)).wait();
    await (await tokenA.approve(await executionRouter.getAddress(), amountIn)).wait();
    const Factory = new ethers.Contract(
      await flowRouter.factory(), artifact("LQCFlowFactory").abi, owner
    );
    const pairAddress = await Factory.getPair(tokenIn, tokenOut);
    const pair = new ethers.Contract(pairAddress, artifact("LQCFlowPair").abi, owner);
    const reservesBefore = await pair.getReserves();
    const senderBefore = await tokenA.balanceOf(await owner.getAddress());
    const recipientBefore = await tokenB.balanceOf(await other.getAddress());
    const block = await provider.getBlock("latest");

    await assert.rejects(executionRouter.swapSplitExactInput(
      tokenIn, tokenOut, amountIn, expectedFirst, await other.getAddress(),
      BigInt(block.timestamp + 3600), routes
    ));

    const reservesAfter = await pair.getReserves();
    assert.equal(await tokenA.balanceOf(await owner.getAddress()), senderBefore);
    assert.equal(await tokenB.balanceOf(await other.getAddress()), recipientBefore);
    assert.equal(reservesAfter[0], reservesBefore[0]);
    assert.equal(reservesAfter[1], reservesBefore[1]);
    assert.equal(await tokenA.balanceOf(await executionRouter.getAddress()), 0n);
    assert.equal(await tokenB.balanceOf(await executionRouter.getAddress()), 0n);
    assert.equal(await tokenA.balanceOf(await adapter.getAddress()), 0n);
    assert.equal(await tokenB.balanceOf(await adapter.getAddress()), 0n);
  });

  it("automatically allocates parts across DEXs to reduce price impact", async function () {
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

    await (await registry.addDex(ethers.id("LQC_FLOW"), await adapter.getAddress(), "LQC Flow", 100)).wait();
    await (await registry.addDex(ethers.id("PANCAKE_V2"), await secondAdapter.getAddress(), "PancakeSwap V2", 90)).wait();
    const tokenIn = await tokenA.getAddress();
    const tokenOut = await tokenB.getAddress();
    const path = [tokenIn, tokenOut];
    const route = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [path]);
    const amountIn = ethers.parseEther("1000");
    const singleRouteOut = (await flowRouter.getAmountsOut(amountIn, path))[1];
    const optimized = await splitOptimizer.quoteOptimalSplit(
      tokenIn, tokenOut, amountIn, [route, route], [0, 0], 10
    );

    assert.equal(optimized.amountsIn[0] + optimized.amountsIn[1], amountIn);
    assert(optimized.amountsIn[0] > 0n);
    assert(optimized.amountsIn[1] > 0n);
    assert(optimized.totalAmountOut > singleRouteOut);
    assert.equal(optimized.totalNetAmountOut, optimized.totalAmountOut);

    await (await tokenA.mint(await owner.getAddress(), amountIn)).wait();
    await (await tokenA.approve(await autoRouter.getAddress(), amountIn)).wait();
    const before = await tokenB.balanceOf(await other.getAddress());
    await assert.rejects(autoRouter.swapOptimizedExactInput(
      tokenIn, tokenOut, amountIn, await other.getAddress(), BigInt(block.timestamp + 3600),
      [route, route], [0, 0], 10, 2001
    ));
    await (await autoRouter.swapOptimizedExactInput(
      tokenIn, tokenOut, amountIn, await other.getAddress(), BigInt(block.timestamp + 3600),
      [route, route], [0, 0], 10, 100
    )).wait();
    const received = (await tokenB.balanceOf(await other.getAddress())) - before;
    assert(received >= optimized.totalAmountOut * 9900n / 10000n);
    assert.equal(await tokenA.balanceOf(await autoRouter.getAddress()), 0n);
    assert.equal(await tokenA.allowance(await autoRouter.getAddress(), await executionRouter.getAddress()), 0n);
  });

  it("preserves capped split invariants across sampled amounts and part counts", async function () {
    const tokenIn = await tokenA.getAddress();
    const tokenOut = await tokenB.getAddress();
    const route = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[tokenIn, tokenOut]]);
    for (let i = 0; i < 5; i++) {
      await (await registry.addDex(
        ethers.id(`SAMPLED_DEX_${i}`), await adapter.getAddress(), `Sampled DEX ${i}`, 100 - i
      )).wait();
    }
    const routeData = Array(5).fill(route);
    const routeCosts = [0n, 1n, 2n, 3n, 4n];
    const samples = [
      [ethers.parseEther("1"), 2],
      [ethers.parseEther("17"), 7],
      [ethers.parseEther("250"), 13],
      [ethers.parseEther("1000"), 20]
    ];

    for (const [amountIn, parts] of samples) {
      const quote = await splitOptimizer.quoteOptimalSplitCapped(
        tokenIn, tokenOut, amountIn, routeData, routeCosts, parts, 4
      );
      const allocated = Array.from(quote.amountsIn);
      const outputs = Array.from(quote.amountsOut);
      assert.equal(allocated.reduce((sum, value) => sum + value, 0n), amountIn);
      assert.equal(outputs.reduce((sum, value) => sum + value, 0n), quote.totalAmountOut);
      assert(quote.totalNetAmountOut <= quote.totalAmountOut);
      assert(allocated.filter(value => value > 0n).length <= 4);
      allocated.forEach((value, index) => {
        assert.equal(value === 0n, outputs[index] === 0n, `allocation/output mismatch at route ${index}`);
      });
    }

    const single = await splitOptimizer.quoteOptimalSplitCapped(
      tokenIn, tokenOut, ethers.parseEther("100"), routeData, routeCosts, 10, 1
    );
    assert.equal(Array.from(single.amountsIn).filter(value => value > 0n).length, 1);
    await assert.rejects(splitOptimizer.quoteOptimalSplitCapped(
      tokenIn, tokenOut, ethers.parseEther("1"), routeData, routeCosts, 1, 4
    ));
    await assert.rejects(splitOptimizer.quoteOptimalSplitCapped(
      tokenIn, tokenOut, ethers.parseEther("1"), routeData, routeCosts, 2, 5
    ));
  });

  it("quotes and executes a protected PancakeSwap V3 packed path", async function () {
    const Quoter = new ethers.ContractFactory(
      artifact("MockV3Quoter", "mocks/MockV3Quoter").abi,
      artifact("MockV3Quoter", "mocks/MockV3Quoter").bytecode,
      owner
    );
    const SwapRouter = new ethers.ContractFactory(
      artifact("MockV3SwapRouter", "mocks/MockV3SwapRouter").abi,
      artifact("MockV3SwapRouter", "mocks/MockV3SwapRouter").bytecode,
      owner
    );
    const quoter = await Quoter.deploy(2);
    const swapRouter = await SwapRouter.deploy(2);
    await Promise.all([quoter.waitForDeployment(), swapRouter.waitForDeployment()]);
    const Adapter = new ethers.ContractFactory(
      artifact("PancakeV3ExecutionAdapter", "router-v2/adapters/PancakeV3ExecutionAdapter").abi,
      artifact("PancakeV3ExecutionAdapter", "router-v2/adapters/PancakeV3ExecutionAdapter").bytecode,
      owner
    );
    const v3Adapter = await Adapter.deploy(
      await quoter.getAddress(), await swapRouter.getAddress(), await owner.getAddress()
    );
    await v3Adapter.waitForDeployment();

    const dexId = ethers.id("PANCAKE_V3");
    await (await registry.addDex(dexId, await v3Adapter.getAddress(), "PancakeSwap V3", 95)).wait();
    const tokenIn = await tokenA.getAddress();
    const tokenOut = await tokenB.getAddress();
    const packedPath = ethers.solidityPacked(["address", "uint24", "address"], [tokenIn, 2500, tokenOut]);
    await assert.rejects(v3Adapter.connect(other).setFeeTierAllowed(2500, true));
    await (await v3Adapter.setFeeTierAllowed(2500, true)).wait();
    await assert.rejects(v3Adapter.quoteExactInput(tokenIn, tokenOut, 1n, packedPath));
    await (await v3Adapter.setPoolAllowed(tokenIn, tokenOut, 2500, true)).wait();
    const amountIn = ethers.parseEther("10");
    const expectedOut = amountIn * 2n;
    await (await tokenA.mint(await owner.getAddress(), amountIn)).wait();
    await (await tokenB.mint(await swapRouter.getAddress(), expectedOut)).wait();
    await (await tokenA.approve(await executionRouter.getAddress(), amountIn)).wait();
    const block = await provider.getBlock("latest");
    const before = await tokenB.balanceOf(await other.getAddress());

    assert.equal(await v3Adapter.quoteExactInput(tokenIn, tokenOut, amountIn, packedPath), expectedOut);
    await assert.rejects(executionRouter.swapExactInput(
      dexId, tokenIn, tokenOut, amountIn, expectedOut + 1n, await other.getAddress(),
      BigInt(block.timestamp + 3600), packedPath
    ));
    await (await executionRouter.swapExactInput(
      dexId, tokenIn, tokenOut, amountIn, expectedOut, await other.getAddress(),
      BigInt(block.timestamp + 3600), packedPath
    )).wait();

    assert.equal((await tokenB.balanceOf(await other.getAddress())) - before, expectedOut);
    assert.equal(await tokenA.balanceOf(await v3Adapter.getAddress()), 0n);
    assert.equal(await tokenA.allowance(await v3Adapter.getAddress(), await swapRouter.getAddress()), 0n);

    const unapprovedFeePath = ethers.solidityPacked(
      ["address", "uint24", "address"], [tokenIn, 500, tokenOut]
    );
    await assert.rejects(v3Adapter.quoteExactInput(tokenIn, tokenOut, 1n, unapprovedFeePath));
    const fourHopPath = ethers.solidityPacked(
      ["address", "uint24", "address", "uint24", "address", "uint24", "address", "uint24", "address"],
      [tokenIn, 2500, tokenOut, 2500, tokenIn, 2500, tokenOut, 2500, tokenOut]
    );
    await assert.rejects(v3Adapter.quoteExactInput(tokenIn, tokenOut, 1n, fourHopPath));
  });
});
