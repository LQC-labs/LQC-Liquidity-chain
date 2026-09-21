#!/usr/bin/env node
'use strict';

function fail(reason, details = {}) {
  return { stage: '3/7', pass: false, activationAuthorized: false, reason, ...details };
}

function asBigInt(v) {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  throw new Error('INVALID_INTEGER');
}

function normalize(c) {
  if (!c || typeof c !== 'object') throw new Error('INVALID_CANDIDATE');
  if (!c.routeId || !c.domain || !c.adapterId) throw new Error('MISSING_IDENTITY');
  if (c.approvedAdapter !== true) throw new Error('UNAPPROVED_ADAPTER');
  if (c.stale === true) throw new Error('STALE_CANDIDATE');
  if (c.domain !== 'DEX_FLOW') throw new Error('WRONG_DOMAIN');
  const grossOut = asBigInt(c.grossOut);
  const explicitCost = asBigInt(c.explicitCost);
  const riskScore = asBigInt(c.riskScore);
  if (explicitCost > grossOut) throw new Error('COST_EXCEEDS_OUTPUT');
  return {
    routeId: String(c.routeId),
    adapterId: String(c.adapterId),
    domain: c.domain,
    grossOut,
    explicitCost,
    netOut: grossOut - explicitCost,
    riskScore
  };
}

function compare(a,b) {
  if (a.netOut !== b.netOut) return a.netOut > b.netOut ? -1 : 1;
  if (a.explicitCost !== b.explicitCost) return a.explicitCost < b.explicitCost ? -1 : 1;
  if (a.riskScore !== b.riskScore) return a.riskScore < b.riskScore ? -1 : 1;
  return a.routeId < b.routeId ? -1 : a.routeId > b.routeId ? 1 : 0;
}

function evaluate(input) {
  if (!input || !Array.isArray(input.candidates) || input.candidates.length === 0)
    return fail('CANDIDATES_REQUIRED');
  if (input.futuresStateUsed || input.lendingStateUsed || input.intentStateUsed)
    return fail('NON_DEX_STATE_USED');
  try {
    const normalized = input.candidates.map(normalize);
    const ids = new Set(normalized.map(x => x.routeId));
    if (ids.size !== normalized.length) return fail('DUPLICATE_ROUTE_ID');
    normalized.sort(compare);
    const winner = normalized[0];
    const canonical = normalized.map(x => ({
      routeId:x.routeId, adapterId:x.adapterId, domain:x.domain,
      grossOut:x.grossOut.toString(), explicitCost:x.explicitCost.toString(),
      netOut:x.netOut.toString(), riskScore:x.riskScore.toString()
    }));
    return {
      stage:'3/7', pass:true, activationAuthorized:false,
      selectedRouteId:winner.routeId,
      canonicalSelectionInput:canonical
    };
  } catch (e) {
    return fail(e.message || 'NORMALIZATION_FAILURE');
  }
}

module.exports={evaluate};
