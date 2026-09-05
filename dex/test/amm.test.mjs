import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source = name) => JSON.parse(
  fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url))
);

describe("LQC Flow DEX MVP", function () {
  let eip1193, provider, owner, trader, factory, router, tokenA, tokenB, wbnb;

  beforeEach(async function () {
    eip1193 = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 3 } });
    provider = new ethers.BrowserProvider(eip1193);
    owner = await provider.getSigner(0);
    trader = await provider.getSigner(1);

    const Factory = new ethers.ContractFactory(artifact("LQCFlowFactory").abi, artifact("LQCFlowFactory").bytecode, owner);
    factory = await Factory.deploy(await owner.getAddress());
    const Token = new ethers.ContractFactory(artifact("MockERC20", "mocks/MockERC20").abi, artifact("MockERC20", "mocks/MockERC20").bytecode, owner);
    tokenA = await Token.deploy("Token A", "TKA");
    tokenB = await Token.deploy("Token B", "TKB");
    const WBNB = new ethers.ContractFactory(artifact("MockWBNB", "mocks/MockWBNB").abi, artifact("MockWBNB", "mocks/MockWBNB").bytecode, owner);
    wbnb = await WBNB.deploy();
    await Promise.all([factory.waitForDeployment(), tokenA.waitForDeployment(), tokenB.waitForDeployment(), wbnb.waitForDeployment()]);
    const Router = new ethers.ContractFactory(artifact("LQCFlowRouter").abi, artifact("LQCFlowRouter").bytecode, owner);
    router = await Router.deploy(await factory.getAddress(), await wbnb.getAddress());
    await router.waitForDeployment();

    const ownerAddress = await owner.getAddress();
    const traderAddress = await trader.getAddress();
    await (await tokenA.mint(ownerAddress, ethers.parseEther("100000"))).wait();
    await (await tokenB.mint(ownerAddress, ethers.parseEther("100000"))).wait();
    await (await tokenA.mint(traderAddress, ethers.parseEther("1000"))).wait();
    await (await tokenA.approve(await router.getAddress(), ethers.MaxUint256)).wait();
    await (await tokenB.approve(await router.getAddress(), ethers.MaxUint256)).wait();
  });

  async function deadline() {
    return BigInt((await provider.getBlock("latest")).timestamp + 3600);
  }

  it("creates a pool and mints locked plus provider LP tokens", async function () {
    await (await router.addLiquidity(
      await tokenA.getAddress(), await tokenB.getAddress(),
      ethers.parseEther("10000"), ethers.parseEther("20000"), 0, 0,
      await owner.getAddress(), await deadline()
    )).wait();
    const pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
    assert.notEqual(pairAddress, ethers.ZeroAddress);
    const pair = new ethers.Contract(pairAddress, artifact("LQCFlowPair").abi, owner);
    assert.equal(await pair.balanceOf("0x0000000000000000000000000000000000000001"), 1000n);
    assert((await pair.balanceOf(await owner.getAddress())) > 0n);
  });

  it("quotes and executes an exact-input swap with a 0.30% fee", async function () {
    await (await router.addLiquidity(
      await tokenA.getAddress(), await tokenB.getAddress(),
      ethers.parseEther("10000"), ethers.parseEther("10000"), 0, 0,
      await owner.getAddress(), await deadline()
    )).wait();
    const path = [await tokenA.getAddress(), await tokenB.getAddress()];
    const amountIn = ethers.parseEther("100");
    const amounts = await router.getAmountsOut(amountIn, path);
    await (await tokenA.connect(trader).approve(await router.getAddress(), amountIn)).wait();
    await (await router.connect(trader).swapExactTokensForTokens(
      amountIn, amounts[1], path, await trader.getAddress(), await deadline()
    )).wait();
    assert.equal(await tokenB.balanceOf(await trader.getAddress()), amounts[1]);
    assert(amounts[1] < ethers.parseEther("100"));
  });

  it("rejects swaps whose deadline has expired", async function () {
    const path = [await tokenA.getAddress(), await tokenB.getAddress()];
    await assert.rejects(
      router.connect(trader).swapExactTokensForTokens(1n, 0n, path, await trader.getAddress(), 1n)
    );
  });

  it("removes liquidity and returns both underlying assets", async function () {
    await (await router.addLiquidity(
      await tokenA.getAddress(), await tokenB.getAddress(),
      ethers.parseEther("10000"), ethers.parseEther("10000"), 0, 0,
      await owner.getAddress(), await deadline()
    )).wait();
    const pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
    const pair = new ethers.Contract(pairAddress, artifact("LQCFlowPair").abi, owner);
    const liquidity = (await pair.balanceOf(await owner.getAddress())) / 2n;
    await (await pair.approve(await router.getAddress(), liquidity)).wait();
    const beforeA = await tokenA.balanceOf(await owner.getAddress());
    const beforeB = await tokenB.balanceOf(await owner.getAddress());
    await (await router.removeLiquidity(
      await tokenA.getAddress(), await tokenB.getAddress(), liquidity, 0, 0,
      await owner.getAddress(), await deadline()
    )).wait();
    assert((await tokenA.balanceOf(await owner.getAddress())) > beforeA);
    assert((await tokenB.balanceOf(await owner.getAddress())) > beforeB);
  });

  it("adds token/BNB liquidity and refunds excess BNB", async function () {
    const routerAddress = await router.getAddress();
    await (await tokenA.approve(routerAddress, ethers.MaxUint256)).wait();
    await (await router.addLiquidityBNB(
      await tokenA.getAddress(), ethers.parseEther("1000"), 0, 0,
      await owner.getAddress(), await deadline(), { value: ethers.parseEther("10") }
    )).wait();
    const pairAddress = await factory.getPair(await tokenA.getAddress(), await wbnb.getAddress());
    assert.notEqual(pairAddress, ethers.ZeroAddress);
    assert.equal(await wbnb.balanceOf(pairAddress), ethers.parseEther("10"));

    await (await router.addLiquidityBNB(
      await tokenA.getAddress(), ethers.parseEther("100"), 0, 0,
      await owner.getAddress(), await deadline(), { value: ethers.parseEther("2") }
    )).wait();
    assert.equal(await wbnb.balanceOf(routerAddress), 0n);
    assert.equal(await provider.getBalance(routerAddress), 0n);
  });

  it("swaps native BNB for tokens", async function () {
    await (await router.addLiquidityBNB(
      await tokenA.getAddress(), ethers.parseEther("10000"), 0, 0,
      await owner.getAddress(), await deadline(), { value: ethers.parseEther("100") }
    )).wait();
    const path = [await wbnb.getAddress(), await tokenA.getAddress()];
    const value = ethers.parseEther("1");
    const amounts = await router.getAmountsOut(value, path);
    await (await router.connect(trader).swapExactBNBForTokens(
      amounts[1], path, await trader.getAddress(), await deadline(), { value }
    )).wait();
    assert.equal(await tokenA.balanceOf(await trader.getAddress()), ethers.parseEther("1000") + amounts[1]);
  });

  it("swaps tokens for native BNB", async function () {
    await (await router.addLiquidityBNB(
      await tokenA.getAddress(), ethers.parseEther("10000"), 0, 0,
      await owner.getAddress(), await deadline(), { value: ethers.parseEther("100") }
    )).wait();
    const path = [await tokenA.getAddress(), await wbnb.getAddress()];
    const amountIn = ethers.parseEther("10");
    const amounts = await router.getAmountsOut(amountIn, path);
    await (await tokenA.connect(trader).approve(await router.getAddress(), amountIn)).wait();
    const recipient = await owner.getAddress();
    const before = BigInt(await eip1193.request({ method: "eth_getBalance", params: [recipient, "latest"] }));
    await (await router.connect(trader).swapExactTokensForBNB(
      amountIn, amounts[1], path, recipient, await deadline()
    )).wait();
    const after = BigInt(await eip1193.request({ method: "eth_getBalance", params: [recipient, "latest"] }));
    assert.equal(after - before, amounts[1]);
  });

  it("removes token/BNB liquidity and unwraps WBNB", async function () {
    await (await router.addLiquidityBNB(
      await tokenA.getAddress(), ethers.parseEther("10000"), 0, 0,
      await owner.getAddress(), await deadline(), { value: ethers.parseEther("100") }
    )).wait();
    const pairAddress = await factory.getPair(await tokenA.getAddress(), await wbnb.getAddress());
    const pair = new ethers.Contract(pairAddress, artifact("LQCFlowPair").abi, owner);
    const liquidity = (await pair.balanceOf(await owner.getAddress())) / 2n;
    await (await pair.approve(await router.getAddress(), liquidity)).wait();
    await (await router.removeLiquidityBNB(
      await tokenA.getAddress(), liquidity, 0, 0,
      await trader.getAddress(), await deadline()
    )).wait();
    assert((await tokenA.balanceOf(await trader.getAddress())) > ethers.parseEther("1000"));
    assert.equal(await wbnb.balanceOf(await router.getAddress()), 0n);
    assert.equal(await provider.getBalance(await router.getAddress()), 0n);
  });

  it("executes an exact-output BNB swap and leaves no BNB in the router", async function () {
    await (await router.addLiquidityBNB(
      await tokenA.getAddress(), ethers.parseEther("10000"), 0, 0,
      await owner.getAddress(), await deadline(), { value: ethers.parseEther("100") }
    )).wait();
    const path = [await wbnb.getAddress(), await tokenA.getAddress()];
    const exactOutput = ethers.parseEther("10");
    await (await router.connect(trader).swapBNBForExactTokens(
      exactOutput, path, await trader.getAddress(), await deadline(),
      { value: ethers.parseEther("1") }
    )).wait();
    assert.equal(await tokenA.balanceOf(await trader.getAddress()), ethers.parseEther("1010"));
    assert.equal(await provider.getBalance(await router.getAddress()), 0n);
    assert.equal(await wbnb.balanceOf(await router.getAddress()), 0n);
  });

  it("rejects unsolicited native BNB transfers", async function () {
    await assert.rejects(
      trader.sendTransaction({ to: await router.getAddress(), value: 1n })
    );
  });
});
