import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { ethers } from "ethers";

const source = fs.readFileSync(new URL("../app/router-sdk.js", import.meta.url), "utf8");
const context = vm.createContext({ console });
vm.runInContext(source, context, { filename: "lqc-router-sdk.js" });
const sdk = context.LQCRouterSDK;
const tokenIn = "0x00000000000000000000000000000000000000a1";
const tokenOut = "0x00000000000000000000000000000000000000b1";

function generator(seed = 0x51c0ffee) {
  let state = seed >>> 0;
  return (minimum, maximum) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return minimum + state % (maximum - minimum + 1);
  };
}

describe("LQC execution-proof deterministic invariants", function () {
  it("preserves best-route and minimum-output invariants across 250 settlements", function () {
    const random = generator(), dexA = ethers.id("DEX_A"), dexB = ethers.id("DEX_B");
    for (let index = 0; index < 250; index++) {
      const amountIn = BigInt(random(1_000, 1_000_000));
      const outputA = amountIn + BigInt(random(10, 10_000));
      const outputB = amountIn + BigInt(random(10, 10_000));
      const costA = BigInt(random(0, 500)), costB = BigInt(random(0, 500));
      const netA = outputA > costA ? outputA - costA : 0n;
      const netB = outputB > costB ? outputB - costB : 0n;
      const selected = netA >= netB ? { id: dexA, output: outputA, cost: costA } : { id: dexB, output: outputB, cost: costB };
      const minimum = selected.output * 99n / 100n;
      const proof = sdk.buildBestExecutionProof({ chainId: 97, quoteBlock: 10_000 + index,
        expiresAt: 1_900_000_000, tokenIn, tokenOut, amountIn, slippageBps: 100,
        candidates: [
          { dexId: dexA, name: "A", amountOut: outputA, cost: costA, routeDataHash: ethers.id(`a-${index}`) },
          { dexId: dexB, name: "B", amountOut: outputB, cost: costB, routeDataHash: ethers.id(`b-${index}`) }
        ], plan: { kind: "single", cost: selected.cost, legs: [{ dexId: selected.id,
          amountIn, expectedOut: selected.output, minimumOut: minimum }] } }, ethers);
      const actual = minimum + BigInt(random(0, Number(selected.output - minimum)));
      const receipt = sdk.buildSettlementReceipt(proof, { chainId: 97,
        transactionHash: ethers.id(`tx-${index}`), blockHash: ethers.id(`block-${index}`),
        blockNumber: 10_001 + index, settledAt: 1_899_999_999, recipient: tokenIn,
        actualAmountOut: actual, status: 1 }, ethers);
      assert.equal(sdk.verifyBestExecutionProof(proof, ethers), true);
      assert.equal(sdk.verifySettlementReceipt(receipt, proof, ethers), true);
      assert.ok(BigInt(receipt.actualAmountOut) >= BigInt(receipt.minimumAmountOut));
    }
  });

  it("rejects every deterministic mutation of proof-bound settlement fields", function () {
    const random = generator(0xdecafbad), dex = ethers.id("DEX");
    const proof = sdk.buildBestExecutionProof({ chainId: 97, quoteBlock: 20_000,
      expiresAt: 1_900_000_000, tokenIn, tokenOut, amountIn: 10_000n, slippageBps: 100,
      candidates: [{ dexId: dex, name: "DEX", amountOut: 11_000n, cost: 100n, routeDataHash: ethers.id("route") }],
      plan: { kind: "single", cost: 100n, legs: [{ dexId: dex, amountIn: 10_000n,
        expectedOut: 11_000n, minimumOut: 10_890n }] } }, ethers);
    const receipt = sdk.buildSettlementReceipt(proof, { chainId: 97, transactionHash: ethers.id("tx"),
      blockHash: ethers.id("block"), blockNumber: 20_001, settledAt: 1_899_999_999,
      recipient: tokenIn, actualAmountOut: 10_950n, status: 1 }, ethers);
    const fields = ["transactionHash", "blockHash", "blockNumber", "recipient", "actualAmountOut", "executionDeltaBps"];
    for (let index = 0; index < 250; index++) {
      const mutated = structuredClone(receipt), field = fields[random(0, fields.length - 1)];
      if (field === "transactionHash" || field === "blockHash") mutated[field] = ethers.id(`${field}-${index}`);
      else if (field === "recipient") mutated[field] = tokenOut;
      else if (field === "actualAmountOut") mutated[field] = String(BigInt(mutated[field]) + BigInt(index + 1));
      else mutated[field] = Number(mutated[field]) + index + 1;
      assert.equal(sdk.verifySettlementReceipt(mutated, proof, ethers), false);
    }
  });

  it("preserves split-plan binding across 250 deterministic execution refreshes", function () {
    const random = generator(0x2f10f00d), dexA = ethers.id("SPLIT_A"), dexB = ethers.id("SPLIT_B");
    for (let index = 0; index < 250; index++) {
      const amountIn = BigInt(random(10_000, 1_000_000)), inputA = amountIn * BigInt(random(20, 80)) / 100n,
        inputB = amountIn - inputA, outputA = inputA + BigInt(random(100, 1_000)),
        outputB = inputB + BigInt(random(100, 1_000)), minimumA = outputA * 99n / 100n,
        minimumB = outputB * 99n / 100n, fullA = amountIn + 100n, fullB = amountIn + 90n;
      const proof = sdk.buildBestExecutionProof({ chainId: 97, quoteBlock: 30_000 + index,
        expiresAt: 1_900_000_000, tokenIn, tokenOut, amountIn, slippageBps: 100,
        candidates: [
          { dexId: dexA, name: "A", amountOut: fullA, cost: 20n, routeDataHash: ethers.id(`split-a-${index}`) },
          { dexId: dexB, name: "B", amountOut: fullB, cost: 20n, routeDataHash: ethers.id(`split-b-${index}`) }
        ], plan: { kind: "split", cost: 30n, legs: [
          { dexId: dexA, amountIn: inputA, expectedOut: outputA, minimumOut: minimumA },
          { dexId: dexB, amountIn: inputB, expectedOut: outputB, minimumOut: minimumB }
        ] } }, ethers);
      const current = { chainId: 97, tokenIn, tokenOut, amountIn, kind: "split", legs: [
        { dexId: dexA, amountIn: inputA, expectedOut: minimumA + BigInt(random(0, Number(outputA - minimumA))) },
        { dexId: dexB, amountIn: inputB, expectedOut: minimumB + BigInt(random(0, Number(outputB - minimumB))) }
      ] };
      assert.equal(sdk.validateExecutionPlanProof(proof, current, ethers, proof.expiresAt).valid, true);
    }
  });

  it("rejects 250 deterministic route, allocation, output, trade, expiry, and proof mutations", function () {
    const random = generator(0xbad51eed), dexA = ethers.id("MUTATE_A"), dexB = ethers.id("MUTATE_B");
    const proof = sdk.buildBestExecutionProof({ chainId: 97, quoteBlock: 40_000, expiresAt: 1_900_000_000,
      tokenIn, tokenOut, amountIn: 10_000n, slippageBps: 100,
      candidates: [
        { dexId: dexA, name: "A", amountOut: 10_100n, cost: 20n, routeDataHash: ethers.id("mutate-a") },
        { dexId: dexB, name: "B", amountOut: 10_090n, cost: 20n, routeDataHash: ethers.id("mutate-b") }
      ], plan: { kind: "split", cost: 30n, legs: [
        { dexId: dexA, amountIn: 6_000n, expectedOut: 6_100n, minimumOut: 6_039n },
        { dexId: dexB, amountIn: 4_000n, expectedOut: 4_100n, minimumOut: 4_059n }
      ] } }, ethers);
    const base = { chainId: 97, tokenIn, tokenOut, amountIn: 10_000n, kind: "split", legs: [
      { dexId: dexA, amountIn: 6_000n, expectedOut: 6_039n },
      { dexId: dexB, amountIn: 4_000n, expectedOut: 4_059n }
    ] };
    for (let index = 0; index < 250; index++) {
      const current = structuredClone(base), mutation = random(0, 5);
      let candidateProof = proof, now = proof.expiresAt;
      if (mutation === 0) current.legs[0].dexId = ethers.id(`other-${index}`);
      if (mutation === 1) { current.legs[0].amountIn += 1n; current.legs[1].amountIn -= 1n; }
      if (mutation === 2) current.legs[1].expectedOut = 4_058n;
      if (mutation === 3) current.tokenOut = tokenIn;
      if (mutation === 4) now += index + 1;
      if (mutation === 5) { candidateProof = structuredClone(proof); candidateProof.plan.legs[0].minimumOut = "1"; }
      assert.throws(() => sdk.validateExecutionPlanProof(candidateProof, current, ethers, now));
    }
  });
});
