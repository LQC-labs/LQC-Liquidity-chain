import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { ethers } from "ethers";

const source = fs.readFileSync(new URL("../app/router-sdk.js", import.meta.url), "utf8");
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const sdk = context.globalThis.LQCRouterSDK;

describe("LQC Router browser SDK", function () {
  const tokenA = "0x0000000000000000000000000000000000000001";
  const tokenB = "0x0000000000000000000000000000000000000002";
  const tokenC = "0x0000000000000000000000000000000000000003";

  it("encodes V2 and approved V3 direct or multi-hop routes", function () {
    const v2 = sdk.encodeRoute({ kind: "v2" }, [tokenA, tokenB], ethers);
    assert.deepEqual(Array.from(ethers.AbiCoder.defaultAbiCoder().decode(["address[]"], v2)[0]), [tokenA, tokenB]);
    const dex = { kind: "v3", pools: [
      { tokenA, tokenB, fee: 500 }, { tokenA: tokenB, tokenB: tokenC, fee: 2500 }
    ] };
    assert.equal(
      sdk.encodeRoute(dex, [tokenA, tokenB, tokenC], ethers),
      ethers.solidityPacked(["address", "uint24", "address", "uint24", "address"], [tokenA, 500, tokenB, 2500, tokenC])
    );
  });

  it("rejects unapproved V3 pools, excessive hops, and excessive slippage", function () {
    assert.throws(() => sdk.encodeRoute({ kind: "v3", pools: [] }, [tokenA, tokenB], ethers));
    assert.throws(() => sdk.encodeRoute({ kind: "v2" }, [tokenA, tokenB, tokenC, tokenA, tokenB], ethers));
    assert.throws(() => sdk.minimumAmountOut(100n, 20.01));
    assert.equal(sdk.minimumAmountOut(10000n, 1), 9900n);
  });

  it("calculates price impact and configured gas cost without floating-point loss", function () {
    assert.equal(sdk.priceImpactBps(1000n, 970n, 10n, 10n), 300);
    assert.equal(sdk.priceImpactBps(1000n, 1010n, 10n, 10n), 0);
    assert.equal(sdk.priceImpactFromExpected(950n, 1000n), 500);
    assert.equal(sdk.priceImpactFromExpected(1001n, 1000n), 0);
    assert.equal(sdk.estimatedGasWei({ gasUnits: 250000 }, 3_000_000_000n), 750_000_000_000_000n);
    assert.equal(sdk.routeFeeBps({ kind: "v2", feeBps: 30 }, [tokenA, tokenB]), 30);
    assert.equal(sdk.routeFeeBps({ kind: "v3", pools: [{ tokenA, tokenB, fee: 500 }] }, [tokenA, tokenB]), 5);
    assert.throws(() => sdk.priceImpactBps(0n, 1n, 1n, 1n));
    assert.throws(() => sdk.priceImpactFromExpected(1n, 0n));
  });

  it("summarizes only active split routes as deterministic percentages", function () {
    const dexes = [{ name: "A" }, { name: "B" }, { name: "C" }];
    assert.deepEqual(
      sdk.summarizeSplit(dexes, [600n, 0n, 400n], 1000n).map(({ dex, percent }) => [dex.name, percent]),
      [["A", 60], ["C", 40]]
    );
    assert.throws(() => sdk.summarizeSplit(dexes, [1n], 1n));
  });

  it("selects split routing only when its gas-adjusted net output is higher", function () {
    assert.equal(sdk.isSplitNetBetter(1000n, 20n, 981n), true);
    assert.equal(sdk.isSplitNetBetter(1000n, 20n, 980n), false);
    assert.equal(sdk.isSplitNetBetter(10n, 20n, 1n), true);
    assert.throws(() => sdk.isSplitNetBetter(1n, -1n, 1n));
  });
  it("turns wallet, liquidity, slippage, and risk failures into actionable Korean guidance", function () {
    assert.deepEqual(
      { ...sdk.explainSwapError({ code: "ACTION_REJECTED" }) },
      { code: "USER_REJECTED", message: "지갑에서 거래가 취소되었습니다.", action: "원하시면 견적을 다시 확인한 뒤 재시도하세요.", retryable: true }
    );
    assert.equal(sdk.explainSwapError({ message: "execution reverted: NoValidQuote()" }).code, "NO_ROUTE");
    assert.equal(sdk.explainSwapError({ message: "execution reverted: InsufficientOutput()" }).code, "PRICE_MOVED");
    assert.equal(sdk.explainSwapError({ message: "daily cap exceeded" }).retryable, false);
    assert.equal(sdk.explainSwapError({ message: "RouteChangedDuringApproval" }).code, "ROUTE_CHANGED");
    assert.equal(sdk.explainSwapError({ message: "QuoteWorsenedDuringApproval" }).code, "QUOTE_WORSENED");
    assert.equal(sdk.explainSwapError({ message: "WalletContextChanged" }).code, "WALLET_CHANGED");
  });

  it("ranks executable primary and fallback routes by net output and priority", function () {
    const ranked = sdk.rankRouteQuotes([
      { name: "A", amountOut: 1000n, cost: 30n, priority: 2 },
      { name: "B", amountOut: 990n, cost: 10n, priority: 1 },
      { name: "C", amountOut: 980n, cost: 0n, priority: 3 },
      null
    ]);
    assert.deepEqual(ranked.map(item => item.name), ["C", "B", "A"]);
    assert.equal(ranked[0].netAmountOut, 980n);
    assert.equal(ranked[0].amountOut, 980n);
    assert.deepEqual(sdk.rankRouteQuotes([{ name: "zero", amountOut: 0n }]), []);
  });

  it("prefers a lower gross quote when it delivers more after route gas", function () {
    const expensive = { name: "High output", dexId: "0x01", routeData: "0xaa", amountOut: 1_010n, cost: 50n, priority: 10 };
    const efficient = { name: "Efficient", dexId: "0x02", routeData: "0xbb", amountOut: 1_000n, cost: 10n, priority: 1 };
    const ranked = sdk.rankRouteQuotes([expensive, efficient]);
    assert.equal(ranked[0].name, "Efficient");
    assert.equal(ranked[0].dexId, "0x02");
    assert.equal(ranked[0].routeData, "0xbb");
    assert.equal(ranked[0].netAmountOut, 990n);
  });

  it("restores a remembered wallet only when an account and the expected chain are present", function () {
    assert.equal(sdk.walletSessionState([], true, "0x61", "0x61"), "disconnected");
    assert.equal(sdk.walletSessionState([tokenA], false, "0x61", "0x61"), "disconnected");
    assert.equal(sdk.walletSessionState([tokenA], true, "0x1", "0x61"), "wrong_network");
    assert.equal(sdk.walletSessionState([tokenA], true, "0x61", "0x61"), "connected");
  });

  it("requires approval only when the selected spender allowance is insufficient", function () {
    assert.equal(sdk.requiresTokenApproval(99n, 100n), true);
    assert.equal(sdk.requiresTokenApproval(100n, 100n), false);
    assert.equal(sdk.requiresTokenApproval(101n, 100n), false);
    assert.deepEqual(Array.from(sdk.tokenApprovalSequence(0n, 100n)), [100n]);
    assert.deepEqual(Array.from(sdk.tokenApprovalSequence(40n, 100n)), [0n, 100n]);
    assert.deepEqual(Array.from(sdk.tokenApprovalSequence(100n, 100n)), []);
    assert.equal(sdk.isRefreshedOutputAcceptable(1000n, 990n, 1), true);
    assert.equal(sdk.isRefreshedOutputAcceptable(1000n, 989n, 1), false);
    assert.equal(sdk.executionContextMatches(tokenA, [tokenA], "0x61", "0x61"), true);
    assert.equal(sdk.executionContextMatches(tokenA, [tokenB], "0x61", "0x61"), false);
    assert.equal(sdk.executionContextMatches(tokenA, [tokenA], "0x61", "0x1"), false);
    assert.equal(sdk.executionContextMatches(tokenA, [], "0x61", "0x61"), false);
    assert.throws(() => sdk.isRefreshedOutputAcceptable(0n, 100n, 1));
    assert.throws(() => sdk.tokenApprovalSequence(-1n, 100n));
    assert.throws(() => sdk.requiresTokenApproval(-1n, 100n));
    assert.throws(() => sdk.requiresTokenApproval(100n, 0n));
  });

  it("detects execution-route changes while a token approval is pending", function () {
    const single = { kind: "single", single: { best: { dexId: "0xA1" }, routeData: "0x1234" } };
    assert.equal(sdk.executionPlanFingerprint(single), "single:0xa1:0x1234");
    assert.notEqual(
      sdk.executionPlanFingerprint(single),
      sdk.executionPlanFingerprint({ kind: "single", single: { best: { dexId: "0xB2" }, routeData: "0x1234" } })
    );
    const split = {
      kind: "split",
      split: { dexIds: ["0xA1", "0xB2", "0xC3"], amountsIn: [60n, 0n, 40n] },
      routes: ["0x11", "0x22", "0x33"]
    };
    assert.equal(sdk.executionPlanFingerprint(split), "split:0xa1:60:0x11|0xc3:40:0x33");
    assert.equal(sdk.executionPlanFingerprint({ kind: "split", split: {}, routes: [] }), "");
    assert.throws(() => sdk.executionPlanFingerprint({ kind: "unknown" }));
  });

});
