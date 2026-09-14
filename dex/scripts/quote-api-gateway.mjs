import crypto from "node:crypto";
import { ethers } from "ethers";

const HASH = /^0x[0-9a-f]{64}$/;
const TRACE = /^[A-Za-z0-9._:-]{1,128}$/;

export const hashApiKey = value => crypto.createHash("sha256").update(String(value)).digest("hex");

function sameDigest(left, right) {
  if (!/^[0-9a-f]{64}$/.test(left || "") || !/^[0-9a-f]{64}$/.test(right || "")) return false;
  return crypto.timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function fail(status, code, traceId, retryable = false) {
  return { status, headers: { "content-type": "application/json", "x-lqc-trace-id": traceId },
    body: { schemaVersion: 1, error: { code, retryable }, traceId } };
}

export function validateCanonicalQuoteRequest(request, now = Date.now()) {
  if (!request || request.version !== 1 || request.type !== "LQC_MULTI_DEX_QUOTE_REQUEST" ||
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

export function createQuoteApiGateway({ clients, verifyProof, limit = 60, windowMs = 60_000, clock = () => Date.now() }) {
  if (!Array.isArray(clients) || clients.length === 0 || !Number.isSafeInteger(limit) || limit < 1 ||
      !Number.isSafeInteger(windowMs) || windowMs < 1_000 || typeof verifyProof !== "function") {
    throw new Error("Invalid quote API gateway policy");
  }
  const approved = clients.map(client => {
    if (!client?.id || !/^[0-9a-f]{64}$/.test(client.keyDigest || "")) throw new Error("Invalid API client policy");
    return { id: String(client.id), keyDigest: client.keyDigest };
  });
  const usage = new Map();
  const completed = new Map();
  const inFlight = new Map();

  return async function handleQuote({ authorization, request, traceId }, quote) {
    const safeTrace = TRACE.test(traceId || "") ? traceId : crypto.randomUUID();
    const match = /^Bearer ([^\s]+)$/.exec(authorization || "");
    const supplied = match ? hashApiKey(match[1]) : "";
    const client = approved.find(item => sameDigest(item.keyDigest, supplied));
    if (!client) return fail(401, "UNAUTHORIZED", safeTrace);

    const now = clock();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const prior = usage.get(client.id);
    const current = prior?.windowStart === windowStart ? prior : { windowStart, count: 0 };
    if (current.count >= limit) return { ...fail(429, "RATE_LIMITED", safeTrace, true),
      headers: { "content-type": "application/json", "x-lqc-trace-id": safeTrace,
        "retry-after": String(Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000))) } };
    current.count += 1; usage.set(client.id, current);

    try {
      validateCanonicalQuoteRequest(request, now);
      for (const [key, value] of completed) if (value.expiresAt < now) completed.delete(key);
      const replayKey = `${client.id}:${request.clientRequestId}`;
      const previous = completed.get(replayKey);
      if (previous) {
        if (previous.requestHash !== request.requestHash) {
          throw Object.assign(new Error("Quote request id was reused with different content"), { code: "REQUEST_ID_CONFLICT" });
        }
        return { status: 200, headers: { "content-type": "application/json", "x-lqc-trace-id": safeTrace,
          "x-lqc-idempotent-replay": "true", "x-ratelimit-limit": String(limit),
          "x-ratelimit-remaining": String(limit - current.count) }, body: { ...previous.body, traceId: safeTrace } };
      }
      const pending = inFlight.get(replayKey);
      if (pending) {
        if (pending.requestHash !== request.requestHash) {
          throw Object.assign(new Error("Quote request id was reused with different content"), { code: "REQUEST_ID_CONFLICT" });
        }
        const body = await pending.promise;
        return { status: 200, headers: { "content-type": "application/json", "x-lqc-trace-id": safeTrace,
          "x-lqc-idempotent-replay": "true", "x-ratelimit-limit": String(limit),
          "x-ratelimit-remaining": String(limit - current.count) }, body: { ...body, traceId: safeTrace } };
      }
      if (typeof quote !== "function") throw Object.assign(new Error("Quote service unavailable"), { code: "SERVICE_UNAVAILABLE" });
      const promise = (async () => {
        const result = await quote(request);
        if (!result?.proof || result.requestHash !== request.requestHash || result.proof.chainId !== request.chainId ||
            result.proof.tokenIn !== request.tokenIn || result.proof.tokenOut !== request.tokenOut ||
            result.proof.amountIn !== request.amountIn || result.proof.expiresAt > request.expiresAt ||
            !(await verifyProof(result.proof))) {
          throw Object.assign(new Error("Quote service returned mismatched evidence"), { code: "INVALID_QUOTE_EVIDENCE" });
        }
        return { schemaVersion: 1, requestHash: request.requestHash, proof: result.proof, traceId: safeTrace };
      })();
      inFlight.set(replayKey, { requestHash: request.requestHash, promise });
      let body;
      try { body = await promise; } finally { inFlight.delete(replayKey); }
      completed.set(replayKey, { requestHash: request.requestHash, expiresAt: request.expiresAt, body });
      return { status: 200, headers: { "content-type": "application/json", "x-lqc-trace-id": safeTrace,
        "x-ratelimit-limit": String(limit), "x-ratelimit-remaining": String(limit - current.count) },
        body };
    } catch (error) {
      const code = ["INVALID_REQUEST", "REQUEST_HASH_MISMATCH", "REQUEST_ID_CONFLICT", "INVALID_QUOTE_EVIDENCE"].includes(error?.code)
        ? error.code : error?.code === "NO_ROUTE" ? "NO_ROUTE" : "SERVICE_UNAVAILABLE";
      return fail(code === "SERVICE_UNAVAILABLE" ? 503 : code === "NO_ROUTE" ? 422 : 400, code, safeTrace,
        code === "SERVICE_UNAVAILABLE");
    }
  };
}
