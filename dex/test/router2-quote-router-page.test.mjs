import assert from "node:assert/strict";
import fs from "node:fs";

describe("Router 2.0 Quote Router TokenPocket page", function () {
  const script=fs.readFileSync(new URL("../app/router2-quote-router-testnet.js",import.meta.url),"utf8");
  const html=fs.readFileSync(new URL("../app/router2-quote-router-testnet.html",import.meta.url),"utf8");
  const record=JSON.parse(fs.readFileSync(new URL("../deployments/router2-quote-stack-config-bsc-testnet-97.json",import.meta.url)));

  it("publishes the exact prepared Quote Router deployment data", function () {
    const data=record.orderedActions[5].data;
    assert.equal(record.orderedActions[5].action,"deploy-quote-router");assert.equal(data.length,7798);
    assert.ok(data.endsWith(record.executions.registry.address.toLowerCase().slice(2).padStart(64,"0")));
    assert.match(script,/action\.data/);assert.match(script,/deployData\.length!==7798/);
  });

  it("requires the registered V3 Adapter before deployment", function () {
    assert.match(script,/0x10c931a5/);assert.match(script,/BigInt\(`0x\$\{words\[1\]\}`\)!==1n/);assert.match(script,/BigInt\(`0x\$\{words\[2\]\}`\)!==95n/);
    assert.match(script,/bundle\.executions\.v3Configuration\.status!=="success"/);
  });

  it("verifies the deployed Router registry and blocks duplicates", function () {
    assert.match(script,/0x7b103999/);assert.match(script,/if\(await existing\(\)\)return/);assert.match(script,/localStorage\.setItem\(STORAGE_KEY/);
    assert.match(script,/value:"0x0",data:deployData/);assert.match(html,/Quote Router 계약 하나만 생성/);assert.match(html,/토큰 승인·교환·유동성 이동은 없습니다/);
  });
});
