// LQC Flow Futures — DEMO leverage / position risk tiers.
// Larger position notionals receive progressively lower leverage ceilings.

function positive(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

export function createLeverageTiers(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) throw new Error("LEVERAGE_TIERS_REQUIRED");
  let previousCap = 0;
  let previousLeverage = Infinity;
  const normalized = tiers.map((tier, index) => {
    const maxNotional = positive(tier?.maxNotional, "INVALID_TIER_MAX_NOTIONAL");
    const maxLeverage = positive(tier?.maxLeverage, "INVALID_TIER_MAX_LEVERAGE");
    const maintenanceMarginRate = positive(tier?.maintenanceMarginRate, "INVALID_TIER_MAINTENANCE_MARGIN");
    if (maxNotional <= previousCap) throw new Error("TIER_NOTIONAL_NOT_ASCENDING");
    if (maxLeverage > previousLeverage) throw new Error("TIER_LEVERAGE_NOT_DESCENDING");
    previousCap = maxNotional;
    previousLeverage = maxLeverage;
    return Object.freeze({ tier: index + 1, maxNotional, maxLeverage, maintenanceMarginRate });
  });
  return Object.freeze(normalized);
}

export function resolveLeverageTier(positionNotional, tiers) {
  const notional = positive(positionNotional, "INVALID_POSITION_NOTIONAL");
  if (!Array.isArray(tiers) || tiers.length === 0) throw new Error("LEVERAGE_TIERS_REQUIRED");
  const tier = tiers.find((candidate) => notional <= candidate.maxNotional);
  if (!tier) throw new Error("POSITION_NOTIONAL_EXCEEDS_TIERS");
  return tier;
}

export function validateTierLeverage({ positionNotional, leverage, tiers }) {
  const requestedLeverage = positive(leverage, "INVALID_LEVERAGE");
  const tier = resolveLeverageTier(positionNotional, tiers);
  if (requestedLeverage > tier.maxLeverage) throw new Error("TIER_MAX_LEVERAGE_EXCEEDED");
  return Object.freeze({ allowed: true, tier: tier.tier, maxLeverage: tier.maxLeverage, maintenanceMarginRate: tier.maintenanceMarginRate });
}
