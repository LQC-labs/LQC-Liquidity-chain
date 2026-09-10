export const TIMEFRAME_SECONDS = Object.freeze({ "1m": 60, "3m": 180, "5m": 300, "15m": 900,
  "1h": 3600, "4h": 14400, "1D": 86400, "1W": 604800, "1M": 2592000 });

export function swapToTrade(swap, pair, timestamp) {
  const baseIs0 = pair.base.toLowerCase() === pair.token0.toLowerCase();
  const baseRaw = baseIs0 ? BigInt(swap.amount0In) + BigInt(swap.amount0Out) : BigInt(swap.amount1In) + BigInt(swap.amount1Out);
  const quoteRaw = baseIs0 ? BigInt(swap.amount1In) + BigInt(swap.amount1Out) : BigInt(swap.amount0In) + BigInt(swap.amount0Out);
  if (baseRaw <= 0n || quoteRaw <= 0n) throw new Error("Swap has no two-sided traded amount.");
  const baseAmount = Number(baseRaw) / 10 ** pair.baseDecimals;
  const quoteAmount = Number(quoteRaw) / 10 ** pair.quoteDecimals;
  const price = quoteAmount / baseAmount;
  if (![baseAmount, quoteAmount, price].every(Number.isFinite) || price <= 0) throw new Error("Swap price is outside indexer numeric bounds.");
  return { timestamp: Number(timestamp), price, baseVolume: baseAmount, quoteVolume: quoteAmount };
}

export function aggregateCandles(trades, timeframe) {
  const seconds = TIMEFRAME_SECONDS[timeframe];
  if (!seconds) throw new Error("Unsupported candle timeframe.");
  const candles = new Map();
  for (const trade of [...trades].sort((a, b) => a.timestamp - b.timestamp)) {
    if (!Number.isFinite(trade.timestamp) || !Number.isFinite(trade.price) || !Number.isFinite(trade.baseVolume) || trade.timestamp <= 0 || trade.price <= 0 || trade.baseVolume < 0) continue;
    const time = Math.floor(trade.timestamp / seconds) * seconds;
    const current = candles.get(time);
    if (!current) candles.set(time, { time, open: trade.price, high: trade.price, low: trade.price, close: trade.price, volume: trade.baseVolume });
    else { current.high = Math.max(current.high, trade.price); current.low = Math.min(current.low, trade.price); current.close = trade.price; current.volume += trade.baseVolume; }
  }
  return [...candles.values()];
}

export function approvedPool(deployment, poolAddress) {
  const target = String(poolAddress || "").toLowerCase();
  return (deployment?.pools || []).some(pool => String(pool.address || "").toLowerCase() === target);
}

function validTrade(trade) {
  return typeof trade?.base === "string" && typeof trade?.quote === "string" &&
    [trade.timestamp, trade.price, trade.baseVolume, trade.quoteVolume].every(Number.isFinite) &&
    trade.timestamp > 0 && trade.price > 0 && trade.baseVolume > 0 && trade.quoteVolume > 0;
}

export function createIndexerCheckpoint(cursor, pools, maxTrades = 200000) {
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("Indexer cursor is invalid.");
  const records = {};
  for (const pool of pools) {
    const address = String(pool.address || "").toLowerCase();
    if (!address || !pool.token0 || !pool.token1) throw new Error("Indexer pool identity is incomplete.");
    const trades = (pool.trades || []).filter(validTrade).slice(-maxTrades);
    records[address] = { token0: pool.token0.toLowerCase(), token1: pool.token1.toLowerCase(), trades };
  }
  return { schemaVersion: 1, chainId: 97, nextBlock: cursor, pools: records };
}

export function restoreIndexerCheckpoint(snapshot, pools, maxTrades = 200000) {
  if (snapshot?.schemaVersion !== 1 || snapshot?.chainId !== 97 || !Number.isSafeInteger(snapshot?.nextBlock) || snapshot.nextBlock < 0 || !snapshot?.pools) {
    throw new Error("Candle indexer checkpoint is incompatible.");
  }
  for (const pool of pools) {
    const saved = snapshot.pools[String(pool.address).toLowerCase()];
    if (!saved || saved.token0 !== pool.token0.toLowerCase() || saved.token1 !== pool.token1.toLowerCase() || !Array.isArray(saved.trades) || saved.trades.some(trade => !validTrade(trade))) {
      throw new Error("Candle indexer checkpoint does not match the approved pools.");
    }
    pool.trades = saved.trades.slice(-maxTrades);
  }
  return snapshot.nextBlock;
}
