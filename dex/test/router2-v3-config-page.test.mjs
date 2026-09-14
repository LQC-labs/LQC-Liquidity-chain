import assert from "node:assert/strict";
import fs from "node:fs";

describe("Router 2.0 V3 configuration TokenPocket page", function () {
  const script = fs.readFileSync(new URL("../app/router2-v3-config-testnet.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../app/router2-v3-config-testnet.html", import.meta.url), "utf8");

  it("pins BSC Testnet, Signer 1, and the exact deployed contracts", function () {
    assert.match(script, /CHAIN_ID = "0x61"/);
    assert.match(script, /0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB/);
    assert.match(script, /0x1bffac4b93f48d5ea03bae36dbaee6bedd0a73d4/);
    assert.match(script, /0x0465c6460deaece522506e09cddc1b62d6d75c84/);
  });

  it("allows only fee, verified pool, then Registry registration", function () {
    assert.match(script, /allow-fee-2500,allow-verified-pool,register-v3-adapter/);
    assert.match(script, /const guards = \[!before\.fee, before\.fee && !before\.pool, before\.fee && before\.pool && !before\.registered\]/);
    assert.match(html, /수수료 등급 2500 허용/);
    assert.match(html, /검증된 tLQC\/WBNB 풀 허용/);
    assert.match(html, /Registry에 V3 Adapter 등록/);
  });

  it("verifies every result on-chain and sends zero native value", function () {
    for (const selector of ["0x8f5ded0d", "0xa55c0e33", "0x03a349d0", "0x10c931a5"]) assert.match(script, new RegExp(selector));
    assert.match(script, /value: "0x0"/);
    assert.match(script, /BigInt\(receipt\.status\) !== 1n/);
    assert.match(html, /토큰 승인·교환·유동성 이동은 없습니다/);
  });

  it("treats Registry DexNotFound as a pending registration", function () {
    assert.match(script, /catch \(_\) \{ \/\* DexNotFound means registration is still pending\. \*\//);
    assert.match(script, /let dexRaw = "0x"/);
  });
});
