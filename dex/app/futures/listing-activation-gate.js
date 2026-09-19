// LQC Flow Futures — guarded listing activation gate.
// New perpetual markets remain isolated configuration until every required
// oracle/risk/security approval is explicitly satisfied.

import { validateFuturesMarket } from './markets.js';

export const LISTING_ACTIVATION_STATUS = Object.freeze({
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE'
});

function requireObject(value, code) {
  if (!value || typeof value !== 'object') throw new Error(code);
  return value;
}

export function validateFuturesListingCandidate({ market, oracle, riskLimits, approvals } = {}) {
  if (!validateFuturesMarket(market)) throw new Error('INVALID_FUTURES_LISTING_MARKET');
  if (market.status !== 'DEMO') throw new Error('FUTURES_LISTING_CANDIDATE_MUST_BE_DEMO');
  const oracleConfig = requireObject(oracle, 'LISTING_ORACLE_CONFIG_REQUIRED');
  if (!Number.isInteger(oracleConfig.minSources) || oracleConfig.minSources < 3) throw new Error('LISTING_ORACLE_REQUIRES_THREE_SOURCES');
  if (!Number.isFinite(oracleConfig.maxAgeMs) || oracleConfig.maxAgeMs <= 0) throw new Error('INVALID_LISTING_ORACLE_MAX_AGE');
  if (!Number.isFinite(oracleConfig.maxDeviationRatio) || oracleConfig.maxDeviationRatio <= 0 || oracleConfig.maxDeviationRatio >= 1) throw new Error('INVALID_LISTING_ORACLE_DEVIATION');

  const limits = requireObject(riskLimits, 'LISTING_RISK_LIMITS_REQUIRED');
  const requiredLimits = ['maxOpenInterest', 'maxPositionNotional', 'maxOrderNotional'];
  for (const key of requiredLimits) {
    if (!Object.hasOwn(limits, key)) throw new Error(`MISSING_LISTING_RISK_LIMIT_${key.toUpperCase()}`);
  }
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`INVALID_LISTING_RISK_LIMIT_${key.toUpperCase()}`);
  }
  if (limits.maxOrderNotional > limits.maxPositionNotional) throw new Error('LISTING_ORDER_LIMIT_EXCEEDS_POSITION_LIMIT');
  if (limits.maxPositionNotional > limits.maxOpenInterest) throw new Error('LISTING_POSITION_LIMIT_EXCEEDS_OPEN_INTEREST');

  const gate = requireObject(approvals, 'LISTING_APPROVALS_REQUIRED');
  const required = ['oracleValidated', 'riskValidated', 'liquidationStressPassed', 'insuranceAdlStressPassed', 'securityGatePassed', 'activationApproved'];
  const missing = required.filter((key) => gate[key] !== true);
  return Object.freeze({
    symbol: market.symbol,
    status: missing.length ? LISTING_ACTIVATION_STATUS.PENDING : LISTING_ACTIVATION_STATUS.ACTIVE,
    activatable: missing.length === 0,
    missing: Object.freeze(missing)
  });
}

export function activateFuturesListing(candidate) {
  const result = validateFuturesListingCandidate(candidate);
  if (!result.activatable) {
    const error = new Error('FUTURES_LISTING_ACTIVATION_BLOCKED');
    error.missing = result.missing;
    throw error;
  }
  return Object.freeze({ symbol: result.symbol, status: LISTING_ACTIVATION_STATUS.ACTIVE });
}
