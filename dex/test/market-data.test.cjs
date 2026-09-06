const assert = require("node:assert/strict");
const { buildOhlcvUrl, normalizeOhlcv, marketSummary } = require("../app/market-data.js");

describe("LQC market data", function () {
  const poolAddress = "0x0000000000000000000000000000000000000010";

  it("builds a bounded GeckoTerminal OHLCV request", function () {
    const url = new URL(buildOhlcvUrl({ network: "bsc", poolAddress }, "15m", 500));
    assert.equal(url.pathname, `/api/v2/networks/bsc/pools/${poolAddress}/ohlcv/minute`);
    assert.equal(url.searchParams.get("aggregate"), "15");
    assert.equal(url.searchParams.get("limit"), "200");
    assert.equal(url.searchParams.get("currency"), "token");
    assert.equal(url.searchParams.get("token"), "base");
  });

  it("rejects unsupported periods and unverified pool addresses", function () {
    assert.throws(() => buildOhlcvUrl({ network: "bsc", poolAddress: "" }, "15m"));
    assert.throws(() => buildOhlcvUrl({ network: "bsc", poolAddress }, "7m"));
    assert.throws(() => buildOhlcvUrl({ network: "bsc", poolAddress, tokenSide: "wrong" }, "15m"));
  });

  it("normalizes descending OHLCV rows into chronological candles", function () {
    const candles = normalizeOhlcv({ data: { attributes: { ohlcv_list: [
      [200, 2, 4, 1, 3, 20], [100, 1, 3, 0.5, 2, 10]
    ] } } });
    assert.deepEqual(candles.map((item) => item.timestamp), [100, 200]);
    assert.equal(candles[1].close, 3);
  });

  it("marks old observations stale and calculates period change", function () {
    const candles = normalizeOhlcv({ data: { attributes: { ohlcv_list: [
      [100, 1, 1.2, 0.9, 1.1, 10], [200, 1.1, 1.3, 1, 1.2, 20]
    ] } } });
    const summary = marketSummary(candles, "1m", 1000);
    assert.equal(summary.price, 1.2);
    assert.equal(Math.round(summary.changePercent), 20);
    assert.equal(summary.stale, true);
  });
});
