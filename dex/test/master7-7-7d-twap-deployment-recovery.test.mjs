import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
describe("Master 7/7-7D TWAP deployment recovery verifier",()=>{
  const s=fs.readFileSync(path.join(root,"scripts","verify-master7-7-7d-twap-deployment-recovery.mjs"),"utf8");
  it("pins the exact transaction hash and expected deployment configuration",()=>{
    assert.match(s,/0x9e102cb51b49c0193a01cffe67ccdd573fa8a49f9e1594af64bbe490f270da45/i);
    assert.match(s,/0xACf30D531C2DAc92a99a917d41Fa98ce7FBbED17/i);
    assert.match(s,/0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd/i);
    assert.match(s,/0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee/i);
  });
  it("is read-only and never sends a transaction",()=>{
    assert.doesNotMatch(s,/sendTransaction|eth_sendTransaction/);
    assert.match(s,/getTransactionReceipt/);
    assert.match(s,/getCode/);
  });
});