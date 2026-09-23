import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("Master 7/7-7K fixed TWAP redeployment verifier",()=>{
 const s=fs.readFileSync(path.join(root,"scripts","verify-master7-7-7k-fixed-twap-redeployment.mjs"),"utf8");
 it("pins the exact redeployment tx and expected configuration",()=>{
   assert.match(s,/0xf417e52a85e1bb212db6418bbe6178483ef4e55d1e78b2b8b1f1e68f1cfa4e19/i);
   assert.match(s,/0xACf30D531C2DAc92a99a917d41Fa98ce7FBbED17/i);
   assert.match(s,/1800n/);
 });
 it("verifies transaction initcode against the current compiled fixed artifact",()=>{
   assert.match(s,/startsWith/);
   assert.match(s,/current fixed artifact bytecode/);
 });
 it("is read-only and verifies latestRoundData",()=>{
   assert.doesNotMatch(s,/sendTransaction|eth_sendTransaction/);
   assert.match(s,/latestRoundData/);
   assert.match(s,/getTransactionReceipt/);
 });
});