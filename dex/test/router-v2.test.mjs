import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source = name) => JSON.parse(
  fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url))
);

describe("LQC Flow Router V2", function () {
  let provider, owner, trader, tokenIn, tokenOut, router, adapterA, adapterB;

  beforeEach(async function () {
    provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 3 } }));
    owner = await provider.getSigner(0);
    trader = await provider.getSigner(1);

    const Token = new ethers.ContractFactory(
      artifact("MockERC20", "mocks/MockERC20").abi,
      artifact("MockERC20", "mocks/MockERC20").bytecode,
      owner
    );
    tokenIn = await Token.deploy("Input", "IN");
    tokenOut = await Token.deploy("Output", "OUT");

    const Router = new ethers.ContractFactory(artifact("LQCFlowRouterV2").abi, artifact("LQCFlowRouterV2").bytecode, owner);
    router = await Router.deploy(await owner.getAddress());

    const Adapter = new ethers.ContractFactory(
      artifact("MockDEXAdapter", "mocks/MockDEXAdapter").abi,
      artifact("MockDEXAdapter", "mocks/MockDEXAdapter").bytecode,
      owner
    );
    adapterA = await Adapter.deploy(150, 150, 100);
    adapterB = await Adapter.deploy(200, 200, 100);
    await Promise.all([
      tokenIn.waitForDeployment(), tokenOut.waitForDeployment(), router.waitForDeployment(),
      adapterA.waitForDeployment(), adapterB.waitForDeployment()
    ]);

    await (await router.setAdapter(await adapterA.getAddress(), true)).wait();
    await (await router.setAdapter(await adapterB.getAddress(), true)).wait();
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
});
