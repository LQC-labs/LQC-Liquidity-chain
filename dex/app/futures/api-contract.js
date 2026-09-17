// Transport-neutral public API contract shared by REST and WebSocket adapters.
// Keeping these constants outside either transport prevents one adapter from
// owning the other and preserves the LQC Flow sibling-service architecture.

export const API_VERSION = 'v1';
export const API_PREFIX = `/api/${API_VERSION}`;

const recoveryPathByChannel = Object.freeze({
  depth: 'depth',
  trade: 'trades',
  markPrice: 'markPrice',
  ticker: 'ticker/24hr',
  bookTicker: 'ticker/24hr'
});

export function publicApiPath(resource, symbol = null) {
  const path = `${API_PREFIX}/${resource}`;
  return symbol ? `${path}?symbol=${String(symbol).trim().toUpperCase()}` : path;
}

export function parseKlineChannel(channel) {
  const normalized = String(channel || '').trim();
  const match = /^kline\.([A-Za-z0-9]+)$/.exec(normalized);
  return match ? Object.freeze({ channel: 'kline', interval: match[1] }) : null;
}

export function recoverySnapshotPath(channel, symbol) {
  const normalized = String(channel || '').trim();
  const kline = parseKlineChannel(normalized);
  if (kline) {
    const key = String(symbol || '').trim().toUpperCase();
    return `${API_PREFIX}/klines?symbol=${key}&interval=${encodeURIComponent(kline.interval)}`;
  }
  const resource = recoveryPathByChannel[normalized] || 'exchangeInfo';
  return publicApiPath(resource, symbol);
}
