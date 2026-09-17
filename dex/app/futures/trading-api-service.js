// LQC Flow Futures — authenticated DEMO trading API service contract.
// Keeps API-facing order lifecycle separate from AMM/Router2 and UI state.
// A production gateway must persist orders and perform server-side settlement.

import { buildDemoOrder } from './order-engine.js';
import { API_PERMISSIONS, verifySignedRequest } from './api-auth-contract.js';

function freezeOrder(order) {
  return Object.freeze({ ...order });
}

export function createTradingApiService({ marketData, verifySignature, replayGuard, resolveApiKey }) {
  if (!marketData || typeof marketData.getMarkPrice !== 'function') throw new Error('MARKET_DATA_PROVIDER_REQUIRED');
  if (typeof resolveApiKey !== 'function') throw new Error('API_KEY_RESOLVER_REQUIRED');
  if (typeof verifySignature !== 'function') throw new Error('SIGNATURE_VERIFIER_REQUIRED');

  const orders = new Map();

  async function authenticate(auth, permission) {
    const descriptor = await resolveApiKey(String(auth?.keyId || ''));
    return verifySignedRequest({
      descriptor,
      requiredPermission: permission,
      request: auth?.request,
      signature: auth?.signature,
      verifySignature,
      replayGuard,
      serverTime: Date.now()
    });
  }

  async function createOrder({ auth, order }) {
    const principal = await authenticate(auth, API_PERMISSIONS.TRADE);
    const symbol = String(order?.symbol || '').toUpperCase();
    const markPrice = marketData.getMarkPrice(symbol);
    if (!markPrice) throw new Error('MARK_PRICE_UNAVAILABLE');
    const built = buildDemoOrder({ ...order, symbol, markPrice });
    const stored = freezeOrder({
      ...built,
      accountKeyId: principal.keyId,
      status: built.type === 'MARKET' ? 'FILLED_DEMO' : 'OPEN_DEMO',
      updatedAt: new Date().toISOString()
    });
    orders.set(stored.id, stored);
    return stored;
  }

  async function cancelOrder({ auth, orderId }) {
    const principal = await authenticate(auth, API_PERMISSIONS.TRADE);
    const id = String(orderId || '');
    const current = orders.get(id);
    if (!current || current.accountKeyId !== principal.keyId) throw new Error('ORDER_NOT_FOUND');
    if (current.status !== 'OPEN_DEMO') throw new Error('ORDER_NOT_CANCELABLE');
    const cancelled = freezeOrder({ ...current, status: 'CANCELLED_DEMO', updatedAt: new Date().toISOString() });
    orders.set(id, cancelled);
    return cancelled;
  }

  async function getOrder({ auth, orderId }) {
    const principal = await authenticate(auth, API_PERMISSIONS.READ);
    const current = orders.get(String(orderId || ''));
    if (!current || current.accountKeyId !== principal.keyId) throw new Error('ORDER_NOT_FOUND');
    return current;
  }

  async function openOrders({ auth, symbol = null }) {
    const principal = await authenticate(auth, API_PERMISSIONS.READ);
    const normalized = symbol ? String(symbol).toUpperCase() : null;
    return Object.freeze([...orders.values()].filter((order) =>
      order.accountKeyId === principal.keyId &&
      order.status === 'OPEN_DEMO' &&
      (!normalized || order.symbol === normalized)
    ));
  }

  async function userTrades({ auth, symbol = null }) {
    const principal = await authenticate(auth, API_PERMISSIONS.READ);
    const normalized = symbol ? String(symbol).toUpperCase() : null;
    return Object.freeze([...orders.values()].filter((order) =>
      order.accountKeyId === principal.keyId &&
      order.status === 'FILLED_DEMO' &&
      (!normalized || order.symbol === normalized)
    ));
  }

  return Object.freeze({ createOrder, cancelOrder, getOrder, openOrders, userTrades });
}

// Target authenticated REST mapping:
// POST   /api/v1/order      -> createOrder()
// DELETE /api/v1/order      -> cancelOrder()
// GET    /api/v1/order      -> getOrder()
// GET    /api/v1/openOrders -> openOrders()
// GET    /api/v1/userTrades -> userTrades()
//
// Positions/account endpoints will be connected after API order state is
// backed by the margin/position engines rather than this in-memory contract.
