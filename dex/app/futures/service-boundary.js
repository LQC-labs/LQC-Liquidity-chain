// LQC Flow service-boundary contract.
// DEX Router and Futures Engine are sibling domains. Shared Services are injected
// through narrow ports so neither engine imports or owns the other engine.

function requirePort(name, value, methods) {
  if (!value || typeof value !== 'object') throw new Error(`${name}_REQUIRED`);
  for (const method of methods) if (typeof value[method] !== 'function') throw new Error(`${name}_INVALID_PORT`);
  return value;
}

function isolatedCall(domain, monitoring, operation, invoke) {
  try {
    return invoke();
  } catch (error) {
    try {
      monitoring?.emit?.({
        type: 'SERVICE_BOUNDARY_FAILURE',
        domain,
        operation,
        code: error?.code || error?.message || 'UNKNOWN_ERROR'
      });
    } catch {
      // Monitoring failure must never cascade into a sibling engine.
    }
    throw error;
  }
}

export function createSharedServices({ tokenRegistry, oracle, account, monitoring } = {}) {
  return Object.freeze({
    tokenRegistry: requirePort('TOKEN_REGISTRY', tokenRegistry, ['get']),
    oracle: requirePort('ORACLE', oracle, ['getMarkPrice']),
    account: requirePort('ACCOUNT', account, ['get']),
    monitoring: requirePort('MONITORING', monitoring, ['emit'])
  });
}

export function createLqcFlowServiceBoundary({ dexRouter, futuresEngine, sharedServices } = {}) {
  const dex = requirePort('DEX_ROUTER', dexRouter, ['quote']);
  const futures = requirePort('FUTURES_ENGINE', futuresEngine, ['placeOrder']);
  if (!sharedServices || typeof sharedServices !== 'object') throw new Error('SHARED_SERVICES_REQUIRED');
  const monitoring = sharedServices.monitoring;

  // Sibling failures are observed at the boundary and rethrown only to the
  // caller of that domain. No fallback invokes the other engine.
  return Object.freeze({
    dex: Object.freeze({
      quote: (...args) => isolatedCall('DEX_ROUTER', monitoring, 'quote', () => dex.quote(...args))
    }),
    futures: Object.freeze({
      placeOrder: (...args) => isolatedCall('FUTURES_ENGINE', monitoring, 'placeOrder', () => futures.placeOrder(...args))
    }),
    shared: sharedServices
  });
}
