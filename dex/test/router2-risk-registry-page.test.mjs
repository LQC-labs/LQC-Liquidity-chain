import assert from "node:assert/strict";
import fs from "node:fs";
import { buildExecutionStack } from "../scripts/prepare-router2-execution-stack.mjs";

describe("Router 2.0 Risk Registry TokenPocket page", function () {
  const script = fs.readFileSync(new URL("../app/router2-risk-registry-testnet.js", import.meta.url), "utf8");
  const html = fs.readFileSync(new URL("../app/router2-risk-registry-testnet.html", import.meta.url), "utf8");
  const record = JSON.parse(fs.readFileSync(new URL("../deployments/router2-execution-stack-stage1-bsc-testnet-97.json", import.meta.url)));

  it("publishes generator-identical Risk Registry deployment data", async function () {
    assert.equal(record.orderedActions[0].data, (await buildExecutionStack()).orderedActions[0].data);
    assert.equal(record.orderedActions[0].action, "deploy-risk-registry");
    assert.equal(record.orderedActions[0].data.length, 7656);
    assert.match(script, /action\.data/);
  });

  it("pins chain 97, Signer 1, Risk Safe, zero value and one-contract scope", function () {
    assert.match(script, /CHAIN_ID = "0x61"/);
    assert.match(script, /value: "0x0", data: deployData/);
    assert.match(script, /data: "0x8da5cb5b"/);
    assert.match(script, /data: "0x83444e5f"/);
    assert.match(html, /Risk Registry 계약 하나만 생성/);
    assert.match(html, /한도 설정·토큰 승인·교환·유동성 이동은 없습니다/);
  });

  it("verifies deployed roles and blocks repeat deployment", function () {
    assert.match(script, /owner\.toLowerCase\(\) !== SIGNER\.toLowerCase\(\)/);
    assert.match(script, /riskAdmin\.toLowerCase\(\) !== RISK_SAFE\.toLowerCase\(\)/);
    assert.match(script, /if \(await existing\(\)\) return/);
    assert.match(script, /localStorage\.setItem\(STORAGE_KEY/);
    assert.match(script, /receipt\.contractAddress/);
  });
});
