import assert from "node:assert/strict";
import { buildTradePreflightReport, parseTradePolicy } from "../scripts/preflight-trade.mjs";

describe("read-only trade preflight", function () {
  it("applies a bounded slippage and gas-price policy", function () {
    const policy = parseTradePolicy({ TRADE_SLIPPAGE_BPS: "75", TRADE_MAX_GAS_PRICE_GWEI: "12" });
    assert.deepEqual(policy, { slippageBps: 75, minimumOutputBps: 9925, maxGasPriceGwei: 12 });
  });

  it("rejects unsafe policy values", function () {
    assert.throws(() => parseTradePolicy({ TRADE_SLIPPAGE_BPS: "0" }), /TRADE_SLIPPAGE_BPS/);
    assert.throws(() => parseTradePolicy({ TRADE_SLIPPAGE_BPS: "1001" }), /TRADE_SLIPPAGE_BPS/);
    assert.throws(() => parseTradePolicy({ TRADE_MAX_GAS_PRICE_GWEI: "0" }), /TRADE_MAX_GAS_PRICE_GWEI/);
  });

  it("produces evidence without a transaction submission", function () {
    const report = buildTradePreflightReport({
      chainId: 97,
      deploymentPath: "deployments/bsc-testnet-97.json",
      policy: { slippageBps: 100, minimumOutputBps: 9900, maxGasPriceGwei: 50 },
      feeData: { gasPrice: 1000000000n },
      quotes: [{ dexId: "0x" + "11".repeat(32), dexName: "LQC Flow", tokenIn: "0x0000000000000000000000000000000000000001", tokenOut: "0x0000000000000000000000000000000000000002", amountInRaw: "1000", amountOutRaw: "2000" }]
    });
    assert.equal(report.mode, "read-only");
    assert.equal(report.quotes[0].minimumOutputRaw, "1980");
    assert.equal(report.quoteResponse.type, "LQC_QUOTE_RESPONSE");
    assert.equal(report.quoteResponse.quotes[0].minimumOutputRaw, "1980");
    assert.equal(report.transactionSubmitted, false);
  });
});
