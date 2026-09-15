import assert from "node:assert/strict";
import fs from "node:fs";

describe("Router 2.0 Proof Gateway final-state page",function(){
  const js=fs.readFileSync(new URL("../app/router2-proof-gateway-final-state-testnet.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../app/router2-proof-gateway-final-state-testnet.html",import.meta.url),"utf8");
  it("is explicitly read-only",function(){assert.match(html,/읽기 전용/);assert.match(html,/서명·계약 배포·토큰 승인·스왑·가스비가 발생하지 않습니다/);assert.doesNotMatch(js,/eth_sendTransaction/);});
  it("requires both successful deployment receipts from Signer 1",function(){assert.match(js,/eth_getTransactionReceipt/);assert.match(js,/BigInt\(receipt\.status\)!==1n/);assert.match(js,/receipt\.from\.toLowerCase\(\)!==SIGNER\.toLowerCase\(\)/);});
  it("checks both runtime bytecode hashes",function(){assert.ok(js.includes("0x5b529479796e79c39d4959695425be49edde0cc9eecce4f49e6605e38ba37f3a"));assert.ok(js.includes("0x65c43d36bf8c742d97860797ee71c587ec3e03803717227c3d0d90797f5a2f15"));});
  it("reads and verifies immutable Proof and Router bindings",function(){assert.ok(js.includes("0x7fa417b3"));assert.ok(js.includes("0xbbbfe188"));assert.match(js,/addressResult\(proofResult\)/);assert.match(js,/addressResult\(routerResult\)/);});
  it("records confirmations and a deterministic final evidence hash",function(){assert.match(js,/proofConfirmations/);assert.match(js,/gatewayConfirmations/);assert.match(js,/solidityPackedKeccak256/);assert.match(js,/localStorage\.setItem\(FINAL_KEY/);});
});
