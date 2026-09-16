// LQC Flow Futures — DEMO multi-source oracle guard.
// Aggregates independent price observations and blocks unsafe market data.

function positiveNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

function nonNegativeNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(code);
  return number;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function spreadRatio(sources) {
  const prices = sources.map((source) => source.price);
  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);
  return (maximum - minimum) / minimum;
}

export function validateOracleSources(sources, {
  now = Date.now(),
  maxAgeMs = 30_000,
  maxDeviationRatio = 0.01,
  maxSourceSpreadRatio = maxDeviationRatio * 2,
  minSources = 2,
  productionMode = false
} = {}) {
  if (!Array.isArray(sources)) throw new Error("ORACLE_SOURCES_REQUIRED");
  if (!Number.isInteger(minSources) || minSources < 2) throw new Error("INVALID_MIN_ORACLE_SOURCES");
  if (productionMode && minSources < 3) throw new Error("PRODUCTION_ORACLE_REQUIRES_THREE_SOURCES");
  const currentTime = nonNegativeNumber(now, "INVALID_ORACLE_TIME");
  const maxAge = positiveNumber(maxAgeMs, "INVALID_ORACLE_MAX_AGE");
  const maxDeviation = positiveNumber(maxDeviationRatio, "INVALID_ORACLE_DEVIATION");
  const maxSpread = positiveNumber(maxSourceSpreadRatio, "INVALID_ORACLE_SOURCE_SPREAD");
  const sourceIds = new Set();

  const valid = sources.map((source) => {
    if (!source?.id) throw new Error("ORACLE_SOURCE_ID_REQUIRED");
    const id = String(source.id);
    if (sourceIds.has(id)) throw new Error("DUPLICATE_ORACLE_SOURCE_ID");
    sourceIds.add(id);
    const price = positiveNumber(source.price, "INVALID_ORACLE_PRICE");
    const timestamp = nonNegativeNumber(source.timestamp, "INVALID_ORACLE_TIMESTAMP");
    if (timestamp > currentTime) throw new Error("ORACLE_TIMESTAMP_IN_FUTURE");
    return Object.freeze({ id, price, timestamp, ageMs: currentTime - timestamp });
  }).filter((source) => source.ageMs <= maxAge);

  if (valid.length < minSources) throw new Error("INSUFFICIENT_FRESH_ORACLE_SOURCES");
  if (valid.length === 2 && spreadRatio(valid) > maxSpread) throw new Error("ORACLE_SOURCE_SPREAD_TOO_HIGH");

  const referencePrice = median(valid.map((source) => source.price));
  const accepted = valid.filter((source) => Math.abs(source.price - referencePrice) / referencePrice <= maxDeviation);
  if (accepted.length < minSources) throw new Error("ORACLE_PRICE_DEVIATION_TOO_HIGH");
  if (spreadRatio(accepted) > maxSpread) throw new Error("ORACLE_SOURCE_SPREAD_TOO_HIGH");

  const aggregatePrice = median(accepted.map((source) => source.price));
  return Object.freeze({
    price: aggregatePrice,
    referencePrice,
    accepted: Object.freeze(accepted),
    rejectedCount: sources.length - accepted.length,
    sourceSpreadRatio: spreadRatio(accepted),
    healthy: true
  });
}

export function priceCircuitBreaker({ previousPrice, nextPrice, maxMoveRatio = 0.1 }) {
  const previous = positiveNumber(previousPrice, "INVALID_PREVIOUS_PRICE");
  const next = positiveNumber(nextPrice, "INVALID_NEXT_PRICE");
  const maxMove = positiveNumber(maxMoveRatio, "INVALID_MAX_PRICE_MOVE");
  const moveRatio = Math.abs(next - previous) / previous;
  return Object.freeze({ allowed: moveRatio <= maxMove, moveRatio, previousPrice: previous, nextPrice: next });
}
