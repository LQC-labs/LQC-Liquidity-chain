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

export function validateOracleSources(sources, {
  now = Date.now(),
  maxAgeMs = 30_000,
  maxDeviationRatio = 0.01,
  minSources = 2
} = {}) {
  if (!Array.isArray(sources)) throw new Error("ORACLE_SOURCES_REQUIRED");
  if (!Number.isInteger(minSources) || minSources < 2) throw new Error("INVALID_MIN_ORACLE_SOURCES");
  const currentTime = nonNegativeNumber(now, "INVALID_ORACLE_TIME");
  const maxAge = positiveNumber(maxAgeMs, "INVALID_ORACLE_MAX_AGE");
  const maxDeviation = positiveNumber(maxDeviationRatio, "INVALID_ORACLE_DEVIATION");

  const valid = sources.map((source) => {
    if (!source?.id) throw new Error("ORACLE_SOURCE_ID_REQUIRED");
    const price = positiveNumber(source.price, "INVALID_ORACLE_PRICE");
    const timestamp = nonNegativeNumber(source.timestamp, "INVALID_ORACLE_TIMESTAMP");
    if (timestamp > currentTime) throw new Error("ORACLE_TIMESTAMP_IN_FUTURE");
    return Object.freeze({ id: String(source.id), price, timestamp, ageMs: currentTime - timestamp });
  }).filter((source) => source.ageMs <= maxAge);

  if (valid.length < minSources) throw new Error("INSUFFICIENT_FRESH_ORACLE_SOURCES");

  const referencePrice = median(valid.map((source) => source.price));
  const accepted = valid.filter((source) => Math.abs(source.price - referencePrice) / referencePrice <= maxDeviation);
  if (accepted.length < minSources) throw new Error("ORACLE_PRICE_DEVIATION_TOO_HIGH");

  const aggregatePrice = median(accepted.map((source) => source.price));
  return Object.freeze({
    price: aggregatePrice,
    referencePrice,
    accepted: Object.freeze(accepted),
    rejectedCount: sources.length - accepted.length,
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
