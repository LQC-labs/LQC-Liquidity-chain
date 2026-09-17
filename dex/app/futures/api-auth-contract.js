// LQC Flow Futures — API authentication contract for future server gateways.
// DEMO/architecture module only. It intentionally contains no real API keys,
// secrets, custody credentials or production cryptography implementation.

export const API_PERMISSIONS = Object.freeze({
  READ: 'READ',
  TRADE: 'TRADE',
  WITHDRAW: 'WITHDRAW'
});

export const DEFAULT_RECV_WINDOW_MS = 5000;
export const MAX_RECV_WINDOW_MS = 60000;

function positiveInteger(value, code) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(code);
  return number;
}

export function normalizePermissions(permissions = []) {
  const allowed = new Set(Object.values(API_PERMISSIONS));
  const normalized = [...new Set(permissions.map((value) => String(value).toUpperCase()))];
  if (!normalized.every((value) => allowed.has(value))) throw new Error('INVALID_API_PERMISSION');
  return Object.freeze(normalized);
}

export function createApiKeyDescriptor({ keyId, permissions = [API_PERMISSIONS.READ], enabled = true, label = '' }) {
  const id = String(keyId || '').trim();
  if (!id) throw new Error('INVALID_API_KEY_ID');
  return Object.freeze({
    keyId: id,
    label: String(label || ''),
    permissions: normalizePermissions(permissions),
    enabled: Boolean(enabled)
  });
}

export function assertPermission(descriptor, permission) {
  if (!descriptor?.enabled) throw new Error('API_KEY_DISABLED');
  const required = String(permission || '').toUpperCase();
  if (!descriptor.permissions?.includes(required)) throw new Error('API_PERMISSION_DENIED');
  return true;
}

export function validateRequestTimestamp({ timestamp, recvWindow = DEFAULT_RECV_WINDOW_MS, serverTime = Date.now() }) {
  const requestTime = positiveInteger(timestamp, 'INVALID_TIMESTAMP');
  const now = positiveInteger(serverTime, 'INVALID_SERVER_TIME');
  const window = positiveInteger(recvWindow, 'INVALID_RECV_WINDOW');
  if (window < 1 || window > MAX_RECV_WINDOW_MS) throw new Error('INVALID_RECV_WINDOW');
  const drift = Math.abs(now - requestTime);
  if (drift > window) throw new Error('REQUEST_TIMESTAMP_EXPIRED');
  return Object.freeze({ valid: true, serverTime: now, requestTime, recvWindow: window, drift });
}

export function createReplayGuard({ ttlMs = MAX_RECV_WINDOW_MS, maxEntries = 10000 } = {}) {
  const ttl = positiveInteger(ttlMs, 'INVALID_REPLAY_TTL');
  const limit = positiveInteger(maxEntries, 'INVALID_REPLAY_LIMIT');
  if (!ttl || !limit) throw new Error('INVALID_REPLAY_GUARD_CONFIG');
  const seen = new Map();

  function prune(now = Date.now()) {
    for (const [key, expiresAt] of seen) if (expiresAt <= now) seen.delete(key);
    while (seen.size > limit) seen.delete(seen.keys().next().value);
  }

  function consume({ keyId, nonce, now = Date.now() }) {
    const key = `${String(keyId || '').trim()}:${String(nonce || '').trim()}`;
    if (key === ':') throw new Error('INVALID_REPLAY_KEY');
    const current = positiveInteger(now, 'INVALID_SERVER_TIME');
    prune(current);
    if (seen.has(key)) throw new Error('REPLAY_DETECTED');
    seen.set(key, current + ttl);
    prune(current);
    return true;
  }

  return Object.freeze({ consume, prune, size: () => seen.size });
}

// Canonical payload generation is deterministic so a future server-side
// signer/verifier can use HMAC-SHA256, Ed25519 or another reviewed scheme.
// Actual production signature verification belongs on the trusted server.
export function canonicalizeSignedRequest({ method, path, query = {}, timestamp, recvWindow = DEFAULT_RECV_WINDOW_MS, nonce }) {
  const verb = String(method || '').trim().toUpperCase();
  const pathname = String(path || '').trim();
  if (!verb || !pathname) throw new Error('INVALID_SIGNED_REQUEST');
  const pairs = Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => [String(key), String(value)])
    .sort(([a], [b]) => a.localeCompare(b));
  const encoded = pairs.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&');
  return [verb, pathname, encoded, String(timestamp), String(recvWindow), String(nonce || '')].join('\n');
}

export async function verifySignedRequest({ descriptor, requiredPermission = API_PERMISSIONS.READ, request, signature, verifySignature, replayGuard, serverTime = Date.now() }) {
  if (!descriptor) throw new Error('API_KEY_REQUIRED');
  assertPermission(descriptor, requiredPermission);
  validateRequestTimestamp({ timestamp: request?.timestamp, recvWindow: request?.recvWindow, serverTime });
  if (typeof verifySignature !== 'function') throw new Error('SIGNATURE_VERIFIER_REQUIRED');
  const canonical = canonicalizeSignedRequest(request);
  const valid = await verifySignature({ keyId: descriptor.keyId, canonical, signature: String(signature || '') });
  if (!valid) throw new Error('INVALID_SIGNATURE');
  if (replayGuard) replayGuard.consume({ keyId: descriptor.keyId, nonce: request?.nonce, now: serverTime });
  return Object.freeze({ authenticated: true, keyId: descriptor.keyId, permission: requiredPermission });
}

// Production requirements:
// - store API secrets only in a secret manager/HSM-backed service
// - constant-time signature comparison
// - key rotation/revocation and IP allowlists where required
// - separate withdrawal permission from trading permission
// - persistent/distributed replay protection for multi-instance gateways
// - security review before enabling authenticated production trading
