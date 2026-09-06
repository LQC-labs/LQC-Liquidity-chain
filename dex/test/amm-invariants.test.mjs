import assert from "node:assert/strict";
import fs from "node:fs";
import ganache from "ganache";
import { ethers } from "ethers";

const artifact = (name, source = name) => JSON.parse(
  fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${name}.json`, import.meta.url))
);

function deterministicGenerator(seed = 0x4c5143n) {
  let state = seed;
  return (maximum) => {
    state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    return state % maximum;
  };
}

describe("LQC Flow AMM stateful invariants", function () {
  let provider, owner, trader, factory, router, tokenA, tokenB, pair;

  beforeEach(async function () {
    const eip1193 = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 3 } });
    provider = new ethers.BrowserProvider(eip1193);
    owner = await provider.getSigner(0);
    trader = await provider.getSigner(1);

    const Factory = new ethers.ContractFactory(
      artifact("LQCFlowFactory").abi, artifact("LQCFlowFactory").bytecode, owner
    );
    factory = await Factory.deploy(await owner.getAddress());

    const tokenArtifact = artifact("MockERC20", "mocks/MockERC20");
    const Token = new ethers.ContractFactory(tokenArtifact.abi, tokenArtifact.bytecode, owner);
    tokenA = await Token.deploy("Invariant A", "INVA");
    tokenB = await Token.deploy("Invariant B", "INVB");

    const WBNB = new ethers.ContractFactory(
      artifact("MockWBNB", "mocks/MockWBNB").abi,
      artifact("MockWBNB", "mocks/MockWBNB").bytecode,
      owner
    );
    const wbnb = await WBNB.deploy();
    await Promise.all([factory.waitForDeployment(), tokenA.waitForDeployment(), tokenB.waitForDeployment(), wbnb.waitForDeployment()]);

    const Router = new ethers.ContractFactory(
      artifact("LQCFlowRouter").abi, artifact("LQCFlowRouter").bytecode, owner
    );
    router = await Router.deploy(await factory.getAddress(), await wbnb.getAddress());
    await router.waitForDeployment();

    const ownerAddress = await owner.getAddress();
    const traderAddress = await trader.getAddress();
    const routerAddress = await router.getAddress();
    for (const token of [tokenA, tokenB]) {
      await (await token.mint(ownerAddress, ethers.parseEther("1000000"))).wait();
      await (await token.mint(traderAddress, ethers.parseEther("50000"))).wait();
      await (await token.approve(routerAddress, ethers.MaxUint256)).wait();
      await (await token.connect(trader).approve(routerAddress, ethers.MaxUint256)).wait();
    }

    const deadline = BigInt((await provider.getBlock("latest")).timestamp + 3600);
    await (await router.addLiquidity(
      await tokenA.getAddress(), await tokenB.getAddress(),
      ethers.parseEther("250000"), ethers.parseEther("250000"), 0, 0,
      ownerAddress, deadline
    )).wait();
    const pairAddress = await factory.getPair(await tokenA.getAddress(), await tokenB.getAddress());
    pair = new ethers.Contract(pairAddress, artifact("LQCFlowPair").abi, owner);
  });

  it("preserves reserves, balances, supply, and non-decreasing k through deterministic randomized swaps", async function () {
    const random = deterministicGenerator();
    const traderAddress = await trader.getAddress();
    const routerAddress = await router.getAddress();
    const token0Address = await pair.token0();
    const token0 = token0Address.toLowerCase() === (await tokenA.getAddress()).toLowerCase() ? tokenA : tokenB;
    const token1 = token0 === tokenA ? tokenB : tokenA;
    const supplyA = await tokenA.totalSupply();
    const supplyB = await tokenB.totalSupply();

    let [reserve0, reserve1] = await pair.getReserves();
    let previousK = reserve0 * reserve1;

    for (let step = 0; step < 40; step += 1) {
      const zeroToOne = random(2n) === 0n;
      const input = zeroToOne ? token0 : token1;
      const output = zeroToOne ? token1 : token0;
      const amountIn = ethers.parseEther((1n + random(50n)).toString());
      const path = [await input.getAddress(), await output.getAddress()];
      const quoted = await router.getAmountsOut(amountIn, path);
      assert(quoted[1] > 0n, `step ${step}: quote must be positive`);

      const outputBefore = await output.balanceOf(traderAddress);
      const deadline = BigInt((await provider.getBlock("latest")).timestamp + 3600);
      await (await router.connect(trader).swapExactTokensForTokens(
        amountIn, quoted[1], path, traderAddress, deadline
      )).wait();
      assert.equal(await output.balanceOf(traderAddress) - outputBefore, quoted[1]);

      [reserve0, reserve1] = await pair.getReserves();
      assert.equal(reserve0, await token0.balanceOf(await pair.getAddress()), `step ${step}: reserve0 mismatch`);
      assert.equal(reserve1, await token1.balanceOf(await pair.getAddress()), `step ${step}: reserve1 mismatch`);
      const currentK = reserve0 * reserve1;
      assert(currentK >= previousK, `step ${step}: constant product decreased`);
      previousK = currentK;

      assert.equal(await tokenA.totalSupply(), supplyA);
      assert.equal(await tokenB.totalSupply(), supplyB);
      assert.equal(await tokenA.balanceOf(routerAddress), 0n);
      assert.equal(await tokenB.balanceOf(routerAddress), 0n);
    }
  });

  it("keeps fee-adjusted output quotes inside the constant-product boundary", async function () {
    const random = deterministicGenerator(0x53414645n);
    const feeDenominator = 10_000n;
    const feeMultiplier = 9_970n;

    for (let sample = 0; sample < 128; sample += 1) {
      const reserveIn = ethers.parseEther((1_000n + random(1_000_000n)).toString());
      const reserveOut = ethers.parseEther((1_000n + random(1_000_000n)).toString());
      const amountIn = ethers.parseEther((1n + random(10_000n)).toString());
      const amountOut = await router.getAmountOut(amountIn, reserveIn, reserveOut);

      assert(amountOut > 0n && amountOut < reserveOut);
      const adjustedIn = (reserveIn + amountIn) * feeDenominator - amountIn * 30n;
      const adjustedOut = (reserveOut - amountOut) * feeDenominator;
      assert(adjustedIn * adjustedOut >= reserveIn * reserveOut * feeDenominator ** 2n);

      const reference = amountIn * feeMultiplier * reserveOut
        / (reserveIn * feeDenominator + amountIn * feeMultiplier);
      assert.equal(amountOut, reference);
    }
  });
});
