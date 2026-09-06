import assert from "node:assert/strict";
import { ethers } from "ethers";
import { findOptimalRoute, findOptimalTwoWaySplit, generateCandidatePaths } from "../sdk/route-optimizer.mjs";

const tokenIn = "0x0000000000000000000000000000000000000001";
const tokenOut = "0x0000000000000000000000000000000000000002";
const wbnb = "0x0000000000000000000000000000000000000003";
const stable = "0x0000000000000000000000000000000000000004";

describe("LQC route optimizer", function () {
  it("generates direct, one-hop, and cycle-free two-hop paths", function () {
    const paths = generateCandidatePaths({ tokenIn, tokenOut, connectorTokens: [wbnb, stable], maxIntermediates: 2 });
    assert.equal(paths.length, 5);
    assert.deepEqual(paths[0], [ethers.getAddress(tokenIn), ethers.getAddress(tokenOut)]);
    assert(paths.every((path) => new Set(path.map((item) => item.toLowerCase())).size === path.length));
  });

  it("selects the highest-output DEX and token path", async function () {
    const adapterA = {
      id: "DEX-A",
      address: "0x0000000000000000000000000000000000000010",
      encodeRouteData: (path) => path.join("->"),
      quoteExactInput: async (_in, _out, amount, _data, path) =>
        path.length === 3 && path[1].toLowerCase() === wbnb.toLowerCase() ? amount * 110n / 100n : amount * 90n / 100n
    };
    const adapterB = {
      id: "DEX-B",
      address: "0x0000000000000000000000000000000000000020",
      encodeRouteData: (path) => path.join("->"),
      quoteExactInput: async (_in, _out, amount, _data, path) => path.length === 2 ? amount : 0n
    };
    const result = await findOptimalRoute({
      tokenIn, tokenOut, amountIn: 10_000n, adapters: [adapterA, adapterB],
      connectorTokens: [wbnb, stable], maxIntermediates: 1, slippageBps: 50
    });
    assert.equal(result.adapterId, "DEX-A");
    assert.deepEqual(result.path, [ethers.getAddress(tokenIn), ethers.getAddress(wbnb), ethers.getAddress(tokenOut)]);
    assert.equal(result.amountOut, 11_000n);
    assert.equal(result.amountOutMin, 10_945n);
    assert.equal(result.execution.adapters.length, 1);
  });

  it("ignores failed or empty quotes and reports when no route is viable", async function () {
    const failing = {
      id: "offline",
      address: "0x0000000000000000000000000000000000000010",
      quoteExactInput: async () => { throw new Error("pool unavailable"); }
    };
    await assert.rejects(findOptimalRoute({ tokenIn, tokenOut, amountIn: 1n, adapters: [failing] }));
  });

  it("deduplicates connectors and caps combinatorial path growth", function () {
    const paths = generateCandidatePaths({ tokenIn, tokenOut, connectorTokens: [wbnb, wbnb, tokenIn], maxIntermediates: 1 });
    assert.equal(paths.length, 2);
    assert.throws(() => generateCandidatePaths({
      tokenIn, tokenOut,
      connectorTokens: [
        "0x0000000000000000000000000000000000000003",
        "0x0000000000000000000000000000000000000004",
        "0x0000000000000000000000000000000000000005"
      ],
      maxIntermediates: 2,
      maxPaths: 3
    }));
  });

  it("selects the best net route after output-denominated gas cost", async function () {
    const expensive = {
      id: "high-output-high-gas",
      address: "0x0000000000000000000000000000000000000010",
      quoteExactInput: async (_in, _out, amount) => amount + 100n,
      estimateGasCostInOutput: async () => 80n
    };
    const efficient = {
      id: "lower-output-low-gas",
      address: "0x0000000000000000000000000000000000000020",
      quoteExactInput: async (_in, _out, amount) => amount + 70n,
      estimateGasCostInOutput: async () => 10n
    };
    const result = await findOptimalRoute({ tokenIn, tokenOut, amountIn: 1000n, adapters: [expensive, efficient] });
    assert.equal(result.adapterId, "lower-output-low-gas");
    assert.equal(result.amountOut, 1070n);
    assert.equal(result.gasCostInOutput, 10n);
    assert.equal(result.netAmountOut, 1060n);
  });

  it("finds the best two-DEX split percentage automatically", async function () {
    const priceImpactQuote = async (amount) => amount - amount * amount / 20_000n;
    const result = await findOptimalTwoWaySplit({
      amountIn: 10_000n,
      stepBps: 1000,
      slippageBps: 100,
      routes: [
        { address: "0x0000000000000000000000000000000000000010", routeData: "0x01", quoteExactInput: priceImpactQuote },
        { address: "0x0000000000000000000000000000000000000020", routeData: "0x02", quoteExactInput: priceImpactQuote }
      ]
    });
    assert.deepEqual(result.allocationBps, [5000, 5000]);
    assert.deepEqual(result.amountsIn, [5000n, 5000n]);
    assert.equal(result.totalOut, 7500n);
    assert.equal(result.amountOutMin, 7425n);
  });

  it("subtracts both route gas costs when ranking a split", async function () {
    const result = await findOptimalTwoWaySplit({
      amountIn: 1000n,
      stepBps: 5000,
      routes: [
        { address: "0x0000000000000000000000000000000000000010", routeData: "0x01", quoteExactInput: async (amount) => amount, gasCostInOutput: 10n },
        { address: "0x0000000000000000000000000000000000000020", routeData: "0x02", quoteExactInput: async (amount) => amount, gasCostInOutput: 20n }
      ]
    });
    assert.equal(result.totalOut, 1000n);
    assert.equal(result.gasCostInOutput, 30n);
    assert.equal(result.netAmountOut, 970n);
  });
});
