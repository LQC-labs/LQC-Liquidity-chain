import assert from "node:assert/strict";
import { ethers } from "ethers";
import { createQuoteApiGateway, hashApiKey } from "../scripts/quote-api-gateway.mjs";
import { createQuoteApiHttpAdapter } from "../scripts/quote-api-http.mjs";

const tokenA = "0x0000000000000000000000000000000000000001";
const tokenB = "0x0000000000000000000000000000000000000002";
const now = 1_789_000_000_000;

function quoteRequest() {
  const payload = { version: 1, type: "LQC_MULTI_DEX_QUOTE_REQUEST", chainId: 97, tokenIn: tokenA,
    tokenOut: tokenB, amountIn: "1000", requestedAt: now - 1_000, expiresAt: now + 30_000,
    clientRequestId: "http-quote-1" };
  return { ...payload, requestHash: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(payload))).toLowerCase() };
}

function setup(overrides = {}) {
  const proofHash = ethers.id("http-proof");
  const gateway = createQuoteApiGateway({ clients: [{ id: "partner", keyDigest: hashApiKey("secret") }],
    verifyProof: proof => proof?.proofHash === proofHash, clock: () => now, ...overrides });
  const quote = async request => ({ requestHash: request.requestHash, proof: { proofHash, chainId: 97,
    tokenIn: tokenA, tokenOut: tokenB, amountIn: request.amountIn, expiresAt: request.expiresAt } });
  return createQuoteApiHttpAdapter({ gateway, quote });
}

describe("LQC quote API read-only HTTP adapter", function () {
  it("serves public capabilities and sanitized health", async function () {
    const dispatch = setup();
    const capabilities = await dispatch({ method: "GET", path: "/v1/capabilities" });
    assert.equal(capabilities.status, 200); assert.equal(capabilities.body.type, "LQC_QUOTE_API_CAPABILITIES");
    const health = await dispatch({ method: "GET", path: "/v1/health", headers: { "X-LQC-Trace-ID": "health-1" } });
    assert.equal(health.status, 200); assert.equal(health.body.status, "healthy");
    assert.equal(health.headers["x-lqc-trace-id"], "health-1");
  });

  it("forwards one authenticated canonical quote request", async function () {
    const dispatch = setup();
    const input = quoteRequest();
    const result = await dispatch({ method: "POST", path: "/v1/quote", headers: {
      authorization: "Bearer secret", "content-type": "application/json", "x-lqc-trace-id": "quote-1"
    }, body: JSON.stringify(input) });
    assert.equal(result.status, 200); assert.equal(result.body.requestHash, input.requestHash);
    assert.equal(result.body.traceId, "quote-1");
  });

  it("rejects unknown routes, methods, media types, malformed JSON, and oversized bodies", async function () {
    const dispatch = setup();
    assert.equal((await dispatch({ method: "GET", path: "/unknown" })).status, 404);
    assert.equal((await dispatch({ method: "POST", path: "/v1/health" })).status, 405);
    assert.equal((await dispatch({ method: "POST", path: "/v1/quote", body: "{}" })).status, 415);
    assert.equal((await dispatch({ method: "POST", path: "/v1/quote",
      headers: { "content-type": "application/json" }, body: "{" })).body.error.code, "INVALID_JSON");
    const limited = createQuoteApiHttpAdapter({ gateway: Object.assign(async()=>{}, {
      health:()=>({status:"healthy"}), capabilities:()=>({}) }), quote: async()=>{}, maxBodyBytes: 1_024 });
    const large = await limited({ method: "POST", path: "/v1/quote",
      headers: { "content-type": "application/json" }, body: "x".repeat(1_025) });
    assert.equal(large.status, 413); assert.equal(large.body.error.code, "PAYLOAD_TOO_LARGE");
  });

  it("rejects unsafe adapter construction", function () {
    assert.throws(() => createQuoteApiHttpAdapter({}), /Invalid quote API HTTP adapter policy/);
    const gateway = Object.assign(async()=>{}, { health:()=>({}), capabilities:()=>({}) });
    assert.throws(() => createQuoteApiHttpAdapter({ gateway, quote: async()=>{}, maxBodyBytes: 1_023 }), /Invalid/);
  });
});
