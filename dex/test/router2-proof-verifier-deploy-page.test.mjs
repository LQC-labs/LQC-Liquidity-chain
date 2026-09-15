import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { buildProofBoundGatewayDeployment } from "../scripts/prepare-router2-proof-bound-gateway.mjs";

describe("Router 2.0 Proof verifier TokenPocket deployment page", function () {
  const js=fs.readFileSync(new URL("../app/router2-proof-verifier-deploy-testnet.js",import.meta.url),"utf8");
  const html=fs.readFileSync(new URL("../app/router2-proof-verifier-deploy-testnet.html",import.meta.url),"utf8");
  it("publishes the exact reviewed Proof verifier creation code",async function(){const bundle=await buildProofBoundGatewayDeployment();assert.equal(ethers.keccak256(bundle.orderedActions[0].data),bundle.bytecodeHashes.bestExecutionProof);assert.ok(js.includes("router2-proof-bound-gateway-stage1-bsc-testnet-97.json"));});
  it("pins chain 97, Signer 1 and the existing Execution Router",function(){assert.ok(js.includes('CHAIN_ID="0x61"'));assert.ok(js.toLowerCase().includes("0x7cf23bb16ed0e1eaf58cd31c9f5a643be438c6ab"));assert.ok(js.toLowerCase().includes("0x2e0a7f59ca65ed36977add5e71b8b64ba38d939f"));});
  it("verifies creation and deployed runtime code hashes",function(){assert.match(js,/ethers\.keccak256\(deployData\)/);assert.match(js,/ethers\.keccak256\(code\)!==RUNTIME_HASH/);assert.ok(js.includes("0x5b529479796e79c39d4959695425be49edde0cc9eecce4f49e6605e38ba37f3a"));});
  it("separates read-only verification from one deployment",function(){assert.match(html,/1\. 연결·코드·가스 읽기 전용 사전검증/);assert.match(html,/2\. Best Execution Proof 검증계약 1개 배포/);assert.match(html,/토큰 승인·스왑은 하지 않습니다/);assert.match(js,/value:"0x0",data:deployData/);});
  it("blocks duplicate deployment and records verified evidence",function(){assert.match(js,/if\(await existing\(\)\)return/);assert.match(js,/localStorage\.setItem\(STORAGE_KEY/);assert.match(js,/receipt\.contractAddress/);});
});
