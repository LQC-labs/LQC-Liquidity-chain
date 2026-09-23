import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("7/7-8C Pyth mobile deployment packet",()=>{
 const js=fs.readFileSync(path.join(root,"app","futures","futures-pyth-testnet-deploy.js"),"utf8");
 const html=fs.readFileSync(path.join(root,"app","futures-pyth-testnet-deploy.html"),"utf8");
 it("pins deployer and BSC testnet",()=>{assert.match(js,/0xDe05e09DB1292aFf6ab62164134f1ad384Bca6FB/i);assert.match(js,/EXPECTED_CHAIN_ID=97n/);});
 it("pins reviewed Pyth inputs",()=>{assert.match(js,/0x5744Cbf430D99456a0A8771208b674F27f8EF0Fb/i);assert.match(js,/2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f/i);assert.match(js,/MAX_AGE=120/);assert.match(js,/MAX_CONFIDENCE_BPS=500/);});
 it("deploys helper and reference only",()=>{assert.match(js,/deployHelper/);assert.match(js,/deployAdapter/);assert.doesNotMatch(js,/setCircuitBreaker|setFeed|clearCircuitBreaker/);});
 it("warns governance activation is blocked",()=>{assert.match(html,/Governance referenceFeed/);});
 it("provides copy controls",()=>{assert.match(html,/주소 복사/);assert.match(js,/navigator\.clipboard/);assert.match(js,/execCommand\("copy"\)/);});
});