import { validateCanonicalQuoteRequest, validateQuoteApiCapabilities, validateQuoteApiHealth } from "./quote-api-gateway.mjs";

const TRACE = /^[A-Za-z0-9._:-]{1,128}$/;

function validateQuoteEnvelope(request, body, now) {
  const fields = body && typeof body === "object" ? Object.keys(body) : [];
  if (fields.length !== 4 || !["schemaVersion", "requestHash", "proof", "traceId"].every(field => Object.hasOwn(body, field)) ||
      body.schemaVersion !== 1 || body.requestHash !== request.requestHash || !TRACE.test(body.traceId || "") ||
      !body.proof || body.proof.chainId !== request.chainId || body.proof.tokenIn !== request.tokenIn ||
      body.proof.tokenOut !== request.tokenOut || body.proof.amountIn !== request.amountIn ||
      !Number.isSafeInteger(body.proof.expiresAt) || body.proof.expiresAt < now || body.proof.expiresAt > request.expiresAt) {
    throw new Error("Invalid quote API proof response");
  }
}

async function readJson(response, maxResponseBytes) {
  const type = String(response?.headers?.get?.("content-type") || "");
  if (!response || !/^application\/json(?:\s*;|$)/i.test(type)) throw new Error("Invalid quote API response");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^[0-9]+$/.test(declared) || BigInt(declared) > BigInt(maxResponseBytes)))
    throw new Error("Quote API response too large");
  try {
    const raw = await response.text();
    if (Buffer.byteLength(raw, "utf8") > maxResponseBytes) throw new Error("Quote API response too large");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.message === "Quote API response too large") throw error;
    throw new Error("Invalid quote API response");
  }
}

export function createQuoteApiClient({ baseUrl, apiKey, fetchImpl = globalThis.fetch,
  timeoutMs = 5_000, maxRetries = 1, retryDelayMs = 100, delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
  maxResponseBytes = 262_144, maxHealthAgeMs = 60_000, clock = () => Date.now(), validateQuoteResponse }) {
  let url;
  try { url = new URL(baseUrl); } catch { throw new Error("Invalid quote API client policy"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      typeof apiKey !== "string" || apiKey.length < 16 || apiKey.length > 512 || /\s/.test(apiKey) ||
      typeof fetchImpl !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30_000 ||
      !Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 2 || !Number.isSafeInteger(retryDelayMs) ||
      retryDelayMs < 10 || retryDelayMs > 1_000 || !Number.isSafeInteger(maxResponseBytes) ||
      maxResponseBytes < 1_024 || maxResponseBytes > 1_048_576 || !Number.isSafeInteger(maxHealthAgeMs) ||
      maxHealthAgeMs < 1_000 || maxHealthAgeMs > 300_000 || typeof delay !== "function" || typeof clock !== "function" ||
      typeof validateQuoteResponse !== "function") {
    throw new Error("Invalid quote API client policy");
  }
  const root = url.href.replace(/\/$/, "");
  const requestOnce = async (path, options = {}, accepted = [200]) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${root}${path}`, { ...options, redirect: "error", signal: controller.signal });
      const body = await readJson(response, maxResponseBytes);
      if (!accepted.includes(response.status)) {
        const error = new Error("Quote API request failed");
        error.code = typeof body?.error?.code === "string" ? body.error.code : "INVALID_RESPONSE";
        error.retryable = body?.error?.retryable === true;
        throw error;
      }
      return body;
    } catch (cause) {
      if (["Quote API request failed", "Invalid quote API response", "Quote API response too large"].includes(cause?.message)) throw cause;
      throw Object.assign(new Error("Quote API unavailable"), { code: "SERVICE_UNAVAILABLE", retryable: true });
    } finally { clearTimeout(timeout); }
  };
  const request = async (path, options = {}, accepted = [200], beforeAttempt = () => {}) => {
    for (let attempt = 0; ; attempt++) {
      beforeAttempt();
      try { return await requestOnce(path, options, accepted); }
      catch (error) {
        if (attempt >= maxRetries || error?.retryable !== true) throw error;
        await delay(retryDelayMs * (attempt + 1));
      }
    }
  };
  return Object.freeze({
    async capabilities(requirements) {
      const body = await request("/v1/capabilities");
      return validateQuoteApiCapabilities(body, requirements);
    },
    async health() {
      const body = await request("/v1/health", {}, [200, 503]);
      return validateQuoteApiHealth(body, clock(), maxHealthAgeMs);
    },
    async quote(input) {
      const body = await request("/v1/quote", { method: "POST", headers: {
        authorization: `Bearer ${apiKey}`, "content-type": "application/json"
      }, body: JSON.stringify(input) }, [200], () => validateCanonicalQuoteRequest(input, clock()));
      validateQuoteEnvelope(input, body, clock());
      if (!(await validateQuoteResponse(input, body))) throw new Error("Invalid quote API proof response");
      return body;
    }
  });
}
