import assert from "node:assert/strict";
import fs from "node:fs";

describe("Router 2.0 best-route preflight page", function () {
  const js = fs.readFileSync(new URL("../app/router2-best-route-preflight-testnet.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../app/router2-best-route-preflight-testnet.html", import.meta.url), "utf8");
  it("is read-only and compares exactly two reviewed routes", function () {
    assert.match(html, /읽기 전용/); assert.match(js, /!== 2n/); assert.match(js, /ids\[0\] !== V3_ID \|\| ids\[1\] !== FLOW_ID/); assert.doesNotMatch(js, /eth_sendTransaction/);
  });
  it("uses the official V3 Quoter directly after the adapter QuoteFailed diagnosis", function () {
    assert.match(js, /V3_QUOTER/); assert.match(js, /0xcdca1753/); assert.match(js, /call\(V3_QUOTER, v3QuoteData\(v3Path\)\)/); assert.doesNotMatch(js, /call\(V3_ADAPTER, flowQuoteData/);
  });
  it("requires both execution adapters and remaining daily capacity", function () {
    assert.match(js, /0x721717c0/); assert.match(js, /MAX_DAY - used < AMOUNT/); assert.match(js, /call\(FLOW_ADAPTER, flowQuoteData\(flowPath\)\)/);
  });
  it("stores a proof candidate with a 99 percent minimum and quote block", function () {
    assert.match(js, /output \* 99n \/ 100n/); assert.match(js, /OFFCHAIN_PROOF_PREFLIGHT/); assert.match(js, /localStorage\.setItem\(KEY/);
  });
});
