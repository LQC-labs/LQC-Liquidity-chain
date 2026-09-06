import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source = name) => JSON.parse(
  fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url))
);

describe("LQC Flow Router V2", function () {
  let eip1193, provider, owner, trader, tokenIn, tokenOut, wbnb, router, adapterA, adapterB;

  beforeEach(async function () {
    eip1193 = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 3 } });
    provider = new ethers.BrowserProvider(eip1193);
    owner = await provider.getSigner(0);
    trader = await provider.getSigner(1);

    const Token = new ethers.ContractFactory(
      artifact("MockERC20", "mocks/MockERC20").abi,
      artifact("MockERC20", "mocks/MockERC20").bytecode,
      owner
    );
    tokenIn = await Token.deploy("Input", "IN");
    tokenOut = await Token.deploy("Output", "OUT");
    const WBNB = new ethers.ContractFactory(
      artifact("MockWBNB", "mocks/MockWBNB").abi,
      artifact("MockWBNB", "mocks/MockWBNB").bytecode,
      owner
    );
    wbnb = await WBNB.deploy();

    const Router = new ethers.ContractFactory(artifact("LQCFlowRouterV2").abi, artifact("LQCFlowRouterV2").bytecode, owner);
    router = await Router.deploy(await owner.getAddress(), await trader.getAddress(), await wbnb.getAddress());

    const Adapter = new ethers.ContractFactory(
      artifact("MockDEXAdapter", "mocks/MockDEXAdapter").abi,
      artifact("MockDEXAdapter", "mocks/MockDEXAdapter").bytecode,
      owner
    );
    adapterA = await Adapter.deploy(150, 150, 100);
    adapterB = await Adapter.deploy(200, 200, 100);
    await Promise.all([
      tokenIn.waitForDeployment(), tokenOut.waitForDeployment(), wbnb.waitForDeployment(), router.waitForDeployment(),
      adapterA.waitForDeployment(), adapterB.waitForDeployment()
    ]);

    await (await router.setAdapter(await adapterA.getAddress(), true)).wait();
    await (await router.setAdapter(await adapterB.getAddress(), true)).wait();
    await (await router.setTokenRisk(await tokenIn.getAddress(), true, ethers.parseEther("100"), ethers.parseEther("1000"))).wait();
    await (await router.setTokenRisk(await tokenOut.getAddress(), true, ethers.parseEther("100"), ethers.parseEther("1000"))).wait();
    await (await router.setTokenRisk(await wbnb.getAddress(), true, ethers.parseEther("100"), ethers.parseEther("1000"))).wait();
    await (await tokenIn.mint(await trader.getAddress(), ethers.parseEther("100"))).wait();
    await (await tokenOut.mint(await adapterA.getAddress(), ethers.parseEther("1000"))).wait();
    await (await tokenOut.mint(await adapterB.getAddress(), ethers.parseEther("1000"))).wait();
    await (await tokenIn.connect(trader).approve(await router.getAddress(), ethers.MaxUint256)).wait();
  });

  const routes = () => ["0x", "0x"];
  const adapters = async () => [await adapterA.getAddress(), await adapterB.getAddress()];
  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 3600);

  it("selects and executes the highest-output enabled adapter", async function () {
    const amountIn = ethers.parseEther("10");
    const quote = await router.getBestQuote(
      await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, await adapters(), routes()
    );
    assert.equal(quote.bestIndex, 1n);
    assert.equal(quote.amountOut, ethers.parseEther("20"));

    await (await router.connect(trader).swapBestExactInput(
      await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, quote.amountOut,
      await adapters(), routes(), await trader.getAddress(), deadline()
    )).wait();
    assert.equal(await tokenOut.balanceOf(await trader.getAddress()), ethers.parseEther("20"));
    assert.equal(await tokenIn.allowance(await router.getAddress(), await adapterB.getAddress()), 0n);
  });

  it("skips disabled and reverting adapters while quoting", async function () {
    await (await router.setAdapter(await adapterB.getAddress(), false)).wait();
    await (await adapterA.setQuoteReverts(true)).wait();
    await assert.rejects(router.getBestQuote(
      await tokenIn.getAddress(), await tokenOut.getAddress(), 1n, await adapters(), routes()
    ));
  });

  it("reverts the whole swap when an adapter overstates actual output", async function () {
    const Adapter = new ethers.ContractFactory(
      artifact("MockDEXAdapter", "mocks/MockDEXAdapter").abi,
      artifact("MockDEXAdapter", "mocks/MockDEXAdapter").bytecode,
      owner
    );
    const dishonest = await Adapter.deploy(300, 100, 100);
    await dishonest.waitForDeployment();
    await (await router.setAdapter(await dishonest.getAddress(), true)).wait();
    await (await tokenOut.mint(await dishonest.getAddress(), ethers.parseEther("1000"))).wait();

    const traderBalanceBefore = await tokenIn.balanceOf(await trader.getAddress());
    await assert.rejects(router.connect(trader).swapBestExactInput(
      await tokenIn.getAddress(), await tokenOut.getAddress(), ethers.parseEther("10"), ethers.parseEther("25"),
      [await dishonest.getAddress()], ["0x"], await trader.getAddress(), deadline()
    ));
    assert.equal(await tokenIn.balanceOf(await trader.getAddress()), traderBalanceBefore);
    assert.equal(await tokenOut.balanceOf(await trader.getAddress()), 0n);
  });

  it("enforces deadlines and owner-only adapter management", async function () {
    await assert.rejects(router.connect(trader).setAdapter(await adapterA.getAddress(), false));
    await assert.rejects(router.connect(trader).swapBestExactInput(
      await tokenIn.getAddress(), await tokenOut.getAddress(), 1n, 0n,
      await adapters(), routes(), await trader.getAddress(), 1n
    ));
  });

  it("enforces token allowlisting and owner-only risk configuration", async function () {
    const tokenInAddress = await tokenIn.getAddress();
    const tokenOutAddress = await tokenOut.getAddress();
    await assert.rejects(router.connect(trader).setTokenRisk(tokenInAddress, false, 0, 0));
    await (await router.setTokenRisk(tokenOutAddress, false, 0, 0)).wait();
    await assert.rejects(router.connect(trader).swapBestExactInput(
      tokenInAddress, tokenOutAddress, ethers.parseEther("1"), 0n,
      await adapters(), routes(), await trader.getAddress(), deadline()
    ));
  });

  it("enforces per-trade and cumulative daily input caps", async function () {
    const tokenInAddress = await tokenIn.getAddress();
    const tokenOutAddress = await tokenOut.getAddress();
    await (await router.setTokenRisk(tokenInAddress, true, ethers.parseEther("6"), ethers.parseEther("10"))).wait();
    await assert.rejects(router.connect(trader).swapBestExactInput(
      tokenInAddress, tokenOutAddress, ethers.parseEther("7"), 0n,
      await adapters(), routes(), await trader.getAddress(), deadline()
    ));
    await (await router.connect(trader).swapBestExactInput(
      tokenInAddress, tokenOutAddress, ethers.parseEther("6"), 0n,
      await adapters(), routes(), await trader.getAddress(), deadline()
    )).wait();
    await assert.rejects(router.connect(trader).swapSplitExactInput(
      tokenInAddress, tokenOutAddress, ethers.parseEther("5"), 0n,
      await adapters(), routes(), [5000, 5000], await trader.getAddress(), deadline()
    ));
    const status = await router.riskStatus(tokenInAddress, tokenOutAddress, ethers.parseEther("4"));
    assert.equal(status.allowed, true);
    assert.equal(status.remainingDailyInput, ethers.parseEther("4"));
  });

  it("rejects inconsistent risk limits", async function () {
    await assert.rejects(router.setTokenRisk(
      await tokenIn.getAddress(), true, ethers.parseEther("10"), ethers.parseEther("9")
    ));
  });

  it("applies token allowlisting to native-BNB entry and exit", async function () {
    await (await router.setTokenRisk(await wbnb.getAddress(), false, 0, 0)).wait();
    await assert.rejects(router.connect(trader).swapExactBNBForTokens(
      await tokenOut.getAddress(), 0n, await adapters(), routes(), await trader.getAddress(), deadline(),
      { value: ethers.parseEther("1") }
    ));
    await assert.rejects(router.connect(trader).swapExactTokensForBNB(
      await tokenIn.getAddress(), ethers.parseEther("1"), 0n, await adapters(), routes(),
      await trader.getAddress(), deadline()
    ));
  });

  it("fails closed when the configured oracle risk guard blocks a swap", async function () {
    const Guard = new ethers.ContractFactory(
      artifact("MockRiskGuard", "mocks/MockRiskGuard").abi,
      artifact("MockRiskGuard", "mocks/MockRiskGuard").bytecode, owner
    );
    const riskGuard = await Guard.deploy();
    await riskGuard.waitForDeployment();
    await (await router.setRiskGuard(await riskGuard.getAddress())).wait();
    await (await riskGuard.setBlocked(true)).wait();
    const status = await router.riskStatus(
      await tokenIn.getAddress(), await tokenOut.getAddress(), ethers.parseEther("1")
    );
    assert.equal(status.allowed, false);
    await assert.rejects(router.connect(trader).swapBestExactInput(
      await tokenIn.getAddress(), await tokenOut.getAddress(), ethers.parseEther("1"), 0n,
      await adapters(), routes(), await trader.getAddress(), deadline()
    ));
    const volume = await router.tokenDailyVolume(await tokenIn.getAddress());
    assert.equal(volume.amount, 0n);
  });

  it("pauses every swap entry point while keeping quotes available", async function () {
    const amountIn = ethers.parseEther("1");
    const adapterList = await adapters();
    const quote = await router.getBestQuote(
      await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, adapterList, routes()
    );
    await (await router.connect(trader).setSwapsPaused(true)).wait();
    assert.equal(await router.swapsPaused(), true);
    assert.equal((await router.getBestQuote(
      await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, adapterList, routes()
    )).amountOut, quote.amountOut);

    await assert.rejects(router.connect(trader).swapBestExactInput(
      await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, 0n,
      adapterList, routes(), await trader.getAddress(), deadline()
    ));
    await assert.rejects(router.connect(trader).swapSplitExactInput(
      await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, 0n,
      adapterList, routes(), [5000, 5000], await trader.getAddress(), deadline()
    ));
    await assert.rejects(router.connect(trader).swapExactBNBForTokens(
      await tokenOut.getAddress(), 0n, adapterList, routes(), await trader.getAddress(), deadline(), { value: amountIn }
    ));
    await assert.rejects(router.connect(trader).swapExactTokensForBNB(
      await tokenIn.getAddress(), amountIn, 0n, adapterList, routes(), await trader.getAddress(), deadline()
    ));

    await assert.rejects(router.connect(trader).setSwapsPaused(false));
    await (await router.setSwapsPaused(false)).wait();
    await (await router.connect(trader).swapBestExactInput(
      await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, quote.amountOut,
      adapterList, routes(), await trader.getAddress(), deadline()
    )).wait();
    assert.equal(await tokenOut.balanceOf(await trader.getAddress()), quote.amountOut);
  });

  it("preserves split input and output invariants across allocation samples", async function () {
    const amountIn = ethers.parseEther("10");
    const adapterList = await adapters();
    for (let firstBps = 250; firstBps < 10_000; firstBps += 487) {
      const allocation = [firstBps, 10_000 - firstBps];
      const quote = await router.getSplitQuote(
        await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn,
        adapterList, routes(), allocation
      );
      assert.equal(quote.amountsIn[0] + quote.amountsIn[1], amountIn);
      assert.equal(quote.amountsOut[0] + quote.amountsOut[1], quote.totalOut);
      assert(quote.amountsIn[0] > 0n && quote.amountsIn[1] > 0n);
      assert(quote.amountsOut[0] > 0n && quote.amountsOut[1] > 0n);
    }
  });

  it("routes through a Uniswap V2-compatible DEX adapter", async function () {
    const Factory = new ethers.ContractFactory(artifact("LQCFlowFactory").abi, artifact("LQCFlowFactory").bytecode, owner);
    const factory = await Factory.deploy(await owner.getAddress());
    await factory.waitForDeployment();
    const AmmRouter = new ethers.ContractFactory(artifact("LQCFlowRouter").abi, artifact("LQCFlowRouter").bytecode, owner);
    const ammRouter = await AmmRouter.deploy(await factory.getAddress(), ethers.Wallet.createRandom().address);
    await ammRouter.waitForDeployment();

    await (await tokenIn.mint(await owner.getAddress(), ethers.parseEther("10000"))).wait();
    await (await tokenOut.mint(await owner.getAddress(), ethers.parseEther("10000"))).wait();
    await (await tokenIn.approve(await ammRouter.getAddress(), ethers.MaxUint256)).wait();
    await (await tokenOut.approve(await ammRouter.getAddress(), ethers.MaxUint256)).wait();
    await (await ammRouter.addLiquidity(
      await tokenIn.getAddress(), await tokenOut.getAddress(),
      ethers.parseEther("5000"), ethers.parseEther("5000"), 0, 0,
      await owner.getAddress(), deadline()
    )).wait();

    const Adapter = new ethers.ContractFactory(
      artifact("UniswapV2DEXAdapter", "adapters/UniswapV2DEXAdapter").abi,
      artifact("UniswapV2DEXAdapter", "adapters/UniswapV2DEXAdapter").bytecode,
      owner
    );
    const adapter = await Adapter.deploy(await router.getAddress(), await ammRouter.getAddress());
    await adapter.waitForDeployment();
    await (await router.setAdapter(await adapter.getAddress(), true)).wait();

    const amountIn = ethers.parseEther("10");
    const routeData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address[]"], [[await tokenIn.getAddress(), await tokenOut.getAddress()]]
    );
    const quote = await router.getBestQuote(
      await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn,
      [await adapter.getAddress()], [routeData]
    );
    await (await router.connect(trader).swapBestExactInput(
      await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, quote.amountOut,
      [await adapter.getAddress()], [routeData], await trader.getAddress(), deadline()
    )).wait();
    assert.equal(await tokenOut.balanceOf(await trader.getAddress()), quote.amountOut);
  });

  it("swaps native BNB directly for a token through the best adapter", async function () {
    const amountIn = ethers.parseEther("1");
    const quote = await router.getBestQuote(
      await wbnb.getAddress(), await tokenOut.getAddress(), amountIn, await adapters(), routes()
    );
    await (await router.connect(trader).swapExactBNBForTokens(
      await tokenOut.getAddress(), quote.amountOut, await adapters(), routes(),
      await trader.getAddress(), deadline(), { value: amountIn }
    )).wait();
    assert.equal(await tokenOut.balanceOf(await trader.getAddress()), ethers.parseEther("2"));
    assert.equal(await wbnb.balanceOf(await router.getAddress()), 0n);
    assert.equal(await provider.getBalance(await router.getAddress()), 0n);
  });

  it("swaps a token directly for native BNB", async function () {
    await (await wbnb.deposit({ value: ethers.parseEther("100") })).wait();
    await (await wbnb.transfer(await adapterA.getAddress(), ethers.parseEther("50"))).wait();
    await (await wbnb.transfer(await adapterB.getAddress(), ethers.parseEther("50"))).wait();
    const amountIn = ethers.parseEther("1");
    const quote = await router.getBestQuote(
      await tokenIn.getAddress(), await wbnb.getAddress(), amountIn, await adapters(), routes()
    );
    const recipient = await owner.getAddress();
    const before = BigInt(await eip1193.request({ method: "eth_getBalance", params: [recipient, "latest"] }));
    await (await router.connect(trader).swapExactTokensForBNB(
      await tokenIn.getAddress(), amountIn, quote.amountOut, await adapters(), routes(), recipient, deadline()
    )).wait();
    const after = BigInt(await eip1193.request({ method: "eth_getBalance", params: [recipient, "latest"] }));
    assert.equal(after - before, ethers.parseEther("2"));
    assert.equal(await wbnb.balanceOf(await router.getAddress()), 0n);
    assert.equal(await provider.getBalance(await router.getAddress()), 0n);
  });

  it("rejects unsolicited native BNB transfers", async function () {
    await assert.rejects(trader.sendTransaction({ to: await router.getAddress(), value: 1n }));
  });

  it("quotes and executes a split trade across two adapters", async function () {
    const amountIn = ethers.parseEther("10");
    const allocation = [5000, 5000];
    const quote = await router.getSplitQuote(
      await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn,
      await adapters(), routes(), allocation
    );
    assert.deepEqual(Array.from(quote.amountsIn), [ethers.parseEther("5"), ethers.parseEther("5")]);
    assert.deepEqual(Array.from(quote.amountsOut), [ethers.parseEther("7.5"), ethers.parseEther("10")]);
    assert.equal(quote.totalOut, ethers.parseEther("17.5"));

    await (await router.connect(trader).swapSplitExactInput(
      await tokenIn.getAddress(), await tokenOut.getAddress(), amountIn, quote.totalOut,
      await adapters(), routes(), allocation, await trader.getAddress(), deadline()
    )).wait();
    assert.equal(await tokenOut.balanceOf(await trader.getAddress()), quote.totalOut);
    assert.equal(await tokenIn.balanceOf(await adapterA.getAddress()), ethers.parseEther("5"));
    assert.equal(await tokenIn.balanceOf(await adapterB.getAddress()), ethers.parseEther("5"));
  });

  it("rejects invalid split allocations and disabled split routes", async function () {
    await assert.rejects(router.getSplitQuote(
      await tokenIn.getAddress(), await tokenOut.getAddress(), ethers.parseEther("10"),
      await adapters(), routes(), [4000, 5000]
    ));
    await (await router.setAdapter(await adapterB.getAddress(), false)).wait();
    await assert.rejects(router.getSplitQuote(
      await tokenIn.getAddress(), await tokenOut.getAddress(), ethers.parseEther("10"),
      await adapters(), routes(), [5000, 5000]
    ));
  });
});
