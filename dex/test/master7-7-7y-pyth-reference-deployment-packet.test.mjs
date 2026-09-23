import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root=path.resolve(import.meta.dirname,"..");
describe("7/7-7Y Pyth reference deployment packet",()=>{
  before(()=>{execFileSync(process.execPath,["scripts/compile.mjs"],{cwd:root,stdio:"inherit"});execFileSync(process.execPath,["scripts/build-master7-7-7y-pyth-reference-deployment-packet.mjs"],{cwd:root,stdio:"inherit"});});
  it("pins reviewed BSC Testnet constructor inputs",()=>{
    const p=JSON.parse(fs.readFileSync(path.join(root,"app","futures","futures-pyth-reference-deployment-packet.json"),"utf8"));
    assert.equal(p.config.chainId,97);
    assert.equal(p.config.pythCore.toLowerCase(),"0x5744cbf430d99456a0a8771208b674f27f8ef0fb");
    assert.equal(p.config.bnbUsdPriceId.toLowerCase(),"0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f");
    assert.equal(p.config.maxAgeSeconds,120);
    assert.equal(p.config.maxConfidenceBps,500);
    assert.equal(p.config.circuitBreakerBps,500);
  });
  it("contains deployable current artifact but no activation transaction",()=>{
    const p=JSON.parse(fs.readFileSync(path.join(root,"app","futures","futures-pyth-reference-deployment-packet.json"),"utf8"));
    assert.equal(p.contract.contractName,"LQCPythReferenceAdapter");
    assert.ok(p.contract.bytecode.startsWith("0x")&&p.contract.bytecode.length>100);
    assert.equal(p.safety.governanceMutationIncluded,false);
    assert.equal(p.safety.liveActivationIncluded,false);
    assert.equal(p.status,"PREPARED_NOT_APPROVED_FOR_ACTIVATION");
  });
  it("keeps fresh Hermes and governance gates explicit",()=>{
    const p=JSON.parse(fs.readFileSync(path.join(root,"app","futures","futures-pyth-reference-deployment-packet.json"),"utf8"));
    assert.ok(p.config.activationBlockedUntil.some(x=>x.includes("fresh Hermes")));
    assert.ok(p.config.activationBlockedUntil.some(x=>x.includes("Governance")));
    assert.equal(p.safety.failClosedRequired,true);
  });
});
