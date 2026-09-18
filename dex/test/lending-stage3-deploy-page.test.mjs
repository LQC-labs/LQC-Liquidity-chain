import assert from "node:assert/strict";import fs from "node:fs";
const read=p=>fs.readFileSync(new URL(p,import.meta.url),"utf8"),html=read("../app/lending-stage3-deploy-testnet.html"),js=read("../app/lending-stage3-deploy-testnet.js"),packet=JSON.parse(read("../deployments/lending-stage3-execution-packet-bsc-testnet-97.json"));
describe("LQC official 4/11 Stage 3 Core wallet gate",function(){
 it("pins the explicitly approved one-Core packet",function(){assert.equal(packet.transaction.contract,"LQCLendingCore");assert.equal(packet.transaction.nonce,"109");assert.equal(packet.transaction.value,"0");assert.equal(packet.maximumGasBudgetTbnb,"0.0003574234");});
 it("starts deployment disabled until wallet and dual-RPC preflight pass",function(){assert.ok(html.includes('id="deploy" disabled'));assert.ok(js.includes("ready=true"));});
 it("requires BSC testnet and the approved deployer wallet",function(){assert.ok(js.includes('CHAIN="0x61"'));assert.ok(js.includes("DEPLOYER"));assert.ok(js.includes('eth_requestAccounts'));});
 it("revalidates nonce predicted-address vacancy gas and balance across two RPCs",function(){for(const x of["eth_getTransactionCount","eth_getCode","eth_estimateGas","eth_gasPrice","maximumGasBudgetWei","두 RPC"])assert.ok(js.includes(x),x);});
 it("broadcasts only the approved zero-value CREATE after revalidation",function(){assert.ok(js.includes('eth_sendTransaction'));assert.ok(js.includes('value:"0x0"'));assert.ok(js.includes("tx.data"));});
 it("verifies receipt Core address and owner Registry Index liquidation-engine bindings",function(){for(const x of["receipt.contractAddress","owner","registry","interestIndex","liquidationEngine"])assert.ok(js.includes(x),x);});
 it("contains no embedded private key",function(){assert.ok(!js.includes("PRIVATE_KEY"));assert.ok(!html.includes("PRIVATE_KEY"));});
});
