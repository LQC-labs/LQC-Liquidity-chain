import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source = name) => JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)));

describe("LQC Router 2.0 native BNB wrapper", function () {
  it("executes protected BNB-to-token and token-to-BNB routes without retained balances", async function () {
    const provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
    const owner = await provider.getSigner(0), recipient = await provider.getSigner(1);
    const ownerAddress = await owner.getAddress(), recipientAddress = await recipient.getAddress();
    const deploy = async (name, source, args = []) => {
      const a = artifact(name, source); const c = await new ethers.ContractFactory(a.abi, a.bytecode, owner).deploy(...args);
      await c.waitForDeployment(); return c;
    };
    const token = await deploy("MockERC20", "mocks/MockERC20", ["Token", "TKN"]);
    const wbnb = await deploy("MockWBNB", "mocks/MockWBNB");
    const factory = await deploy("LQCFlowFactory", "LQCFlowFactory", [ownerAddress]);
    const flow = await deploy("LQCFlowRouter", "LQCFlowRouter", [await factory.getAddress(), await wbnb.getAddress()]);
    const registry = await deploy("LQCDexRegistry", "router-v2/LQCDexRegistry", [ownerAddress]);
    const execution = await deploy("LQCExecutionRouter", "router-v2/LQCExecutionRouter", [await registry.getAddress(), ethers.ZeroAddress]);
    const adapter = await deploy("LQCFlowAdapter", "router-v2/adapters/LQCFlowAdapter", [await flow.getAddress()]);
    const nativeRouter = await deploy("LQCNativeRouter", "router-v2/LQCNativeRouter", [await wbnb.getAddress(), await execution.getAddress()]);
    const dexId = ethers.id("LQC_FLOW");
    await (await registry.addDex(dexId, await adapter.getAddress(), "LQC Flow", 100)).wait();
    await (await registry.setDexEnabled(dexId, true)).wait();
    await (await token.mint(ownerAddress, ethers.parseEther("10000"))).wait();
    await (await token.approve(await flow.getAddress(), ethers.MaxUint256)).wait();
    const deadline = BigInt((await provider.getBlock("latest")).timestamp + 3600);
    await (await flow.addLiquidityBNB(
      await token.getAddress(), ethers.parseEther("10000"), 0, 0, ownerAddress, deadline,
      { value: ethers.parseEther("100") }
    )).wait();

    const nativeIn = ethers.parseEther("1");
    const inPath = [await wbnb.getAddress(), await token.getAddress()];
    const inRoute = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [inPath]);
    const inQuote = (await flow.getAmountsOut(nativeIn, inPath))[1];
    const tokenBefore = await token.balanceOf(recipientAddress);
    await (await nativeRouter.swapExactNativeForToken(
      dexId, await token.getAddress(), inQuote, recipientAddress, deadline, inRoute, { value: nativeIn }
    )).wait();
    assert.equal((await token.balanceOf(recipientAddress)) - tokenBefore, inQuote);

    const tokenIn = ethers.parseEther("10");
    await (await token.mint(ownerAddress, tokenIn)).wait();
    await (await token.approve(await nativeRouter.getAddress(), tokenIn)).wait();
    const outPath = [await token.getAddress(), await wbnb.getAddress()];
    const outRoute = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [outPath]);
    const outQuote = (await flow.getAmountsOut(tokenIn, outPath))[1];
    const nativeBefore = BigInt(await provider.send("eth_getBalance", [recipientAddress, "latest"]));
    await (await nativeRouter.swapExactTokenForNative(
      dexId, await token.getAddress(), tokenIn, outQuote, recipientAddress, deadline, outRoute
    )).wait();
    const nativeAfter = BigInt(await provider.send("eth_getBalance", [recipientAddress, "latest"]));
    assert.equal(nativeAfter - nativeBefore, outQuote);
    assert.equal(await provider.getBalance(await nativeRouter.getAddress()), 0n);
    assert.equal(await wbnb.balanceOf(await nativeRouter.getAddress()), 0n);
    await assert.rejects(owner.sendTransaction({ to: await nativeRouter.getAddress(), value: 1n }));
  });
});
