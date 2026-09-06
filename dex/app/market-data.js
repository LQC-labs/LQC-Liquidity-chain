(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.LQCMarketData = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const PERIODS = Object.freeze({
    "1m": { timeframe: "minute", aggregate: 1, staleAfterSeconds: 300 },
    "15m": { timeframe: "minute", aggregate: 15, staleAfterSeconds: 1800 },
    "1h": { timeframe: "hour", aggregate: 1, staleAfterSeconds: 7200 },
    "4h": { timeframe: "hour", aggregate: 4, staleAfterSeconds: 21600 },
    "1d": { timeframe: "day", aggregate: 1, staleAfterSeconds: 93600 }
  });

  function isAddress(value) {
    return /^0x[0-9a-fA-F]{40}$/.test(value || "");
  }

  function buildOhlcvUrl({ network, poolAddress, tokenSide = "base" }, period, limit = 100) {
    const selected = PERIODS[period];
    if (!selected) throw new Error("Unsupported market-data period.");
    if (!/^[a-z0-9_-]+$/i.test(network || "")) throw new Error("Invalid market-data network.");
    if (!isAddress(poolAddress)) throw new Error("A verified pool address is required for live market data.");
    if (!["base", "quote"].includes(tokenSide)) throw new Error("Invalid market-data token side.");
    const query = new URLSearchParams({
      aggregate: String(selected.aggregate), limit: String(Math.min(Math.max(limit, 20), 200)),
      currency: "token", token: tokenSide
    });
    return `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolAddress}/ohlcv/${selected.timeframe}?${query}`;
  }

  function normalizeOhlcv(payload) {
    const rows = payload?.data?.attributes?.ohlcv_list;
    if (!Array.isArray(rows)) throw new Error("Market-data response is missing OHLCV rows.");
    const candles = rows.map((row) => {
      if (!Array.isArray(row) || row.length < 6) throw new Error("Market-data row is malformed.");
      const [timestamp, open, high, low, close, volume] = row.map(Number);
      if (![timestamp, open, high, low, close, volume].every(Number.isFinite)) throw new Error("Market-data row contains invalid values.");
      if (timestamp <= 0 || open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0 || high < low) {
        throw new Error("Market-data row is outside accepted bounds.");
      }
      return { timestamp, open, high, low, close, volume };
    }).sort((a, b) => a.timestamp - b.timestamp);
    if (candles.length < 2) throw new Error("Insufficient market history.");
    return candles;
  }

  function marketSummary(candles, period, nowSeconds = Date.now() / 1000) {
    const latest = candles[candles.length - 1];
    const first = candles[0];
    return {
      price: latest.close,
      changePercent: first.open > 0 ? ((latest.close - first.open) / first.open) * 100 : null,
      updatedAt: latest.timestamp,
      stale: nowSeconds - latest.timestamp > (PERIODS[period]?.staleAfterSeconds || 300)
    };
  }

  async function fetchOhlcv(config, period, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 8000);
    try {
      const response = await (options.fetchImpl || fetch)(buildOhlcvUrl(config, period, options.limit || 100), {
        headers: { Accept: "application/json" }, signal: controller.signal
      });
      if (!response.ok) throw new Error(`Market-data request failed (${response.status}).`);
      const candles = normalizeOhlcv(await response.json());
      return { candles, summary: marketSummary(candles, period), source: "GeckoTerminal" };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { PERIODS, buildOhlcvUrl, normalizeOhlcv, marketSummary, fetchOhlcv, isAddress };
});
