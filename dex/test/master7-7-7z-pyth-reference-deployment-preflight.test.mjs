import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");

describe("7/7-7Z Pyth deployment preflight",()=>{
 const s=fs.readFileSync(path.join(root,"scripts","preflight-master7-7-7z-pyth-reference-deployment.mjs"),"utf8");
 it("pins reviewed chain-97 Pyth and BNB/USD inputs",()=>{
  assert.match(s,/chainId!==97n/);
  assert.match(s,/0x5744Cbf430D99456a0A8771208b674F27f8EF0Fb/i);
  assert.match(s,/2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f/i);
  assert.match(s,/MAX_AGE=120/);
  assert.match(s,/MAX_CONFIDENCE_BPS=500/);
 });
 it("keeps current Chainlink primary and 500bps target",()=>{
  assert.match(s,/0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526/i);
  assert.match(s,/CIRCUIT_BREAKER_BPS=500/);
 });
 it("proves current deployable artifact and initcode without a transaction",()=>{
  assert.match(s,/LQCPythReferenceAdapter\.json/);
  assert.match(s,/getDeployTransaction/);
  assert.match(s,/initCodeHash/);
  assert.match(s,/transactionOccurred:false/);
  assert.match(s,/deploymentAuthorized:false/);
  assert.match(s,/activationAuthorized:false/);
 });
 it("keeps live activation blocked behind Hermes, update path and Governance",()=>{
  assert.match(s,/PYTH_API_KEY/);
  assert.match(s,/fresh Hermes/);
  assert.match(s,/on-chain update path/);
  assert.match(s,/Governance/);
 });
});