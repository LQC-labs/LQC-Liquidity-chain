// LQC Flow Futures — transport-independent WebSocket stream contract.
// Provides versioned envelopes, per-stream sequence IDs and client-side gap
// detection primitives for future CEX/market-maker integrations.

import { getExchangeSymbolInfo } from './exchange-info.js';

export const WS_SCHEMA_VERSION = '1.0.0-demo';

function normalizeSymbol(symbol) {
  const value = String(symbol || '').trim().toUpperCase();
  if (!value || !getExchangeSymbolInfo(value)) throw new Error('UNKNOWN_MARKET');
  return value;
}

function normalizeChannel(channel) {
  const value = String(channel || '').trim();
  if (!value) throw new Error('INVALID_STREAM_CHANNEL');
  return value;
}

export function streamName(channel, symbol) {
  return `${normalizeChannel(channel)}.${normalizeSymbol(symbol)}`;
}

export function createStreamSequencer() {
  const sequences = new Map();

  function next(stream) {
    const key = String(stream);
    const value = (sequences.get(key) || 0) + 1;
    sequences.set(key, value);
    return value;
  }

  function current(stream) {
    return sequences.get(String(stream)) || 0;
  }

  function reset(stream, sequence = 0) {
    const value = Number(sequence);
    if (!Number.isInteger(value) || value < 0) throw new Error('INVALID_SEQUENCE');
    sequences.set(String(stream), value);
    return value;
  }

  return Object.freeze({ next, current, reset });
}

export function createWebSocketStreamGateway(provider, sequencer = createStreamSequencer()) {
  if (!provider || typeof provider.subscribe !== 'function') throw new Error('STREAM_PROVIDER_REQUIRED');

  function envelope(channel, symbol, data) {
    const key = normalizeSymbol(symbol);
    const stream = streamName(channel, key);
    return Object.freeze({
      schemaVersion: WS_SCHEMA_VERSION,
      stream,
      channel: normalizeChannel(channel),
      symbol: key,
      eventTime: Date.now(),
      sequence: sequencer.next(stream),
      data: Object.freeze({ ...data })
    });
  }

  function subscribe({ channel = 'markPrice', symbol }, listener) {
    const key = normalizeSymbol(symbol);
    if (typeof listener !== 'function') throw new Error('INVALID_STREAM_LISTENER');
    return provider.subscribe((event) => {
      if (String(event.symbol || '').toUpperCase() !== key) return;
      listener(envelope(channel, key, event));
    });
  }

  return Object.freeze({ subscribe, envelope, sequencer });
}

// Consumers should keep the last accepted sequence per stream. If this
// function reports a gap, rebuild state from a REST snapshot before applying
// additional incremental depth updates.
export function detectSequenceGap(previousSequence, incomingSequence) {
  const previous = Number(previousSequence);
  const incoming = Number(incomingSequence);
  if (!Number.isInteger(previous) || previous < 0) throw new Error('INVALID_PREVIOUS_SEQUENCE');
  if (!Number.isInteger(incoming) || incoming < 1) throw new Error('INVALID_INCOMING_SEQUENCE');
  return Object.freeze({
    gap: previous > 0 && incoming !== previous + 1,
    expected: previous > 0 ? previous + 1 : incoming,
    received: incoming,
    duplicateOrOld: previous > 0 && incoming <= previous
  });
}

// Target public stream names:
// ticker.LQCUSDT
// bookTicker.LQCUSDT
// depth.LQCUSDT
// trade.LQCUSDT
// kline.1m.LQCUSDT (transport adapter may use a compound channel)
// markPrice.LQCUSDT
