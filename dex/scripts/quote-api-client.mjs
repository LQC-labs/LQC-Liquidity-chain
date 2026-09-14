import { validateCanonicalQuoteRequest, validateQuoteApiCapabilities } from "./quote-api-gateway.mjs";

async function readJson(response) {
  const type = String(response?.headers?.get?.("content-type") || "");
  if (!response || !/^application\/json(?:\s*;|$)/i.test(type)) throw new Error("Invalid quote API response");
  try { return await response.json(); } catch { throw new Error("Invalid quote API response"); }
}

export function createQuoteApiClient({ baseUrl, apiKey, fetchImpl = globalThis.fetch,
  timeoutMs = 5_000, maxRetries = 1, retryDelayMs = 100, delay = ms => new Promise(resolve => setTimeout(resolve, ms)),
  clock = () => Date.now(), validateQuoteResponse }) {
  let url;
  try { url = new URL(baseUrl); } catch { throw new Error("Invalid quote API client policy"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      typeof apiKey !== "string" || apiKey.length < 16 || apiKey.length > 512 || /\s/.test(apiKey) ||
      typeof fetchImpl !== "function" || !Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > 30_000 ||
      !Number.isSafeInteger(maxRetries) || maxRetries < 0 || maxRetries > 2 || !Number.isSafeInteger(retryDelayMs) ||
      retryDelayMs < 10 || retryDelayMs > 1_000 || typeof delay !== "function" || typeof clock !== "function" ||
      typeof validateQuoteResponse !== "function") {
    throw new Error("Invalid quote API client policy");
  }
  const root = url.href.replace(/\/$/, "");
  const requestOnce = async (path, options = {}, accepted = [200]) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${root}${path}`, { ...options, redirect: "error", signal: controller.signal });
      const body = await readJson(response);
      if (!accepted.includes(response.status)) {
        const error = new Error("Quote API request failed");
        error.code = typeof body?.error?.code === "string" ? body.error.code : "INVALID_RESPONSE";
        error.retryable = body?.error?.retryable === true;
        throw error;
      }
      return body;
    } catch (cause) {
      if (cause?.message === "Quote API request failed" || cause?.message === "Invalid quote API response") throw cause;
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
      if (body?.type !== "LQC_QUOTE_API_HEALTH" || !["healthy", "degraded", "busy"].includes(body.status) ||
          !Number.isSafeInteger(body.checkedAt)) throw new Error("Invalid quote API health");
      return body;
    },
    async quote(input) {
      const body = await request("/v1/quote", { method: "POST", headers: {
        authorization: `Bearer ${apiKey}`, "content-type": "application/json"
      }, body: JSON.stringify(input) }, [200], () => validateCanonicalQuoteRequest(input, clock()));
      if (!(await validateQuoteResponse(input, body))) throw new Error("Invalid quote API proof response");
      return body;
    }
  });
}
