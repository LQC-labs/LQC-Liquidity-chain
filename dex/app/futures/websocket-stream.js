// LQC Flow Futures — transport-independent WebSocket stream contract.
// Shared Market Data/Oracle is consumed at this boundary; Futures Engine and
// DEX Router remain sibling services and do not own each other's streams.

import { getExchangeSymbolInfo } from './exchange-info.js';

export const WS_SCHEMA_VERSION = '1.0.0-demo';
function normalizeSymbol(symbol) { const value = String(symbol || '').trim().toUpperCase(); if (!value || !getExchangeSymbolInfo(value)) throw new Error('UNKNOWN_MARKET'); return value; }
function normalizeChannel(channel) { const value = String(channel || '').trim(); if (!value) throw new Error('INVALID_STREAM_CHANNEL'); return value; }
export function streamName(channel, symbol) { return `${normalizeChannel(channel)}.${normalizeSymbol(symbol)}`; }

export function createStreamSequencer() {
  const sequences = new Map();
  function next(stream) { const key = String(stream); const value = (sequences.get(key) || 0) + 1; sequences.set(key, value); return value; }
  function current(stream) { return sequences.get(String(stream)) || 0; }
  function reset(stream, sequence = 0) { const value = Number(sequence); if (!Number.isInteger(value) || value < 0) throw new Error('INVALID_SEQUENCE'); sequences.set(String(stream), value); return value; }
  return Object.freeze({ next, current, reset });
}

export function createWebSocketStreamGateway(provider, sequencer = createStreamSequencer(), { oracleStatus = null, now = () => Date.now() } = {}) {
  if (!provider || typeof provider.subscribe !== 'function') throw new Error('STREAM_PROVIDER_REQUIRED');
  if (oracleStatus != null && typeof oracleStatus !== 'function') throw new Error('INVALID_ORACLE_STATUS_PROVIDER');
  if (typeof now !== 'function') throw new Error('INVALID_CLOCK');
  function envelope(channel, symbol, data) { const key = normalizeSymbol(symbol); const stream = streamName(channel, key); return Object.freeze({ schemaVersion: WS_SCHEMA_VERSION, stream, channel: normalizeChannel(channel), symbol: key, eventTime: now(), sequence: sequencer.next(stream), data: Object.freeze({ ...data }) }); }
  function isOracleHealthy(key) { if (!oracleStatus) return true; const status = oracleStatus(key, { now: now() }); return Boolean(status?.available && status?.healthy && !status?.stale); }
  function subscribe({ channel = 'markPrice', symbol }, listener) {
    const key = normalizeSymbol(symbol); const normalizedChannel = normalizeChannel(channel);
    if (typeof listener !== 'function') throw new Error('INVALID_STREAM_LISTENER');
    return provider.subscribe((event) => { if (String(event.symbol || '').toUpperCase() !== key) return; if (normalizedChannel === 'markPrice' && !isOracleHealthy(key)) return; listener(envelope(normalizedChannel, key, event)); });
  }
  return Object.freeze({ subscribe, envelope, sequencer });
}

export function detectSequenceGap(previousSequence, incomingSequence) {
  const previous = Number(previousSequence); const incoming = Number(incomingSequence);
  if (!Number.isInteger(previous) || previous < 0) throw new Error('INVALID_PREVIOUS_SEQUENCE');
  if (!Number.isInteger(incoming) || incoming < 1) throw new Error('INVALID_INCOMING_SEQUENCE');
  return Object.freeze({ gap: previous > 0 && incoming !== previous + 1, expected: previous > 0 ? previous + 1 : incoming, received: incoming, duplicateOrOld: previous > 0 && incoming <= previous });
}

// Converts sequence validation into an explicit transport-neutral recovery
// contract. On a gap, clients must stop incremental application, fetch the
// indicated REST snapshot, rebuild state, then resume from the next WS event.
export function sequenceRecovery(previousSequence, incomingSequence, { channel, symbol }) {
  const key = normalizeSymbol(symbol); const normalizedChannel = normalizeChannel(channel);
  const check = detectSequenceGap(previousSequence, incomingSequence);
  if (!check.gap) return Object.freeze({ ...check, action: 'APPLY_EVENT', snapshot: null });
  const snapshotByChannel = { depth: `/api/v1/depth?symbol=${key}`, trade: `/api/v1/trades?symbol=${key}`, markPrice: `/api/v1/markPrice?symbol=${key}`, ticker: `/api/v1/ticker/24hr?symbol=${key}`, bookTicker: `/api/v1/ticker/24hr?symbol=${key}` };
  return Object.freeze({ ...check, action: 'REBUILD_FROM_REST', snapshot: snapshotByChannel[normalizedChannel] || `/api/v1/exchangeInfo?symbol=${key}` });
}

// Public streams include ticker, bookTicker, depth, trade, kline and markPrice.
// A sequence gap requires the REST snapshot named by sequenceRecovery().
