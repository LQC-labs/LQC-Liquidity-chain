import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("Master 7/7-7L final TWAP on-chain verifier",()=>{
 const s=fs.readFileSync(path.join(root,"scripts","verify-master7-7-7l-final-twap-onchain.mjs"),"utf8");
 it("pins the final deployment tx and contract address",()=>{
   assert.match(s,/0x6d34b3851d48967c5a77303e1635344dc2385186cb73755bade0c72a98d11ebe/i);
   assert.match(s,/0x5ae96e36356ac18728804577e926b4b362017c0d/i);
 });
 it("uses the Pancake V3 uint32 feeProtocol slot0 ABI",()=>{
   assert.match(s,/uint16,uint16,uint16,uint32,bool/);
 });
 it("requires current artifact and latestRoundData parity",()=>{
   assert.match(s,/initcode does not match current artifact/i);
   assert.match(s,/On-chain TWAP answer mismatch/);
   assert.match(s,/latestRoundData/);
 });
 it("is read-only",()=>{
   assert.doesNotMatch(s,/sendTransaction|eth_sendTransaction|setFeed|setCircuitBreaker/);
 });
});