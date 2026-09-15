import assert from "node:assert/strict";
import fs from "node:fs";

describe("Router 2.0 Proof Gateway operational monitor page",function(){
  const js=fs.readFileSync(new URL("../app/router2-proof-gateway-monitor-testnet.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../app/router2-proof-gateway-monitor-testnet.html",import.meta.url),"utf8");
  it("is strictly read-only",function(){assert.match(html,/온체인 정보만 읽습니다/);assert.doesNotMatch(js,/eth_sendTransaction|\.approve\(|eth_requestAccounts/);});
  it("verifies Proof and Gateway runtime hashes plus immutable bindings",function(){assert.match(js,/PROOF_RUNTIME_HASH/);assert.match(js,/GATEWAY_RUNTIME_HASH/);assert.match(js,/gateway\.proofVerifier\(\)/);assert.match(js,/gateway\.executionRouter\(\)/);});
  it("requires the current reviewed Registry adapter and unpaused Risk",function(){assert.match(js,/registry\.getDex\(FLOW\)/);assert.match(js,/dex\[0\]\.toLowerCase\(\)!==ADAPTER/);assert.match(js,/risk\.paused\(\)/);assert.match(js,/if\(paused\)/);});
  it("rejects residual Gateway token balance or Router approval",function(){assert.match(js,/token\.balanceOf\(deployment\.proofGateway\)/);assert.match(js,/token\.allowance\(deployment\.proofGateway,ROUTER\)/);assert.match(js,/if\(balance!==0n\)/);assert.match(js,/if\(allowance!==0n\)/);});
  it("requires the last recorded execution proof to remain consumed",function(){assert.match(js,/gateway\.consumedProof\(lastProof\)/);assert.match(js,/마지막 실행 Proof가 소비 상태가 아닙니다/);});
  it("records a block-bound operational snapshot hash",function(){assert.match(js,/solidityPackedKeccak256/);assert.match(js,/blockNumber/);assert.match(js,/localStorage\.setItem\(MONITOR_KEY/);assert.match(html,/상태 Snapshot Hash/);});
});
