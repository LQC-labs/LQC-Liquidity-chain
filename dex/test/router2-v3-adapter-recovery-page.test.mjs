import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../app/router2-v3-adapter-recovery-testnet.html", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../app/router2-v3-adapter-recovery-testnet.js", import.meta.url), "utf8");
const bundle = JSON.parse(fs.readFileSync(new URL("../deployments/router2-v3-adapter-recovery-bsc-testnet-97.json", import.meta.url), "utf8"));

test("V3 adapter recovery page pins the corrected ABI and safe ordered cutover", () => {
  assert.equal(bundle.network.chainId, 97);
  assert.equal(bundle.correctedExactInputSelector, "0xc04b8d59");
  assert.equal(bundle.fee, 2500);
  assert.match(html, /1→6/);
  assert.match(html, /비활성화 → 주소 교체 → 재활성화/);
  assert.match(js, /4-1 기존 DEX 비활성화/);
  assert.match(js, /4-2 신규 Adapter 주소 교체/);
  assert.match(js, /4-3 신규 DEX 재활성화/);
  assert.match(js, /BSC Testnet\(chain 97\)/);
  assert.doesNotMatch(js, /privateKey|secret|seed phrase/i);
});
