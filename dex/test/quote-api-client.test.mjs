import assert from "node:assert/strict";
import { ethers } from "ethers";
import { createQuoteApiClient } from "../scripts/quote-api-client.mjs";

const now = 1_789_000_000_000;
const tokenA = "0x0000000000000000000000000000000000000001";
const tokenB = "0x0000000000000000000000000000000000000002";
function request() {
  const payload = { version: 1, type: "LQC_MULTI_DEX_QUOTE_REQUEST", chainId: 97, tokenIn: tokenA,
    tokenOut: tokenB, amountIn: "1000", requestedAt: now - 1_000, expiresAt: now + 30_000, clientRequestId: "client-1" };
  return { ...payload, requestHash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload))).toLowerCase() };
}
const jsonResponse = (status, body) => ({ status, headers: { get: name => name.toLowerCase() === "content-type" ? "application/json" : null },
  json: async () => body });

describe("LQC quote API reference client", function () {
  it("checks capabilities and health without sending credentials", async function () {
    const calls = [];
    const fetchImpl = async (url, options) => { calls.push({ url, options });
      if (url.endsWith("/v1/capabilities")) return jsonResponse(200, { schemaVersion: 1, type: "LQC_QUOTE_API_CAPABILITIES",
        supportedChains: [97], quoteRequestVersions: [1], quoteResponseVersions: [1], maxQuoteValidityMs: 60_000,
        features: { bestExecutionProof: true, requestHashBinding: true, idempotentRetries: true, serviceHealth: true } });
      return jsonResponse(200, { schemaVersion: 1, type: "LQC_QUOTE_API_HEALTH", status: "healthy", checkedAt: now, capacity: {}, policy: {} });
    };
    const client = createQuoteApiClient({ baseUrl: "https://quotes.example/", apiKey: "0123456789abcdef", fetchImpl,
      clock: () => now, validateQuoteResponse: async()=>true });
    assert.equal((await client.capabilities()).compatible, true);
    assert.equal((await client.health()).status, "healthy");
    assert.equal(calls.every(call => !call.options.headers?.authorization), true);
  });

  it("sends a canonical quote with bearer authentication and validates the proof response", async function () {
    let seen;
    const input = request(), proof = { proofHash: ethers.id("proof") };
    const client = createQuoteApiClient({ baseUrl: "https://quotes.example", apiKey: "0123456789abcdef",
      fetchImpl: async (url, options) => { seen = { url, options }; return jsonResponse(200,
        { schemaVersion: 1, requestHash: input.requestHash, proof, traceId: "client-trace" }); }, clock: () => now,
      validateQuoteResponse: async (original, response) => original.requestHash === response.requestHash && response.proof === proof });
    const result = await client.quote(input);
    assert.equal(result.proof, proof); assert.equal(seen.url, "https://quotes.example/v1/quote");
    assert.equal(seen.options.headers.authorization, "Bearer 0123456789abcdef");
    assert.deepEqual(JSON.parse(seen.options.body), input);
  });

  it("rejects insecure endpoints, weak credentials, malformed responses, and invalid proofs", async function () {
    const base = { apiKey: "0123456789abcdef", fetchImpl: async()=>jsonResponse(200, {}), validateQuoteResponse: async()=>true };
    assert.throws(() => createQuoteApiClient({ ...base, baseUrl: "http://quotes.example" }), /Invalid quote API client policy/);
    assert.throws(() => createQuoteApiClient({ ...base, baseUrl: "https://user:pass@quotes.example" }), /Invalid/);
    assert.throws(() => createQuoteApiClient({ ...base, baseUrl: "https://quotes.example", apiKey: "short" }), /Invalid/);
    const client = createQuoteApiClient({ ...base, baseUrl: "https://quotes.example", clock:()=>now, validateQuoteResponse: async()=>false });
    await assert.rejects(() => client.quote(request()), /Invalid quote API proof response/);
  });

  it("returns sanitized stable errors without exposing the API key", async function () {
    const secret = "very-secret-api-key-value";
    const client = createQuoteApiClient({ baseUrl: "https://quotes.example", apiKey: secret, clock:()=>now, maxRetries: 0,
      fetchImpl: async()=>jsonResponse(503, { error: { code: "SERVICE_BUSY", retryable: true } }), validateQuoteResponse: async()=>true });
    await assert.rejects(async()=>client.quote(request()), error => {
      assert.equal(error.code, "SERVICE_BUSY"); assert.equal(error.retryable, true);
      assert.equal(String(error).includes(secret), false); return true;
    });
  });

  it("retries only retryable failures with the identical idempotent request", async function () {
    const input = request(), seen = [], delays = [];
    let calls = 0;
    const client = createQuoteApiClient({ baseUrl: "https://quotes.example", apiKey: "0123456789abcdef", clock:()=>now,
      maxRetries: 1, retryDelayMs: 25, delay: async ms => { delays.push(ms); },
      fetchImpl: async (url, options) => { calls += 1; seen.push({ url, authorization: options.headers.authorization,
        body: options.body, redirect: options.redirect });
        if (calls === 1) return jsonResponse(503, { error: { code: "SERVICE_BUSY", retryable: true } });
        return jsonResponse(200, { schemaVersion: 1, requestHash: input.requestHash, proof: {}, traceId: "retry-ok" });
      }, validateQuoteResponse: async (original, response) => original.requestHash === response.requestHash });
    const result = await client.quote(input);
    assert.equal(result.traceId, "retry-ok"); assert.equal(calls, 2); assert.deepEqual(delays, [25]);
    assert.equal(seen[0].body, seen[1].body); assert.equal(seen[0].authorization, seen[1].authorization);
    assert.equal(seen.every(value => value.redirect === "error"), true);
  });

  it("does not retry non-retryable errors or an expired request", async function () {
    let calls = 0, current = now;
    const client = createQuoteApiClient({ baseUrl: "https://quotes.example", apiKey: "0123456789abcdef", clock:()=>current,
      maxRetries: 2, retryDelayMs: 10, delay: async () => { current = now + 31_000; },
      fetchImpl: async()=>{ calls += 1; return jsonResponse(503, { error: { code: "SERVICE_BUSY", retryable: true } }); },
      validateQuoteResponse: async()=>true });
    await assert.rejects(()=>client.quote(request()), /Invalid canonical quote request/);
    assert.equal(calls, 1);
    const rejected = createQuoteApiClient({ baseUrl: "https://quotes.example", apiKey: "0123456789abcdef", clock:()=>now,
      maxRetries: 2, fetchImpl: async()=>{ calls += 1; return jsonResponse(400, { error: { code: "INVALID_REQUEST", retryable: false } }); },
      validateQuoteResponse: async()=>true });
    await assert.rejects(()=>rejected.quote(request()), error => error.code === "INVALID_REQUEST");
    assert.equal(calls, 2);
  });

  it("rejects unsafe retry policies", function () {
    const base = { baseUrl: "https://quotes.example", apiKey: "0123456789abcdef", fetchImpl: async()=>{}, validateQuoteResponse: async()=>true };
    assert.throws(()=>createQuoteApiClient({ ...base, maxRetries: 3 }), /Invalid quote API client policy/);
    assert.throws(()=>createQuoteApiClient({ ...base, retryDelayMs: 9 }), /Invalid quote API client policy/);
    assert.throws(()=>createQuoteApiClient({ ...base, retryDelayMs: 1_001 }), /Invalid quote API client policy/);
  });
});
