import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../app/lending-stage3-live-preflight-testnet.html");
const js = read("../app/lending-stage3-live-preflight-testnet.js");
const manifest = JSON.parse(read("../deployments/lending-stage3-manifest-bsc-testnet-97.json"));

describe("LQC Lending Stage-3 live preflight page", function () {
  it("shows the three numbered operator steps", function () {
    for (const text of ["1. Stage 3 읽기 전용 사전검증", "2. 승인 배포 화면으로 이동", "3. Core 단일 배포 및 영수증 검증"]) assert.ok(html.includes(text));
  });
  it("is read-only and keeps deployment navigation locked", function () {
    assert.doesNotMatch(js, /eth_requestAccounts|eth_sendTransaction|signTransaction|PRIVATE_KEY/);
    assert.match(html, /id="continue" disabled/);
    assert.doesNotMatch(js, /\$\("continue"\)\.disabled=false/);
  });
  it("pins two independent RPCs and the reviewed Stage-3 manifest", function () {
    assert.ok(js.includes("bsc-testnet-rpc.publicnode.com"));
    assert.ok(js.includes("data-seed-prebsc-1-s1.bnbchain.org"));
    assert.ok(js.includes(manifest.manifestDigest));
    assert.ok(js.includes(manifest.dependencies.marketRegistry));
    assert.ok(js.includes(manifest.dependencies.interestIndex));
  });
  it("checks empty address, Stage-2 bindings, gas variance and balance", function () {
    for (const value of ["eth_getCode", "eth_estimateGas", "eth_gasPrice", "owner", "guardian", "oracle", "rateModel", "core"]) assert.ok(js.includes(value));
    assert.match(js, /code!=="0x"/);
    assert.match(js, /\(high-low\)\*100n>high\*5n/);
    assert.match(js, /a\.balance<budget/);
  });
});
