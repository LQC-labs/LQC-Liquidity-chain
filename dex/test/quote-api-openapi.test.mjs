import assert from "node:assert/strict";
import fs from "node:fs";

const spec = JSON.parse(fs.readFileSync(new URL("../docs/quote-api-openapi.json", import.meta.url), "utf8"));

describe("LQC quote API OpenAPI contract", function () {
  it("pins the implemented read-only routes and bearer-protected quote operation", function () {
    assert.equal(spec.openapi, "3.1.0");
    assert.deepEqual(Object.keys(spec.paths).sort(), ["/v1/capabilities", "/v1/health", "/v1/quote"]);
    assert.deepEqual(Object.keys(spec.paths["/v1/capabilities"]), ["get"]);
    assert.deepEqual(Object.keys(spec.paths["/v1/health"]), ["get"]);
    assert.deepEqual(spec.paths["/v1/quote"].post.security, [{ bearerAuth: [] }]);
    assert.equal(spec.components.securitySchemes.bearerAuth.scheme, "bearer");
  });

  it("pins canonical chain, versions, hashes, addresses, and bounded client request ids", function () {
    const request = spec.components.schemas.QuoteRequest;
    assert.equal(request.additionalProperties, false);
    assert.equal(request.properties.version.const, 1);
    assert.equal(request.properties.chainId.const, 97);
    assert.equal(request.properties.type.const, "LQC_MULTI_DEX_QUOTE_REQUEST");
    assert.equal(request.properties.clientRequestId.maxLength, 128);
    assert.equal(spec.components.schemas.Address.pattern, "^0x[0-9a-f]{40}$");
    assert.equal(spec.components.schemas.Hash32.pattern, "^0x[0-9a-f]{64}$");
    assert.equal(spec.components.schemas.Capabilities.properties.maxQuoteValidityMs.maximum, 60_000);
  });

  it("documents every stable HTTP failure class exposed by the adapter and gateway", function () {
    const responses = spec.paths["/v1/quote"].post.responses;
    assert.deepEqual(Object.keys(responses).sort(), ["200", "400", "401", "413", "415", "422", "429", "503"]);
    for (const status of ["400", "401", "413", "415", "422", "429", "503"])
      assert.equal(responses[status].$ref, "#/components/responses/Error");
    assert.deepEqual(spec.components.schemas.Health.properties.status.enum, ["healthy", "degraded", "busy"]);
  });

  it("uses a placeholder server and contains no credential material", function () {
    const encoded = JSON.stringify(spec);
    assert.equal(spec.servers[0].url, "https://sandbox.invalid");
    assert.equal(/api[_-]?key|private[_-]?key|bearer [A-Za-z0-9]/i.test(encoded), false);
  });

  it("requires non-cacheable JSON responses in the HTTP implementation", function () {
    const source = fs.readFileSync(new URL("../scripts/quote-api-http.mjs", import.meta.url), "utf8");
    assert.match(source, /"cache-control": "no-store"/);
    assert.match(source, /"x-content-type-options": "nosniff"/);
  });
});
