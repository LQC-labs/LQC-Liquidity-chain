// LQC Flow Futures — versioned REST routing contract.
// Transport-independent boundary: Shared Market Data/Oracle stays separate from
// both DEX Router and Futures Engine; HTTP transports consume this API adapter.

import { API_VERSION, API_PREFIX } from './api-contract.js';

export const REST_API_VERSION = API_VERSION;
export const REST_API_PREFIX = API_PREFIX;

const STATUS_BY_CODE = Object.freeze({ UNKNOWN_MARKET: 404, MARK_PRICE_UNAVAILABLE: 503, ORACLE_STATUS_UNAVAILABLE: 503, DEPTH_UNAVAILABLE: 503, TRADES_UNAVAILABLE: 503, KLINES_UNAVAILABLE: 503, STREAM_UNAVAILABLE: 503, INVALID_LIMIT: 400, INVALID_KLINE_INTERVAL: 400, METHOD_NOT_ALLOWED: 405, ROUTE_NOT_FOUND: 404 });
function requestId() { return `lqc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
function response(status, body, id) { return Object.freeze({ status, headers: Object.freeze({ 'content-type': 'application/json; charset=utf-8', 'x-lqc-api-version': REST_API_VERSION, 'x-request-id': id }), body: Object.freeze(body) }); }
function failure(error, id) { const code = String(error?.message || 'INTERNAL_ERROR'); const status = STATUS_BY_CODE[code] || 500; return response(status, { code, message: code === 'INTERNAL_ERROR' ? 'Internal server error.' : code, requestId: id, timestamp: Date.now() }, id); }
function ok(data, id) { return response(200, { data, requestId: id, timestamp: Date.now() }, id); }
function normalizeQuery(query = {}) { return query && typeof query === 'object' ? query : {}; }

export function createRestApiRouter(gateway) {
  if (!gateway) throw new Error('MARKET_DATA_GATEWAY_REQUIRED');
  function route({ method = 'GET', path = '/', query = {}, id = requestId() } = {}) {
    const verb = String(method).toUpperCase(); const pathname = String(path).replace(/\/+$/, '') || '/'; const q = normalizeQuery(query);
    if (verb !== 'GET') return failure(new Error('METHOD_NOT_ALLOWED'), id);
    try {
      if (pathname === `${REST_API_PREFIX}/time`) return ok({ serverTime: Date.now() }, id);
      if (pathname === `${REST_API_PREFIX}/exchangeInfo`) return ok(gateway.exchangeInfo(q.symbol || null), id);
      if (pathname === `${REST_API_PREFIX}/ticker/24hr`) return ok(gateway.ticker24h(q.symbol), id);
      if (pathname === `${REST_API_PREFIX}/markPrice`) return ok(gateway.markPrice(q.symbol), id);
      if (pathname === `${REST_API_PREFIX}/oracle/status`) {
        if (typeof gateway.oracleStatus !== 'function') throw new Error('ORACLE_STATUS_UNAVAILABLE');
        const status = gateway.oracleStatus(q.symbol);
        if (!status) throw new Error('ORACLE_STATUS_UNAVAILABLE');
        return ok(status, id);
      }
      if (pathname === `${REST_API_PREFIX}/depth`) return ok(gateway.depth(q.symbol, q.limit == null ? 100 : Number(q.limit)), id);
      if (pathname === `${REST_API_PREFIX}/trades`) return ok(gateway.trades(q.symbol, q.limit == null ? 100 : Number(q.limit)), id);
      if (pathname === `${REST_API_PREFIX}/klines`) return ok(gateway.klines(q.symbol, q.interval, q.limit == null ? 500 : Number(q.limit)), id);
      return failure(new Error('ROUTE_NOT_FOUND'), id);
    } catch (error) { return failure(error, id); }
  }
  return Object.freeze({ route, version: REST_API_VERSION, prefix: REST_API_PREFIX });
}

// Production transport requirements: TLS/trusted proxy policy, rate limits,
// structured audit logs, CORS, metrics/tracing, signed auth + replay protection.
