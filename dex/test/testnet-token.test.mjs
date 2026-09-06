import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = JSON.parse(fs.readFileSync(new URL("../artifacts/contracts/testnet/LQCTestToken.sol/LQCTestToken.json", import.meta.url)));

describe("LQC controlled testnet token", function () {
  it("allows only its owner to mint test liquidity", async function () {
    const provider = new ethers.BrowserProvider(ganache.provider({ logging: { quiet: true } }));
    const owner = await provider.getSigner(0);
    const other = await provider.getSigner(1);
    const token = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, owner).deploy(
      "LQC Test Token", "LQC", 18, await owner.getAddress()
    );
    await token.waitForDeployment();
    await (await token.mint(await owner.getAddress(), ethers.parseEther("1000"))).wait();
    assert.equal(await token.totalSupply(), ethers.parseEther("1000"));
    await assert.rejects(token.connect(other).mint(await other.getAddress(), 1n));
  });
});
