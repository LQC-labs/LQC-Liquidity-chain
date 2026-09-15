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
  it("classifies failures and gives a safe operator response",function(){assert.match(js,/function diagnose\(message\)/);assert.match(js,/RISK_PAUSED/);assert.match(js,/GATEWAY_BALANCE/);assert.match(js,/ROUTER_ALLOWANCE/);assert.match(js,/거래를 실행하지 말고/);assert.match(html,/이상 진단 \/ 권장 대응/);});
  it("stores only local incident evidence and clears it after a pass",function(){assert.match(js,/localStorage\.setItem\(INCIDENT_KEY/);assert.match(js,/localStorage\.removeItem\(INCIDENT_KEY\)/);});
  it("seals a public PASS or FAIL report with a deterministic hash",function(){assert.match(js,/function sealReport\(core\)/);assert.match(js,/LQC_PROOF_GATEWAY_MONITOR_V1/);assert.match(js,/status:"PASS"/);assert.match(js,/status:"FAIL"/);assert.match(js,/keccak256\(ethers\.toUtf8Bytes\(canonical\)\)/);assert.match(html,/공유용 Report Hash/);});
  it("copies only the stored monitor report without wallet interaction",function(){assert.match(js,/navigator\.clipboard\.writeText/);assert.match(js,/JSON\.stringify\(report,null,2\)/);assert.match(html,/운영 점검 JSON 복사/);assert.doesNotMatch(js,/privateKey|mnemonic|eth_requestAccounts/);});
});
