import assert from "node:assert/strict";
import fs from "node:fs";

describe("Router 2.0 Proof Gateway execution history page",function(){
  const js=fs.readFileSync(new URL("../app/router2-proof-gateway-history-testnet.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../app/router2-proof-gateway-history-testnet.html",import.meta.url),"utf8");
  it("is read-only and requests no wallet account",function(){assert.match(html,/읽기 전용 · 거래 없음/);assert.doesNotMatch(js,/window\.ethereum|eth_requestAccounts|eth_sendTransaction|getSigner\(/);});
  it("accepts only the bounded V1 archive list",function(){assert.match(js,/LQC_PROOF_GATEWAY_EXECUTION_ARCHIVE_V1/);assert.match(js,/Array\.isArray\(value\)/);assert.match(js,/value\.length>20/);});
  it("recomputes every archive hash",function(){assert.match(js,/const \{archiveHash,\.\.\.core\}=entry/);assert.match(js,/ethers\.keccak256\(ethers\.toUtf8Bytes\(JSON\.stringify\(core\)\)\)/);assert.match(js,/computed\.toLowerCase\(\)!==archiveHash\.toLowerCase\(\)/);});
  it("cross-checks transaction proof gateway output and evidence",function(){for(const value of ["거래 해시 연결","Proof Hash 연결","Gateway·출력·Evidence 연결"])assert.ok(js.includes(value));});
  it("renders with textContent and copies only verified entries",function(){assert.match(js,/body\.textContent=/);assert.doesNotMatch(js,/innerHTML/);assert.match(js,/entries:verified/);assert.match(js,/navigator\.clipboard\.writeText/);});
  it("strictly validates a copied history bundle before restoring it",function(){assert.match(js,/function exactKeys\(value,keys\)/);assert.match(js,/exactKeys\(bundle,\["format","chainId","count","entries"\]\)/);assert.match(js,/bundle\.entries\.map\(check\)/);assert.match(js,/bundle\.entries\.length!==bundle\.count/);});
  it("requires confirmation before replacing existing history",function(){assert.match(js,/current\.length&&!confirm\(/);assert.match(js,/localStorage\.setItem\(HISTORY_KEY,JSON\.stringify\(checked\)\)/);assert.match(js,/기존 이력은 변경하지 않았습니다/);assert.match(html,/검증 JSON으로 이력 복구/);});
});
