// LQC Flow service-boundary contract.
// DEX Router and Futures Engine are sibling domains. Shared Services are injected
// through narrow ports so neither engine imports or owns the other engine.

function requirePort(name, value, methods) {
  if (!value || typeof value !== 'object') throw new Error(`${name}_REQUIRED`);
  for (const method of methods) if (typeof value[method] !== 'function') throw new Error(`${name}_INVALID_PORT`);
  return value;
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

  // Expose sibling domains independently. Cross-domain collaboration must go
  // through Shared Services/API/Event adapters, never direct engine ownership.
  return Object.freeze({
    dex: Object.freeze({ quote: (...args) => dex.quote(...args) }),
    futures: Object.freeze({ placeOrder: (...args) => futures.placeOrder(...args) }),
    shared: sharedServices
  });
}
