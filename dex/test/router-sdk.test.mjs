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
    assert.equal(sdk.estimatedGasWei({ gasUnits: 250000 }, 3_000_000_000n), 750_000_000_000_000n);
    assert.equal(sdk.routeFeeBps({ kind: "v2", feeBps: 30 }, [tokenA, tokenB]), 30);
    assert.equal(sdk.routeFeeBps({ kind: "v3", pools: [{ tokenA, tokenB, fee: 500 }] }, [tokenA, tokenB]), 5);
    assert.throws(() => sdk.priceImpactBps(0n, 1n, 1n, 1n));
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

  it("reports honest net receipt and savings against the baseline route", function () {
    assert.deepEqual(
      { ...sdk.netQuoteSummary(1100n, 40n, 1050n, 30n) },
      { netAmountOut: 1060n, baselineNetAmountOut: 1020n, savings: 40n }
    );
    assert.equal(sdk.netQuoteSummary(100n, 200n, 50n, 0n).netAmountOut, 0n);
    assert.throws(() => sdk.netQuoteSummary(1n, -1n, 1n, 0n));
  });

  it("blocks unsafe trades and distinguishes non-blocking warnings", function () {
    const ready = sdk.tradeReadiness({ connected: true, deployed: true, hasRoute: true, amountIn: 10n, balanceIn: 20n, priceImpactBps: 20 });
    assert.equal(ready.ready, true);
    assert.deepEqual(Array.from(ready.blockers), []);
    assert.deepEqual(Array.from(ready.warnings), []);
    const warning = sdk.tradeReadiness({ connected: true, deployed: true, hasRoute: true, amountIn: 10n, balanceIn: 20n, priceImpactBps: 300, quoteAgeMs: 16000 });
    assert.equal(warning.ready, true);
    assert.deepEqual(Array.from(warning.warnings), ["HIGH_PRICE_IMPACT", "QUOTE_AGING"]);
    const blocked = sdk.tradeReadiness({ connected: false, deployed: true, hasRoute: true, amountIn: 21n, balanceIn: 20n, priceImpactBps: 500 });
    assert.equal(blocked.ready, false);
    assert.deepEqual(Array.from(blocked.blockers), ["WALLET_NOT_CONNECTED", "INSUFFICIENT_BALANCE", "PRICE_IMPACT_TOO_HIGH"]);
  });

  it("enables gas sponsorship only inside a complete bounded Paymaster policy", function () {
    const policy = { enabled: true, paymasterAddress: tokenA, bundlerUrl: "https://bundler.test", sponsoredSymbols: ["LQC"], maxInputRaw: "1000", maxSponsoredGasWei: "100" };
    assert.equal(sdk.gaslessEligibility(policy, "LQC", 500n, 50n).eligible, true);
    assert.equal(sdk.gaslessEligibility(policy, "USDT", 500n, 50n).reason, "TOKEN_NOT_SPONSORED");
    assert.equal(sdk.gaslessEligibility(policy, "LQC", 1001n, 50n).reason, "SPONSOR_INPUT_LIMIT");
    assert.equal(sdk.gaslessEligibility(policy, "LQC", 500n, 101n).reason, "SPONSOR_GAS_LIMIT");
    assert.equal(sdk.gaslessEligibility({ ...policy, paymasterAddress: "" }, "LQC", 1n, 1n).reason, "PAYMASTER_UNAVAILABLE");
    assert.equal(sdk.gaslessEligibility({ enabled: false }, "LQC", 1n, 1n).reason, "GASLESS_DISABLED");
  });
});
