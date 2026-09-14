import assert from "node:assert/strict";
import { ethers } from "ethers";
import { createQuoteApiGateway, hashApiKey, validateCanonicalQuoteRequest } from "../scripts/quote-api-gateway.mjs";

const tokenA = "0x0000000000000000000000000000000000000001";
const tokenB = "0x0000000000000000000000000000000000000002";
const now = 1_789_000_000_000;

function request(overrides = {}) {
  const payload = { version: 1, type: "LQC_MULTI_DEX_QUOTE_REQUEST", chainId: 97, tokenIn: tokenA,
    tokenOut: tokenB, amountIn: "1000", requestedAt: now - 1_000, expiresAt: now + 30_000,
    clientRequestId: "mobile-quote-7", ...overrides };
  return { ...payload, requestHash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload))).toLowerCase() };
}

describe("LQC read-only quote API gateway foundation", function () {
  it("authenticates a hashed API key and returns traceable proof evidence", async function () {
    const gateway = createQuoteApiGateway({ clients: [{ id: "wallet-partner", keyDigest: hashApiKey("secret") }],
      limit: 2, clock: () => now });
    const input = request();
    const response = await gateway({ authorization: "Bearer secret", request: input, traceId: "trace-001" },
      async value => ({ requestHash: value.requestHash, proof: { proofHash: ethers.id("proof") } }));
    assert.equal(response.status, 200);
    assert.equal(response.body.requestHash, input.requestHash);
    assert.equal(response.body.traceId, "trace-001");
    assert.equal(response.headers["x-ratelimit-remaining"], "1");
  });

  it("rejects missing credentials without calling the quote provider", async function () {
    let called = false;
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }], clock: () => now });
    const response = await gateway({ request: request(), traceId: "trace-002" }, async () => { called = true; });
    assert.equal(response.status, 401); assert.equal(response.body.error.code, "UNAUTHORIZED"); assert.equal(called, false);
  });

  it("enforces a per-client fixed-window quota with deterministic retry guidance", async function () {
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }],
      limit: 1, windowMs: 60_000, clock: () => now });
    const call = () => gateway({ authorization: "Bearer secret", request: request(), traceId: "trace-003" },
      async value => ({ requestHash: value.requestHash, proof: { proofHash: ethers.id("proof") } }));
    assert.equal((await call()).status, 200);
    const blocked = await call();
    assert.equal(blocked.status, 429); assert.equal(blocked.body.error.code, "RATE_LIMITED");
    assert.match(blocked.headers["retry-after"], /^[1-9][0-9]*$/);
  });

  it("fails closed for expired, tampered, cross-chain, and mismatched quote evidence", async function () {
    assert.throws(() => validateCanonicalQuoteRequest(request({ chainId: 56 }), now), /Invalid canonical/);
    const tampered = request(); tampered.amountIn = "1001";
    assert.throws(() => validateCanonicalQuoteRequest(tampered, now), /hash mismatch/);
    assert.throws(() => validateCanonicalQuoteRequest(request({ expiresAt: now - 1 }), now), /Invalid canonical/);
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }], clock: () => now });
    const bad = await gateway({ authorization: "Bearer secret", request: request(), traceId: "trace-004" },
      async () => ({ requestHash: ethers.id("wrong"), proof: {} }));
    assert.equal(bad.status, 400); assert.equal(bad.body.error.code, "INVALID_QUOTE_EVIDENCE");
  });

  it("uses stable errors without exposing provider details", async function () {
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }], clock: () => now });
    const response = await gateway({ authorization: "Bearer secret", request: request(), traceId: "trace-005" },
      async () => { throw new Error("private upstream rpc details"); });
    assert.equal(response.status, 503); assert.deepEqual(response.body.error, { code: "SERVICE_UNAVAILABLE", retryable: true });
    assert.equal(JSON.stringify(response).includes("private upstream"), false);
  });
});
