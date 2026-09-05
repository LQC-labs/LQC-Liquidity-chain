import assert from "node:assert/strict";
import { ethers } from "ethers";
import { findOptimalRoute, generateCandidatePaths } from "../sdk/route-optimizer.mjs";

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
});
