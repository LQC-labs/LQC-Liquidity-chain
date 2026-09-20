export const BPS = 10_000n;
export const NORMALIZED_PRICE_SCALE = 10n ** 18n;
export const MAX_PRICE_DECIMALS = 36;

function decimals(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_PRICE_DECIMALS) {
    throw new Error(`${label} decimals must be between 0 and ${MAX_PRICE_DECIMALS}.`);
  }
  return parsed;
}

export function normalizePositivePrice(answer, answerDecimals) {
  const value = BigInt(answer);
  if (value <= 0n) throw new Error("Oracle price must be positive.");
  const d = decimals(answerDecimals, "Oracle price");
  if (d === 18) return value;
  if (d < 18) return value * (10n ** BigInt(18 - d));
  return value / (10n ** BigInt(d - 18));
}

export function calculateDeviationBps(primaryPrice, referencePrice) {
  const primary = BigInt(primaryPrice);
  const reference = BigInt(referencePrice);
  if (primary <= 0n || reference <= 0n) throw new Error("Normalized prices must be positive.");
  const delta = primary >= reference ? primary - reference : reference - primary;
  // Round deviation upward so truncation can never turn an over-limit value into a pass.
  return (delta * BPS + reference - 1n) / reference;
}

export function enforceCrossSourceDeviation({ primaryAnswer, primaryDecimals, referenceAnswer, referenceDecimals, maxDeviationBps }) {
  const max = BigInt(maxDeviationBps);
  if (max < 1n || max > 5_000n) throw new Error("Maximum deviation must be between 1 and 5000 bps.");
  const primaryPrice = normalizePositivePrice(primaryAnswer, primaryDecimals);
  const referencePrice = normalizePositivePrice(referenceAnswer, referenceDecimals);
  if (primaryPrice === 0n || referencePrice === 0n) throw new Error("Normalized oracle price rounds to zero.");
  const deviationBps = calculateDeviationBps(primaryPrice, referencePrice);
  if (deviationBps > max) throw new Error(`Cross-source oracle deviation ${deviationBps} bps exceeds maximum ${max} bps.`);
  return {
    status: "READ_ONLY_CROSS_SOURCE_DEVIATION_PASS",
    activationAuthorized: false,
    scale: NORMALIZED_PRICE_SCALE.toString(),
    primaryPrice: primaryPrice.toString(),
    referencePrice: referencePrice.toString(),
    deviationBps: deviationBps.toString(),
    maxDeviationBps: max.toString(),
  };
}
