import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { buildProofBoundGatewayDeployment } from "../scripts/prepare-router2-proof-bound-gateway.mjs";

describe("Router 2.0 Proof Gateway TokenPocket deployment page",function(){
  const js=fs.readFileSync(new URL("../app/router2-proof-gateway-deploy-testnet.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../app/router2-proof-gateway-deploy-testnet.html",import.meta.url),"utf8");
  it("publishes a hash-bound Gateway template",async function(){const b=await buildProofBoundGatewayDeployment();assert.equal(ethers.keccak256(b.gatewayTemplate.bytecode),b.bytecodeHashes.proofBoundGateway);assert.deepEqual(b.gatewayTemplate.constructorOrder,["proofVerifier","executionRouter"]);});
  it("constructs exactly the scripted Gateway deployment data",async function(){const proof="0x1111111111111111111111111111111111111111",b=await buildProofBoundGatewayDeployment(proof),t=b.gatewayTemplate,data=t.bytecode+ethers.AbiCoder.defaultAbiCoder().encode(t.constructorTypes,[proof,b.dependencies.executionRouter]).slice(2);assert.equal(data,b.orderedActions[1].data);});
  it("requires the verified stage-one Proof record",function(){assert.ok(js.includes("lqc-router2-proof-verifier-chain97-v1"));assert.match(js,/PROOF_RUNTIME_HASH/);assert.match(html,/선행조건/);});
  it("verifies Gateway runtime and both immutable dependencies",function(){assert.ok(js.includes("0x65c43d36bf8c742d97860797ee71c587ec3e03803717227c3d0d90797f5a2f15"));assert.ok(js.includes("0x7fa417b3"));assert.ok(js.includes("0xbbbfe188"));assert.match(js,/decodedAddress\(proofResult\)/);assert.match(js,/decodedAddress\(routerResult\)/);});
  it("separates free preflight from one zero-value deployment and blocks duplicates",function(){assert.match(html,/1\. Proof·Router·코드 읽기 전용 사전검증/);assert.match(html,/2\. Proof Bound Execution Gateway 1개 배포/);assert.match(js,/value:"0x0",data:deployData/);assert.match(js,/if\(await existing\(\)\)return/);assert.match(js,/localStorage\.setItem\(GATEWAY_KEY/);});
});
