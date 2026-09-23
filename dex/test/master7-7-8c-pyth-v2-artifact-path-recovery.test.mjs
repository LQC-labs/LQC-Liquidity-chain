import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("Pyth v2 runtime artifact path recovery",()=>{
 const h=fs.readFileSync(path.join(root,"app","futures-pyth-testnet-deploy-v2.html"),"utf8");
 const j=fs.readFileSync(path.join(root,"app","futures","futures-pyth-testnet-deploy-v2.js"),"utf8");
 it("loads runtime artifacts from the actual futures subdirectory",()=>{assert.match(j,/\.\/futures\/futures-pyth-runtime-artifacts\.json/);});
 it("requires both runtime contracts before enabling deployment",()=>{assert.match(j,/PythUpdateHelper/);assert.match(j,/PythReference/);assert.match(j,/setDeployEnabled\(true\)/);});
 it("keeps deploy buttons disabled before artifact success",()=>{assert.match(h,/id="deployHelper" disabled/);assert.match(h,/id="deployAdapter" disabled/);assert.match(j,/setDeployEnabled\(false\)/);});
 it("shows v3 build marker",()=>{assert.match(h,/8C-UMD-v3/);assert.match(j,/8C-UMD-v3/);});
});