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
    assert.match(html, /id="tokenSearch"[^>]*placeholder="이름, 심볼 또는 컨트랙트 주소"/);
    assert.match(html, /Router 위험 정책에 등록된 토큰만 표시/);
    assert.match(script, /ui\.buy\.onclick=ui\.buyTab\.onclick/);
    assert.match(script, /ui\.walletNav\.onclick=chooseWallet/);
    assert.match(script, /\[t\.symbol,t\.name,t\.address\]/);
    assert.match(script, /ui\.tokenSearch\.oninput=/);
    assert.match(script, /function approvedRoutes\(path\)/);
    assert.match(script, /No mutually approved DEX route/);
    assert.match(script, /No approved token pair/);
    assert.doesNotMatch(script, /token-option[^\n]*innerHTML/);
  });

  it("offers a market-first order and familiar balance percentage controls", function () {
    assert.match(html, /<strong>시장가<\/strong>/);
    for (const percent of [25, 50, 75, 100]) assert.match(html, new RegExp(`data-percent="${percent}"`));
    assert.match(script, /async function applyBalancePercent\(percent\)/);
    assert.match(script, /available\*BigInt\(percent\)\/100n/);
    assert.match(script, /tokenIn\.address==='native'\?ethers\.parseEther\('\.01'\):0n/);
  });
});
