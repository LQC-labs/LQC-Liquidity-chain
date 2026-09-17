import assert from "node:assert/strict";
import fs from "node:fs";

const read = path => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../app/lending-stage2-deploy-testnet.html");
const js = read("../app/lending-stage2-deploy-testnet.js");
const packet = JSON.parse(read("../deployments/lending-stage2-execution-packet-bsc-testnet-97.json"));

describe("LQC Lending Stage-2 approved deployment page", function () {
  it("pins the approved review, packet and maximum budget", function () {
    assert.ok(js.includes(packet.approvedReviewDigest));
    assert.ok(js.includes(packet.packetDigest));
    assert.ok(js.includes(packet.maximumGasBudgetWei));
    assert.match(html, /0\.00023849856 tBNB/);
  });
  it("requires chain 97, the approved deployer and exact sequential nonces", function () {
    assert.match(js, /CHAIN="0x61"/);
    assert.ok(js.includes(packet.deployer));
    assert.match(js, /a\.nonce!==Number\(tx\.nonce\)/);
    assert.match(js, /index!==saved\(\)\.length/);
  });
  it("rechecks two RPCs, empty addresses, gas, balance and bindings before signing", function () {
    for (const value of ["eth_getTransactionCount", "eth_getCode", "eth_estimateGas", "eth_gasPrice", "owner", "guardian", "oracle", "rateModel", "core"]) assert.ok(js.includes(value));
    assert.match(js, /estimate>BigInt\(tx\.gasLimit\)/);
    assert.match(js, /price>MAX_GAS_PRICE/);
    assert.match(js, /a\.balance<remaining/);
  });
  it("submits only one zero-value CREATE and verifies its receipt before continuing", function () {
    assert.match(js, /eth_sendTransaction/);
    assert.match(js, /value:"0x0"/);
    assert.match(js, /receipt\.contractAddress/);
    assert.match(js, /verifyAt\(index\)/);
    assert.match(html, /하나씩 실행/);
  });
  it("removes and never persists the private RPC", function () {
    assert.match(js, /history\.replaceState/);
    assert.match(js, /pagehide/);
    assert.doesNotMatch(js, /localStorage\.setItem\([^,]+privateRpc/);
  });
});
