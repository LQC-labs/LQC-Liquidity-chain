import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source) => JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url)));

describe("LQC Router risk registry", function () {
  let eip1193, provider, owner, riskAdmin, outsider, risk, tokenIn, tokenOut, dexId;
  beforeEach(async function () {
    eip1193 = ganache.provider({ logging: { quiet: true } });
    provider = new ethers.BrowserProvider(eip1193);
    owner = await provider.getSigner(0); riskAdmin = await provider.getSigner(1); outsider = await provider.getSigner(2);
    const Token = new ethers.ContractFactory(artifact("MockERC20", "mocks/MockERC20").abi, artifact("MockERC20", "mocks/MockERC20").bytecode, owner);
    tokenIn = await Token.deploy("Input", "IN"); tokenOut = await Token.deploy("Output", "OUT");
    const Risk = new ethers.ContractFactory(artifact("LQCRiskRegistry", "router-v2/LQCRiskRegistry").abi, artifact("LQCRiskRegistry", "router-v2/LQCRiskRegistry").bytecode, owner);
    risk = await Risk.deploy(await owner.getAddress(), await riskAdmin.getAddress());
    await Promise.all([tokenIn.waitForDeployment(), tokenOut.waitForDeployment(), risk.waitForDeployment()]);
    await (await risk.setExecutor(await owner.getAddress())).wait();
    dexId = ethers.id("LQC_FLOW");
  });

  it("enforces token, DEX, per-transaction, and daily caps", async function () {
    const input = await tokenIn.getAddress(), output = await tokenOut.getAddress();
    await (await risk.setTokenLimits(input, true, 100n, 150n)).wait();
    await (await risk.setTokenLimits(output, true, 1000n, 1000n)).wait();
    await (await risk.setDexTokenCap(dexId, input, 80n)).wait();
    await (await risk.consumeSwap(input, output, [dexId], [70n])).wait();
    await assert.rejects(risk.consumeSwap(input, output, [dexId], [81n]));
    await (await risk.consumeSwap(input, output, [dexId], [80n])).wait();
    await assert.rejects(risk.consumeSwap(input, output, [dexId], [1n]));
    await assert.rejects(risk.connect(outsider).consumeSwap(input, output, [dexId], [1n]));
  });

  it("allows the risk multisig to reduce but never expand limits", async function () {
    const input = await tokenIn.getAddress();
    await (await risk.setTokenLimits(input, true, 100n, 1000n)).wait();
    await assert.rejects(risk.connect(riskAdmin).reduceLimits(input, 101n, 1000n));
    await assert.rejects(risk.connect(outsider).reduceLimits(input, 50n, 500n));
    await (await risk.connect(riskAdmin).reduceLimits(input, 50n, 500n)).wait();
    const limits = await risk.tokenLimits(input);
    assert.equal(limits.maxPerTransaction, 50n); assert.equal(limits.maxPerDay, 500n);
  });

  it("rejects duplicate DEX legs so a split cannot bypass a per-DEX cap", async function () {
    const input = await tokenIn.getAddress(), output = await tokenOut.getAddress();
    await (await risk.setTokenLimits(input, true, 200n, 1000n)).wait();
    await (await risk.setTokenLimits(output, true, 1000n, 1000n)).wait();
    await (await risk.setDexTokenCap(dexId, input, 100n)).wait();

    await assert.rejects(risk.consumeSwap(input, output, [dexId, dexId], [60n, 60n]));
    const usage = await risk.dailyUsage(input);
    assert.equal(usage.amount, 0n);
  });

  it("allows the risk multisig to tighten but never create or expand a DEX cap", async function () {
    const input = await tokenIn.getAddress();
    await (await risk.setDexTokenCap(dexId, input, 100n)).wait();

    await assert.rejects(risk.connect(outsider).reduceDexTokenCap(dexId, input, 50n));
    await assert.rejects(risk.connect(riskAdmin).reduceDexTokenCap(dexId, input, 101n));
    await assert.rejects(risk.connect(riskAdmin).reduceDexTokenCap(ethers.id("UNKNOWN"), input, 1n));
    await (await risk.connect(riskAdmin).reduceDexTokenCap(dexId, input, 40n)).wait();
    assert.equal(await risk.dexTokenCap(dexId, input), 40n);
  });

  it("preserves the daily-cap accounting invariant across deterministic fuzzed route sets", async function () {
    const input = await tokenIn.getAddress(), output = await tokenOut.getAddress();
    const dexIds = [ethers.id("FUZZ_A"), ethers.id("FUZZ_B"), ethers.id("FUZZ_C")];
    const dexCaps = [70n, 90n, 110n];
    await (await risk.setTokenLimits(input, true, 180n, 700n)).wait();
    await (await risk.setTokenLimits(output, true, 1000n, 1000n)).wait();
    for (let i = 0; i < dexIds.length; ++i) {
      await (await risk.setDexTokenCap(dexIds[i], input, dexCaps[i])).wait();
    }

    let seed = 0x5eed1234;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed;
    };
    let expectedDailyUsage = 0n;
    for (let sample = 0; sample < 24; ++sample) {
      const routeCount = 1 + (random() % 3);
      const ids = dexIds.slice(0, routeCount);
      const amounts = ids.map((_, i) => BigInt(1 + (random() % 125)));
      const total = amounts.reduce((sum, amount) => sum + amount, 0n);
      const withinDexCaps = amounts.every((amount, i) => amount <= dexCaps[i]);
      const accepted = withinDexCaps && total <= 180n && expectedDailyUsage + total <= 700n;

      if (accepted) {
        await (await risk.consumeSwap(input, output, ids, amounts)).wait();
        expectedDailyUsage += total;
      } else {
        await assert.rejects(risk.consumeSwap(input, output, ids, amounts));
      }
      const usage = await risk.dailyUsage(input);
      assert.equal(usage.amount, expectedDailyUsage);
    }
  });

  it("resets daily usage on the next UTC day bucket", async function () {
    const input = await tokenIn.getAddress(), output = await tokenOut.getAddress();
    await (await risk.setTokenLimits(input, true, 100n, 100n)).wait();
    await (await risk.setTokenLimits(output, true, 100n, 100n)).wait();
    await (await risk.setDexTokenCap(dexId, input, 100n)).wait();
    await (await risk.consumeSwap(input, output, [dexId], [100n])).wait();
    await assert.rejects(risk.consumeSwap(input, output, [dexId], [1n]));
    await eip1193.request({ method: "evm_increaseTime", params: [86401] });
    await eip1193.request({ method: "evm_mine", params: [] });
    await (await risk.consumeSwap(input, output, [dexId], [100n])).wait();
  });

  it("blocks new swaps during a module pause and restricts recovery to governance", async function () {
    const input = await tokenIn.getAddress(), output = await tokenOut.getAddress();
    await (await risk.setTokenLimits(input, true, 100n, 100n)).wait();
    await (await risk.setTokenLimits(output, true, 100n, 100n)).wait();
    await (await risk.setDexTokenCap(dexId, input, 100n)).wait();
    await (await risk.connect(riskAdmin).pauseSwaps()).wait();
    await assert.rejects(risk.consumeSwap(input, output, [dexId], [1n]));
    await assert.rejects(risk.connect(riskAdmin).resumeSwaps());
    await (await risk.resumeSwaps()).wait();
    assert.equal(await risk.swapsPaused(), false);
    await (await risk.consumeSwap(input, output, [dexId], [1n], { gasLimit: 500000n })).wait();
  });
});
