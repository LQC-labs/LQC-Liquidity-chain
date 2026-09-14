import crypto from "node:crypto";

const TRACE = /^[A-Za-z0-9._:-]{1,128}$/;

function response(status, body, headers = {}) {
  return { status, headers: { "content-type": "application/json", ...headers }, body };
}

function error(status, code, traceId) {
  return response(status, { schemaVersion: 1, error: { code, retryable: false }, traceId },
    { "x-lqc-trace-id": traceId });
}

export function createQuoteApiHttpAdapter({ gateway, quote, maxBodyBytes = 32_768 }) {
  if (typeof gateway !== "function" || typeof gateway.health !== "function" ||
      typeof gateway.capabilities !== "function" || typeof quote !== "function" ||
      !Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1_024 || maxBodyBytes > 1_048_576) {
    throw new Error("Invalid quote API HTTP adapter policy");
  }
  return async function dispatch(request = {}) {
    const method = String(request.method || "").toUpperCase();
    const path = String(request.path || "").split("?", 1)[0];
    const headers = Object.fromEntries(Object.entries(request.headers || {}).map(([key, value]) =>
      [key.toLowerCase(), String(value)]));
    const traceId = TRACE.test(headers["x-lqc-trace-id"] || "") ? headers["x-lqc-trace-id"] : crypto.randomUUID();
    if (path === "/v1/capabilities") {
      if (method !== "GET") return error(405, "METHOD_NOT_ALLOWED", traceId);
      return response(200, gateway.capabilities(), { "x-lqc-trace-id": traceId });
    }
    if (path === "/v1/health") {
      if (method !== "GET") return error(405, "METHOD_NOT_ALLOWED", traceId);
      const body = gateway.health();
      return response(body.status === "busy" ? 503 : 200, body, { "x-lqc-trace-id": traceId });
    }
    if (path !== "/v1/quote") return error(404, "NOT_FOUND", traceId);
    if (method !== "POST") return error(405, "METHOD_NOT_ALLOWED", traceId);
    if (!/^application\/json(?:\s*;|$)/i.test(headers["content-type"] || "")) return error(415, "UNSUPPORTED_MEDIA_TYPE", traceId);
    if (typeof request.body !== "string") return error(400, "INVALID_JSON", traceId);
    if (Buffer.byteLength(request.body, "utf8") > maxBodyBytes) return error(413, "PAYLOAD_TOO_LARGE", traceId);
    let body;
    try { body = JSON.parse(request.body); } catch { return error(400, "INVALID_JSON", traceId); }
    if (!body || Array.isArray(body) || typeof body !== "object") return error(400, "INVALID_JSON", traceId);
    return gateway({ authorization: headers.authorization, request: body, traceId }, quote);
  };
}
