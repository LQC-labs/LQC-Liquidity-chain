import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../app/router2-lqc-flow-route-testnet.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../app/router2-lqc-flow-route-testnet.js", import.meta.url), "utf8");

test("LQC Flow route page separates quote onboarding from governed execution caps", () => {
  assert.match(html, /두 번째 경로 연결 1→4/);
  assert.match(html, /Risk Registry는 변경하지 않으며 스왑도 실행하지 않습니다/);
  assert.match(js, /BSC Testnet\(chain 97\)/);
  assert.match(js, /DEX Registry 소유자가 Signer 1이 아닙니다/);
  assert.match(js, /LQC_FLOW ID가 이미 등록되어 있습니다/);
  assert.match(js, /PancakeSwap V3/);
  assert.doesNotMatch(js, /setDexTokenCap|swapExact|privateKey|secret|seed phrase/i);
});
