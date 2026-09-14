import crypto from "node:crypto";
import { ethers } from "ethers";

const HASH = /^0x[0-9a-f]{64}$/;
const TRACE = /^[A-Za-z0-9._:-]{1,128}$/;
const QUOTE_REQUEST_FIELDS = Object.freeze(["version", "type", "chainId", "tokenIn", "tokenOut", "amountIn",
  "requestedAt", "expiresAt", "clientRequestId", "requestHash"]);

export const hashApiKey = value => crypto.createHash("sha256").update(String(value)).digest("hex");

export function validateQuoteApiCapabilities(capabilities, requirements = {}) {
  const chainId = requirements.chainId ?? 97;
  const requestVersion = requirements.requestVersion ?? 1;
  const responseVersion = requirements.responseVersion ?? 1;
  const requiredFeatures = requirements.requiredFeatures ??
    ["bestExecutionProof", "requestHashBinding", "idempotentRetries", "serviceHealth"];
  if (!capabilities || capabilities.schemaVersion !== 1 || capabilities.type !== "LQC_QUOTE_API_CAPABILITIES" ||
      !Number.isSafeInteger(chainId) || chainId <= 0 || !Number.isSafeInteger(requestVersion) || requestVersion <= 0 ||
      !Number.isSafeInteger(responseVersion) || responseVersion <= 0 || !Array.isArray(requiredFeatures) ||
      !Array.isArray(capabilities.supportedChains) || !capabilities.supportedChains.includes(chainId) ||
      !Array.isArray(capabilities.quoteRequestVersions) || !capabilities.quoteRequestVersions.includes(requestVersion) ||
      !Array.isArray(capabilities.quoteResponseVersions) || !capabilities.quoteResponseVersions.includes(responseVersion) ||
      !Number.isSafeInteger(capabilities.maxQuoteValidityMs) || capabilities.maxQuoteValidityMs < 1_000 ||
      capabilities.maxQuoteValidityMs > 60_000 || !capabilities.features ||
      requiredFeatures.some(feature => typeof feature !== "string" || capabilities.features[feature] !== true)) {
    throw new Error("Incompatible quote API capabilities");
  }
  return { compatible: true, chainId, requestVersion, responseVersion,
    maxQuoteValidityMs: capabilities.maxQuoteValidityMs, verifiedFeatures: [...requiredFeatures] };
}

function sameDigest(left, right) {
  if (!/^[0-9a-f]{64}$/.test(left || "") || !/^[0-9a-f]{64}$/.test(right || "")) return false;
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function fail(status, code, traceId, retryable = false) {
  return { status, headers: { "content-type": "application/json", "x-lqc-trace-id": traceId },
    body: { schemaVersion: 1, error: { code, retryable }, traceId } };
}

export function validateCanonicalQuoteRequest(request, now = Date.now()) {
  const keys = request && typeof request === "object" ? Object.keys(request) : [];
  if (!request || keys.length !== QUOTE_REQUEST_FIELDS.length ||
      !QUOTE_REQUEST_FIELDS.every(field => Object.hasOwn(request, field)) ||
      request.version !== 1 || request.type !== "LQC_MULTI_DEX_QUOTE_REQUEST" ||
      request.chainId !== 97 || !ethers.isAddress(request.tokenIn) || !ethers.isAddress(request.tokenOut) ||
      request.tokenIn !== request.tokenIn.toLowerCase() || request.tokenOut !== request.tokenOut.toLowerCase() ||
      request.tokenIn === request.tokenOut || !/^[1-9][0-9]*$/.test(request.amountIn || "") ||
      !Number.isSafeInteger(request.requestedAt) || !Number.isSafeInteger(request.expiresAt) ||
      request.expiresAt <= request.requestedAt || request.expiresAt - request.requestedAt > 60_000 ||
      now < request.requestedAt || now > request.expiresAt || typeof request.clientRequestId !== "string" ||
      request.clientRequestId.length < 1 || request.clientRequestId.length > 128 || !HASH.test(request.requestHash || "")) {
    throw Object.assign(new Error("Invalid canonical quote request"), { code: "INVALID_REQUEST" });
  }
  const { requestHash, ...payload } = request;
  if (ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload))).toLowerCase() !== requestHash) {
    throw Object.assign(new Error("Quote request hash mismatch"), { code: "REQUEST_HASH_MISMATCH" });
  }
  return request;
}

export function createQuoteApiGateway({ clients, verifyProof, limit = 60, windowMs = 60_000,
  providerTimeoutMs = 5_000, maxInFlight = 100, maxCompletedEntries = 10_000, clock = () => Date.now() }) {
  if (!Array.isArray(clients) || clients.length === 0 || !Number.isSafeInteger(limit) || limit < 1 ||
      !Number.isSafeInteger(windowMs) || windowMs < 1_000 || !Number.isSafeInteger(providerTimeoutMs) ||
      providerTimeoutMs < 10 || providerTimeoutMs > 30_000 || !Number.isSafeInteger(maxInFlight) ||
      maxInFlight < 1 || maxInFlight > 1_000 || !Number.isSafeInteger(maxCompletedEntries) ||
      maxCompletedEntries < 1 || maxCompletedEntries > 100_000 || typeof verifyProof !== "function") {
    throw new Error("Invalid quote API gateway policy");
  }
  const approved = clients.map(client => {
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(client?.id || "") || !/^[0-9a-f]{64}$/.test(client.keyDigest || ""))
      throw new Error("Invalid API client policy");
    return Object.freeze({ id: client.id, keyDigest: client.keyDigest });
  });
  if (new Set(approved.map(client => client.id)).size !== approved.length ||
      new Set(approved.map(client => client.keyDigest)).size !== approved.length) {
    throw new Error("Duplicate API client policy");
  }
  const usage = new Map();
  const completed = new Map();
  const inFlight = new Map();
  const metrics = { requests: 0, authenticated: 0, unauthorized: 0, rateLimited: 0,
    succeeded: 0, replayed: 0, busy: 0, failed: 0 };
  const increment = key => { if (metrics[key] < Number.MAX_SAFE_INTEGER) metrics[key] += 1; };
  const authenticate = supplied => {
    let authenticated = null;
    for (const candidate of approved) {
      const matches = sameDigest(candidate.keyDigest, supplied);
      if (matches) authenticated = candidate;
    }
    return authenticated;
  };
  const purgeExpiredCompleted = now => {
    for (const [key, value] of completed) if (value.expiresAt < now) completed.delete(key);
  };

  const handleQuote = async function handleQuote({ authorization, request, traceId }, quote) {
    increment("requests");
    const safeTrace = TRACE.test(traceId || "") ? traceId : crypto.randomUUID();
    const match = /^Bearer ([^\s]+)$/.exec(authorization || "");
    const supplied = match ? hashApiKey(match[1]) : "";
    const client = authenticate(supplied);
    if (!client) { increment("unauthorized"); return fail(401, "UNAUTHORIZED", safeTrace); }
    increment("authenticated");

    const now = clock();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const prior = usage.get(client.id);
    const current = prior?.windowStart === windowStart ? prior : { windowStart, count: 0 };

    try {
      validateCanonicalQuoteRequest(request, now);
      purgeExpiredCompleted(now);
      const replayKey = `${client.id}:${request.clientRequestId}`;
      const previous = completed.get(replayKey);
      if (previous) {
        if (previous.requestHash !== request.requestHash) {
          throw Object.assign(new Error("Quote request id was reused with different content"), { code: "REQUEST_ID_CONFLICT" });
        }
        increment("replayed"); return { status: 200, headers: { "content-type": "application/json", "x-lqc-trace-id": safeTrace,
          "x-lqc-idempotent-replay": "true", "x-ratelimit-limit": String(limit),
          "x-ratelimit-remaining": String(Math.max(0, limit - current.count)) }, body: { ...previous.body, traceId: safeTrace } };
      }
      const pending = inFlight.get(replayKey);
      if (pending) {
        if (pending.requestHash !== request.requestHash) {
          throw Object.assign(new Error("Quote request id was reused with different content"), { code: "REQUEST_ID_CONFLICT" });
        }
        const body = await pending.promise; increment("replayed");
        return { status: 200, headers: { "content-type": "application/json", "x-lqc-trace-id": safeTrace,
          "x-lqc-idempotent-replay": "true", "x-ratelimit-limit": String(limit),
          "x-ratelimit-remaining": String(Math.max(0, limit - current.count)) }, body: { ...body, traceId: safeTrace } };
      }
      if (current.count >= limit) { increment("rateLimited"); return { ...fail(429, "RATE_LIMITED", safeTrace, true),
        headers: { "content-type": "application/json", "x-lqc-trace-id": safeTrace,
          "retry-after": String(Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000))) } }; }
      current.count += 1; usage.set(client.id, current);
      if (typeof quote !== "function") throw Object.assign(new Error("Quote service unavailable"), { code: "SERVICE_UNAVAILABLE" });
      if (inFlight.size >= maxInFlight) {
        throw Object.assign(new Error("Quote service capacity reached"), { code: "SERVICE_BUSY" });
      }
      if (completed.size >= maxCompletedEntries) {
        throw Object.assign(new Error("Quote replay capacity reached"), { code: "SERVICE_BUSY" });
      }
      const promise = (async () => {
        let timeout;
        const timedOut = new Promise((_, reject) => { timeout = setTimeout(() => reject(
          Object.assign(new Error("Quote provider timed out"), { code: "SERVICE_UNAVAILABLE" })), providerTimeoutMs); });
        let result;
        try { result = await Promise.race([Promise.resolve().then(() => quote(request)), timedOut]); }
        finally { clearTimeout(timeout); }
        const verifiedAt = clock();
        if (!result?.proof || result.requestHash !== request.requestHash || result.proof.chainId !== request.chainId ||
            result.proof.tokenIn !== request.tokenIn || result.proof.tokenOut !== request.tokenOut ||
            result.proof.amountIn !== request.amountIn || !Number.isSafeInteger(result.proof.expiresAt) ||
            result.proof.expiresAt < verifiedAt || result.proof.expiresAt > request.expiresAt || request.expiresAt < verifiedAt ||
            !(await verifyProof(result.proof))) {
          throw Object.assign(new Error("Quote service returned mismatched evidence"), { code: "INVALID_QUOTE_EVIDENCE" });
        }
        return { schemaVersion: 1, requestHash: request.requestHash, proof: result.proof, traceId: safeTrace };
      })();
      inFlight.set(replayKey, { requestHash: request.requestHash, promise });
      let body;
      try { body = await promise; } finally { inFlight.delete(replayKey); }
      completed.set(replayKey, { requestHash: request.requestHash, expiresAt: body.proof.expiresAt, body });
      increment("succeeded");
      return { status: 200, headers: { "content-type": "application/json", "x-lqc-trace-id": safeTrace,
        "x-ratelimit-limit": String(limit), "x-ratelimit-remaining": String(limit - current.count) },
        body };
    } catch (error) {
      const code = ["INVALID_REQUEST", "REQUEST_HASH_MISMATCH", "REQUEST_ID_CONFLICT", "INVALID_QUOTE_EVIDENCE"].includes(error?.code)
        ? error.code : error?.code === "NO_ROUTE" ? "NO_ROUTE" : error?.code === "SERVICE_BUSY" ? "SERVICE_BUSY" : "SERVICE_UNAVAILABLE";
      increment(code === "SERVICE_BUSY" ? "busy" : "failed");
      return fail(["SERVICE_UNAVAILABLE", "SERVICE_BUSY"].includes(code) ? 503 : code === "NO_ROUTE" ? 422 : 400, code, safeTrace,
        ["SERVICE_UNAVAILABLE", "SERVICE_BUSY"].includes(code));
    }
  };
  handleQuote.health = () => {
    const checkedAt = clock();
    purgeExpiredCompleted(checkedAt);
    const inFlightRatio = inFlight.size / maxInFlight;
    const replayRatio = completed.size / maxCompletedEntries;
    const status = inFlightRatio >= 1 || replayRatio >= 1 ? "busy" :
      inFlightRatio >= 0.8 || replayRatio >= 0.8 ? "degraded" : "healthy";
    return { schemaVersion: 1, type: "LQC_QUOTE_API_HEALTH", status, checkedAt,
      capacity: { inFlight: inFlight.size, maxInFlight, completed: completed.size, maxCompletedEntries },
      policy: { providerTimeoutMs, rateLimit: limit, rateLimitWindowMs: windowMs }, metrics: { ...metrics } };
  };
  handleQuote.capabilities = () => ({ schemaVersion: 1, type: "LQC_QUOTE_API_CAPABILITIES",
    supportedChains: [97], quoteRequestVersions: [1], quoteResponseVersions: [1],
    maxQuoteValidityMs: 60_000, features: { bestExecutionProof: true, requestHashBinding: true,
      idempotentRetries: true, concurrentRequestCoalescing: true, serviceHealth: true, operationalMetrics: true } });
  return handleQuote;
}
