import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source = name) => JSON.parse(
  fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url))
);

describe("BSC testnet bootstrap smoke flow", function () {
  it("deploys the full stack, creates pools, quotes through Router 2.0, and swaps under a cap", async function () {
    const provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 3 } }));
    const owner = await provider.getSigner(0);
    const trader = await provider.getSigner(1);
    const ownerAddress = await owner.getAddress();
    const traderAddress = await trader.getAddress();
    const deploy = async (name, source, args = []) => {
      const a = artifact(name, source);
      const contract = await new ethers.ContractFactory(a.abi, a.bytecode, owner).deploy(...args);
      await contract.waitForDeployment();
      return contract;
    };

    const lqc = await deploy("LQCTestToken", "testnet/LQCTestToken", ["LQC Test Token", "LQC", 18, ownerAddress]);
    const usdt = await deploy("LQCTestToken", "testnet/LQCTestToken", ["Mock USDT", "USDT", 18, ownerAddress]);
    const wbnb = await deploy("MockWBNB", "mocks/MockWBNB");
    const factory = await deploy("LQCFlowFactory", "LQCFlowFactory", [ownerAddress]);
    const router = await deploy("LQCFlowRouter", "LQCFlowRouter", [await factory.getAddress(), await wbnb.getAddress()]);
    const registry = await deploy("LQCDexRegistry", "router-v2/LQCDexRegistry", [ownerAddress]);
    const quoteRouter = await deploy("LQCQuoteRouter", "router-v2/LQCQuoteRouter", [await registry.getAddress()]);
    const adapter = await deploy("LQCFlowAdapter", "router-v2/adapters/LQCFlowAdapter", [await router.getAddress()]);
    await (await registry.addDex(ethers.id("LQC_FLOW"), await adapter.getAddress(), "LQC Flow", 100)).wait();

    await (await lqc.mint(ownerAddress, ethers.parseEther("1000000"))).wait();
    await (await usdt.mint(ownerAddress, ethers.parseEther("1000000"))).wait();
    await (await lqc.mint(traderAddress, ethers.parseEther("100"))).wait();
    const routerAddress = await router.getAddress();
    await (await lqc.approve(routerAddress, ethers.parseEther("200000"))).wait();
    await (await usdt.approve(routerAddress, ethers.parseEther("100000"))).wait();
    const deadline = BigInt((await provider.getBlock("latest")).timestamp + 3600);
    await (await router.addLiquidity(
      await lqc.getAddress(), await usdt.getAddress(), ethers.parseEther("100000"),
      ethers.parseEther("100000"), 0, 0, ownerAddress, deadline
    )).wait();
    await (await router.addLiquidityBNB(
      await lqc.getAddress(), ethers.parseEther("100000"), 0, 0, ownerAddress, deadline,
      { value: ethers.parseEther("10") }
    )).wait();
    assert.equal(await lqc.allowance(ownerAddress, routerAddress), 0n);
    assert.equal(await usdt.allowance(ownerAddress, routerAddress), 0n);

    assert.notEqual(await factory.getPair(await lqc.getAddress(), await usdt.getAddress()), ethers.ZeroAddress);
    assert.notEqual(await factory.getPair(await lqc.getAddress(), await wbnb.getAddress()), ethers.ZeroAddress);

    const path = [await lqc.getAddress(), await usdt.getAddress()];
    const amountIn = ethers.parseEther("1");
    const routeData = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [path]);
    const best = await quoteRouter.quoteBest(path[0], path[1], amountIn, [routeData]);
    assert.equal(best.dexId, ethers.id("LQC_FLOW"));
    assert(best.amountOut > 0n);

    await (await lqc.connect(trader).approve(await router.getAddress(), amountIn)).wait();
    const before = await usdt.balanceOf(traderAddress);
    await (await router.connect(trader).swapExactTokensForTokens(
      amountIn, best.amountOut * 9950n / 10000n, path, traderAddress, deadline
    )).wait();
    assert.equal((await usdt.balanceOf(traderAddress)) - before, best.amountOut);

    await assert.rejects(router.connect(trader).swapExactTokensForTokens(
      amountIn, best.amountOut + 1n, path, traderAddress, deadline
    ));
  });
});
