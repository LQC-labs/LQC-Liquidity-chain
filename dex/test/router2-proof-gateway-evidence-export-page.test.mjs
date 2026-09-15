import assert from "node:assert/strict";
import fs from "node:fs";

describe("Router 2.0 Proof Gateway evidence export page",function(){
  const js=fs.readFileSync(new URL("../app/router2-proof-gateway-evidence-export-testnet.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../app/router2-proof-gateway-evidence-export-testnet.html",import.meta.url),"utf8");
  it("reads all six evidence records",function(){for(const key of ["proof-verifier-chain97-v1","proof-gateway-chain97-v1","proof-gateway-final-chain97-v1","proof-gateway-readiness-chain97-v1","proof-gateway-execution-chain97-v1","proof-gateway-execution-final-chain97-v1"])assert.ok(js.includes(key),key);});
  it("uses a strict public-field allowlist",function(){for(const field of ["transactionHash","proofHash","evidenceHash","blockHash","amountIn","amountOut","residualAllowance"])assert.ok(js.includes(field),field);assert.doesNotMatch(js,/privateKey|seedPhrase|mnemonic|eth_requestAccounts/);});
  it("validates every exported address and hash",function(){assert.match(js,/\^0x\[0-9a-fA-F\]\{40\}\$/);assert.match(js,/\^0x\[0-9a-fA-F\]\{64\}\$/);});
  it("creates a deterministic hash before adding export time",function(){assert.match(js,/bundleHash=ethers\.keccak256\(ethers\.toUtf8Bytes\(JSON\.stringify\(core\)\)\)/);assert.match(js,/payload=\{\.\.\.core,bundleHash,exportedAt/);});
  it("is read-only and copies only the generated JSON",function(){assert.match(html,/개인키·시드문구·서명·지갑 비밀정보는 읽거나 포함하지 않습니다/);assert.doesNotMatch(js,/window\.ethereum|eth_sendTransaction/);assert.match(js,/navigator\.clipboard\.writeText\(exportText\)/);});
});
