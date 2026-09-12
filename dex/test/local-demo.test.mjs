import assert from "node:assert/strict";
import fs from "node:fs";

describe("local swap demo safety", function () {
  it("is clearly simulation-only and cannot submit a wallet transaction", function () {
    const html = fs.readFileSync(new URL("../app/local-demo.html", import.meta.url), "utf8");
    assert.match(html, /LOCAL DEMO/);
    assert.match(html, /실제 거래 없음/);
    assert.match(html, /토큰을 전송하지 않습니다/);
    assert.doesNotMatch(html, /window\.ethereum/);
    assert.doesNotMatch(html, /sendTransaction/);
    assert.doesNotMatch(html, /eth_requestAccounts/);
  });
});
