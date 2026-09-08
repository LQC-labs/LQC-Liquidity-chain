import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = JSON.parse(fs.readFileSync(new URL(
  "../artifacts/contracts/token/LQCToken.sol/LQCToken.json", import.meta.url
)));

describe("LQC fixed-supply token", function () {
  let provider, controller, holder, spender, token;

  beforeEach(async function () {
    provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
    controller = await provider.getSigner(0);
    holder = await provider.getSigner(1);
    spender = await provider.getSigner(2);
    token = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, controller).deploy(
      await controller.getAddress()
    );
    await token.waitForDeployment();
  });

  it("creates exactly 1 billion LQC once for the allocation controller", async function () {
    const supply = ethers.parseUnits("1000000000", 18);
    assert.equal(await token.MAX_SUPPLY(), supply);
    assert.equal(await token.totalSupply(), supply);
    assert.equal(await token.balanceOf(await controller.getAddress()), supply);
    assert.equal(await token.name(), "Liquidity Chain");
    assert.equal(await token.symbol(), "LQC");
    assert.equal(await token.decimals(), 18n);
  });

  it("exposes no owner, mint, pause, blacklist, fee or upgrade function", function () {
    const names = new Set(artifact.abi.filter(item => item.type === "function").map(item => item.name));
    for (const forbidden of ["owner", "mint", "pause", "blacklist", "setFee", "upgradeTo", "burnFrom"]) {
      assert.equal(names.has(forbidden), false, `${forbidden} must not exist`);
    }
  });

  it("supports transfers and finite allowance accounting", async function () {
    await (await token.transfer(await holder.getAddress(), 1_000n)).wait();
    await (await token.connect(holder).approve(await spender.getAddress(), 600n)).wait();
    await (await token.connect(spender).transferFrom(
      await holder.getAddress(), await controller.getAddress(), 400n
    )).wait();
    assert.equal(await token.balanceOf(await holder.getAddress()), 600n);
    assert.equal(await token.allowance(await holder.getAddress(), await spender.getAddress()), 200n);
  });

  it("rejects zero-address deployment and transfers beyond balance or allowance", async function () {
    await assert.rejects(new ethers.ContractFactory(artifact.abi, artifact.bytecode, controller).deploy(ethers.ZeroAddress));
    await assert.rejects(token.connect(holder).transfer(await controller.getAddress(), 1n));
    await assert.rejects(token.connect(spender).transferFrom(
      await controller.getAddress(), await holder.getAddress(), 1n
    ));
    await assert.rejects(token.transfer(ethers.ZeroAddress, 1n));
  });
});
