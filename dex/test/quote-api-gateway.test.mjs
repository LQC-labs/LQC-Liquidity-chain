import assert from "node:assert/strict";
import { ethers } from "ethers";
import { createQuoteApiGateway, hashApiKey, validateCanonicalQuoteRequest,
  validateQuoteApiCapabilities } from "../scripts/quote-api-gateway.mjs";

const tokenA = "0x0000000000000000000000000000000000000001";
const tokenB = "0x0000000000000000000000000000000000000002";
const now = 1_789_000_000_000;
const proofHash = ethers.id("proof");
const proof = input => ({ proofHash, chainId: input.chainId, tokenIn: input.tokenIn, tokenOut: input.tokenOut,
  amountIn: input.amountIn, expiresAt: input.expiresAt });
const verifyProof = value => value?.proofHash === proofHash;

function request(overrides = {}) {
  const payload = { version: 1, type: "LQC_MULTI_DEX_QUOTE_REQUEST", chainId: 97, tokenIn: tokenA,
    tokenOut: tokenB, amountIn: "1000", requestedAt: now - 1_000, expiresAt: now + 30_000,
    clientRequestId: "mobile-quote-7", ...overrides };
  return { ...payload, requestHash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload))).toLowerCase() };
}

describe("LQC read-only quote API gateway foundation", function () {
  it("authenticates a hashed API key and returns traceable proof evidence", async function () {
    const gateway = createQuoteApiGateway({ clients: [{ id: "wallet-partner", keyDigest: hashApiKey("secret") }],
      verifyProof, limit: 2, clock: () => now });
    const input = request();
    const response = await gateway({ authorization: "Bearer secret", request: input, traceId: "trace-001" },
      async value => ({ requestHash: value.requestHash, proof: proof(value) }));
    assert.equal(response.status, 200);
    assert.equal(response.body.requestHash, input.requestHash);
    assert.equal(response.body.traceId, "trace-001");
    assert.equal(response.headers["x-ratelimit-remaining"], "1");
  });

  it("rejects missing credentials without calling the quote provider", async function () {
    let called = false;
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }], verifyProof, clock: () => now });
    const response = await gateway({ request: request(), traceId: "trace-002" }, async () => { called = true; });
    assert.equal(response.status, 401); assert.equal(response.body.error.code, "UNAUTHORIZED"); assert.equal(called, false);
  });

  it("enforces a per-client fixed-window quota with deterministic retry guidance", async function () {
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }],
      verifyProof, limit: 1, windowMs: 60_000, clock: () => now });
    const call = () => gateway({ authorization: "Bearer secret", request: request(), traceId: "trace-003" },
      async value => ({ requestHash: value.requestHash, proof: proof(value) }));
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
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }], verifyProof, clock: () => now });
    const bad = await gateway({ authorization: "Bearer secret", request: request(), traceId: "trace-004" },
      async () => ({ requestHash: ethers.id("wrong"), proof: {} }));
    assert.equal(bad.status, 400); assert.equal(bad.body.error.code, "INVALID_QUOTE_EVIDENCE");
  });

  it("cryptographically verifies proof context instead of trusting the quote provider", async function () {
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }],
      verifyProof, clock: () => now });
    const input = request();
    const wrongPair = await gateway({ authorization: "Bearer secret", request: input, traceId: "trace-006" },
      async value => ({ requestHash: value.requestHash, proof: { ...proof(value), tokenOut: tokenA } }));
    assert.equal(wrongPair.status, 400); assert.equal(wrongPair.body.error.code, "INVALID_QUOTE_EVIDENCE");
    const invalidHash = await gateway({ authorization: "Bearer secret", request: input, traceId: "trace-007" },
      async value => ({ requestHash: value.requestHash, proof: { ...proof(value), proofHash: ethers.id("forged") } }));
    assert.equal(invalidHash.status, 400); assert.equal(invalidHash.body.error.code, "INVALID_QUOTE_EVIDENCE");
  });

  it("returns one completed quote for safe retries and rejects request-id content substitution", async function () {
    let calls = 0;
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }],
      verifyProof, limit: 10, clock: () => now });
    const input = request({ clientRequestId: "stable-request-9" });
    const provider = async value => { calls += 1; return { requestHash: value.requestHash, proof: proof(value) }; };
    const first = await gateway({ authorization: "Bearer secret", request: input, traceId: "trace-008" }, provider);
    const retried = await gateway({ authorization: "Bearer secret", request: input, traceId: "trace-009" }, provider);
    assert.equal(first.status, 200); assert.equal(retried.status, 200); assert.equal(calls, 1);
    assert.equal(retried.headers["x-lqc-idempotent-replay"], "true");
    assert.equal(retried.body.proof.proofHash, first.body.proof.proofHash);
    assert.equal(retried.body.traceId, "trace-009");
    const substituted = request({ clientRequestId: "stable-request-9", amountIn: "2000" });
    const conflict = await gateway({ authorization: "Bearer secret", request: substituted, traceId: "trace-010" }, provider);
    assert.equal(conflict.status, 400); assert.equal(conflict.body.error.code, "REQUEST_ID_CONFLICT"); assert.equal(calls, 1);
  });

  it("coalesces concurrent identical requests and rejects concurrent request-id substitution", async function () {
    let calls = 0, release;
    const waiting = new Promise(resolve => { release = resolve; });
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }],
      verifyProof, limit: 10, clock: () => now });
    const input = request({ clientRequestId: "concurrent-request-4" });
    const provider = async value => { calls += 1; await waiting; return { requestHash: value.requestHash, proof: proof(value) }; };
    const first = gateway({ authorization: "Bearer secret", request: input, traceId: "trace-011" }, provider);
    const duplicate = gateway({ authorization: "Bearer secret", request: input, traceId: "trace-012" }, provider);
    const substituted = request({ clientRequestId: "concurrent-request-4", amountIn: "2000" });
    const conflict = await gateway({ authorization: "Bearer secret", request: substituted, traceId: "trace-013" }, provider);
    assert.equal(conflict.status, 400); assert.equal(conflict.body.error.code, "REQUEST_ID_CONFLICT");
    release();
    const [original, replay] = await Promise.all([first, duplicate]);
    assert.equal(original.status, 200); assert.equal(replay.status, 200); assert.equal(calls, 1);
    assert.equal(replay.headers["x-lqc-idempotent-replay"], "true");
    assert.equal(original.body.traceId, "trace-011"); assert.equal(replay.body.traceId, "trace-012");
  });

  it("times out a stalled provider and releases the request id for a safe retry", async function () {
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }],
      verifyProof, limit: 10, providerTimeoutMs: 10, clock: () => now });
    const input = request({ clientRequestId: "timeout-request-2" });
    const stalled = await gateway({ authorization: "Bearer secret", request: input, traceId: "trace-014" },
      async () => new Promise(() => {}));
    assert.equal(stalled.status, 503); assert.equal(stalled.body.error.code, "SERVICE_UNAVAILABLE");
    const retried = await gateway({ authorization: "Bearer secret", request: input, traceId: "trace-015" },
      async value => ({ requestHash: value.requestHash, proof: proof(value) }));
    assert.equal(retried.status, 200); assert.equal(retried.body.traceId, "trace-015");
  });

  it("rejects unsafe quote-provider timeout policies", function () {
    const options = { clients: [{ id: "partner", keyDigest: hashApiKey("secret") }], verifyProof };
    assert.throws(() => createQuoteApiGateway({ ...options, providerTimeoutMs: 9 }), /Invalid quote API gateway policy/);
    assert.throws(() => createQuoteApiGateway({ ...options, providerTimeoutMs: 30_001 }), /Invalid quote API gateway policy/);
  });

  it("caps distinct in-flight work while still coalescing an identical request", async function () {
    let release;
    const waiting = new Promise(resolve => { release = resolve; });
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }],
      verifyProof, limit: 10, maxInFlight: 1, clock: () => now });
    const firstInput = request({ clientRequestId: "capacity-1" });
    const provider = async value => { await waiting; return { requestHash: value.requestHash, proof: proof(value) }; };
    const first = gateway({ authorization: "Bearer secret", request: firstInput, traceId: "trace-016" }, provider);
    const duplicate = gateway({ authorization: "Bearer secret", request: firstInput, traceId: "trace-017" }, provider);
    const busy = await gateway({ authorization: "Bearer secret",
      request: request({ clientRequestId: "capacity-2" }), traceId: "trace-018" }, provider);
    assert.equal(busy.status, 503); assert.deepEqual(busy.body.error, { code: "SERVICE_BUSY", retryable: true });
    release();
    const [original, replay] = await Promise.all([first, duplicate]);
    assert.equal(original.status, 200); assert.equal(replay.status, 200);
    assert.equal(replay.headers["x-lqc-idempotent-replay"], "true");
  });

  it("rejects unsafe in-flight capacity policies", function () {
    const options = { clients: [{ id: "partner", keyDigest: hashApiKey("secret") }], verifyProof };
    assert.throws(() => createQuoteApiGateway({ ...options, maxInFlight: 0 }), /Invalid quote API gateway policy/);
    assert.throws(() => createQuoteApiGateway({ ...options, maxInFlight: 1_001 }), /Invalid quote API gateway policy/);
  });

  it("bounds completed replay evidence without evicting a still-valid idempotency record", async function () {
    let current = now, calls = 0;
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }],
      verifyProof, limit: 10, maxCompletedEntries: 1, clock: () => current });
    const provider = async value => { calls += 1; return { requestHash: value.requestHash, proof: proof(value) }; };
    const firstInput = request({ clientRequestId: "replay-capacity-1" });
    assert.equal((await gateway({ authorization: "Bearer secret", request: firstInput }, provider)).status, 200);
    const replay = await gateway({ authorization: "Bearer secret", request: firstInput }, provider);
    assert.equal(replay.status, 200); assert.equal(replay.headers["x-lqc-idempotent-replay"], "true");
    const busy = await gateway({ authorization: "Bearer secret",
      request: request({ clientRequestId: "replay-capacity-2" }) }, provider);
    assert.equal(busy.status, 503); assert.equal(busy.body.error.code, "SERVICE_BUSY"); assert.equal(calls, 1);
    current = now + 31_000;
    const fresh = request({ clientRequestId: "replay-capacity-3", requestedAt: current - 1_000, expiresAt: current + 30_000 });
    const accepted = await gateway({ authorization: "Bearer secret", request: fresh }, provider);
    assert.equal(accepted.status, 200); assert.equal(calls, 2);
  });

  it("rejects unsafe completed replay capacity policies", function () {
    const options = { clients: [{ id: "partner", keyDigest: hashApiKey("secret") }], verifyProof };
    assert.throws(() => createQuoteApiGateway({ ...options, maxCompletedEntries: 0 }), /Invalid quote API gateway policy/);
    assert.throws(() => createQuoteApiGateway({ ...options, maxCompletedEntries: 100_001 }), /Invalid quote API gateway policy/);
  });

  it("reports sanitized health, capacity pressure, and expired-record recovery", async function () {
    let current = now, release;
    const waiting = new Promise(resolve => { release = resolve; });
    const gateway = createQuoteApiGateway({ clients: [{ id: "private-partner", keyDigest: hashApiKey("secret-value") }],
      verifyProof, limit: 10, maxInFlight: 1, maxCompletedEntries: 1, clock: () => current });
    const healthy = gateway.health();
    assert.equal(healthy.status, "healthy"); assert.equal(healthy.capacity.inFlight, 0);
    assert.equal(JSON.stringify(healthy).includes("private-partner"), false);
    assert.equal(JSON.stringify(healthy).includes("secret-value"), false);
    const input = request({ clientRequestId: "health-1" });
    const pending = gateway({ authorization: "Bearer secret-value", request: input }, async value => {
      await waiting; return { requestHash: value.requestHash, proof: proof(value) };
    });
    assert.equal(gateway.health().status, "busy");
    release(); assert.equal((await pending).status, 200);
    assert.equal(gateway.health().status, "busy");
    current = now + 31_000;
    const recovered = gateway.health();
    assert.equal(recovered.status, "healthy"); assert.equal(recovered.capacity.completed, 0);
    assert.equal(recovered.checkedAt, current);
  });

  it("publishes a stable, non-sensitive partner compatibility descriptor", function () {
    const gateway = createQuoteApiGateway({ clients: [{ id: "private-partner", keyDigest: hashApiKey("secret-value") }], verifyProof });
    const capabilities = gateway.capabilities();
    assert.deepEqual(capabilities.supportedChains, [97]);
    assert.deepEqual(capabilities.quoteRequestVersions, [1]);
    assert.deepEqual(capabilities.quoteResponseVersions, [1]);
    assert.equal(capabilities.maxQuoteValidityMs, 60_000);
    assert.equal(capabilities.features.bestExecutionProof, true);
    assert.equal(capabilities.features.idempotentRetries, true);
    assert.equal(capabilities.features.serviceHealth, true);
    const encoded = JSON.stringify(capabilities);
    assert.equal(encoded.includes("private-partner"), false);
    assert.equal(encoded.includes("secret-value"), false);
  });

  it("validates partner compatibility and fails closed on capability downgrade", function () {
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }], verifyProof });
    const capabilities = gateway.capabilities();
    const verified = validateQuoteApiCapabilities(capabilities);
    assert.equal(verified.compatible, true); assert.equal(verified.chainId, 97);
    assert.deepEqual(verified.verifiedFeatures,
      ["bestExecutionProof", "requestHashBinding", "idempotentRetries", "serviceHealth"]);
    assert.throws(() => validateQuoteApiCapabilities({ ...capabilities, supportedChains: [56] }), /Incompatible/);
    assert.throws(() => validateQuoteApiCapabilities({ ...capabilities, quoteRequestVersions: [2] }), /Incompatible/);
    assert.throws(() => validateQuoteApiCapabilities({ ...capabilities,
      features: { ...capabilities.features, bestExecutionProof: false } }), /Incompatible/);
    assert.throws(() => validateQuoteApiCapabilities({ ...capabilities, maxQuoteValidityMs: 60_001 }), /Incompatible/);
  });

  it("supports explicit, validated compatibility requirements", function () {
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }], verifyProof });
    const capabilities = gateway.capabilities();
    const verified = validateQuoteApiCapabilities(capabilities,
      { chainId: 97, requestVersion: 1, responseVersion: 1, requiredFeatures: ["concurrentRequestCoalescing"] });
    assert.deepEqual(verified.verifiedFeatures, ["concurrentRequestCoalescing"]);
    assert.throws(() => validateQuoteApiCapabilities(capabilities, { chainId: 0 }), /Incompatible/);
    assert.throws(() => validateQuoteApiCapabilities(capabilities, { requiredFeatures: [""] }), /Incompatible/);
  });

  it("uses stable errors without exposing provider details", async function () {
    const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }], verifyProof, clock: () => now });
    const response = await gateway({ authorization: "Bearer secret", request: request(), traceId: "trace-005" },
      async () => { throw new Error("private upstream rpc details"); });
    assert.equal(response.status, 503); assert.deepEqual(response.body.error, { code: "SERVICE_UNAVAILABLE", retryable: true });
    assert.equal(JSON.stringify(response).includes("private upstream"), false);
  });
});
