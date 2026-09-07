import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ganache from "ganache";
import { ethers } from "ethers";

const root = path.resolve(import.meta.dirname, "..");
const load = (source, name) => JSON.parse(fs.readFileSync(path.join(root, `artifacts/contracts/${source}.sol/${name}.json`)));

describe("LQC production token primitives", function () {
  let provider, rpc, owner, beneficiary, token;

  beforeEach(async function () {
    rpc = ganache.provider({ logging: { quiet: true } });
    provider = new ethers.BrowserProvider(rpc);
    owner = await provider.getSigner(0);
    beneficiary = await provider.getSigner(1);
    const artifact = load("token/LQCToken", "LQCToken");
    token = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner).deploy(await owner.getAddress());
    await token.waitForDeployment();
  });

  it("mints exactly one billion LQC with no mint or admin interface", async function () {
    assert.equal(await token.totalSupply(), ethers.parseUnits("1000000000", 18));
    assert.equal(token.interface.hasFunction("mint"), false);
    assert.equal(token.interface.hasFunction("owner"), false);
  });

  it("burns supply permanently", async function () {
    await (await token.burn(ethers.parseUnits("1", 18))).wait();
    assert.equal(await token.totalSupply(), ethers.parseUnits("999999999", 18));
  });

  it("enforces cliff and linear release to the fixed beneficiary", async function () {
    const block = await provider.getBlock("latest");
    const start = block.timestamp + 10;
    const artifact = load("token/LQCAllocationVault", "LQCAllocationVault");
    const allocation = ethers.parseUnits("120", 18);
    const vault = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner).deploy(
      await token.getAddress(), await beneficiary.getAddress(), start, 100, 200, allocation
    );
    await vault.waitForDeployment();
    await (await token.transfer(await vault.getAddress(), allocation)).wait();
    await assert.rejects(vault.release());
    await rpc.request({ method: "evm_increaseTime", params: [220] });
    await rpc.request({ method: "evm_mine", params: [] });
    const receipt = await (await vault.release({ gasLimit: 100000 })).wait();
    const releaseBlock = await rpc.request({
      method: "eth_getBlockByNumber",
      params: [ethers.toQuantity(receipt.blockNumber), false]
    });
    const expected = await vault.vestedAmount(Number.parseInt(releaseBlock.timestamp, 16));
    const received = await token.balanceOf(await beneficiary.getAddress());
    assert.equal(received, expected);
    assert(received > 0n && received < allocation);
  });
});
