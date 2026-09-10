import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "app/index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "app/app.js"), "utf8");

describe("LQC simple trading UI", function () {
  it("keeps the primary trade flow simple while preserving optional Router evidence", function () {
    assert.match(html, /id="buyTab"[^>]*>Buy<\/button>/);
    assert.match(html, /id="sellTab"[^>]*>Sell<\/button>/);
    assert.match(html, /<details class="trade-details"/);
    assert.match(html, /id="routeSummary">최적 경로 자동 선택/);
    assert.match(html, /최적가 자동/);
    assert.match(html, /비수탁 거래/);
    assert.match(html, /Gasless 조건 확인/);
    assert.match(html, /<nav class="mobile-nav" aria-label="주요 메뉴">/);
    assert.match(script, /ui\.buy\.onclick=ui\.buyTab\.onclick/);
    assert.match(script, /ui\.walletNav\.onclick=chooseWallet/);
  });
});
