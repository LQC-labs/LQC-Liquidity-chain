import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("Pyth deploy v2 cache bypass",()=>{
 const h=fs.readFileSync(path.join(root,"app","futures-pyth-testnet-deploy-v2.html"),"utf8");
 const j=fs.readFileSync(path.join(root,"app","futures","futures-pyth-testnet-deploy-v2.js"),"utf8");
 it("uses a unique v2 page and script",()=>{assert.match(h,/Deployment v2/);assert.match(h,/futures-pyth-testnet-deploy-v2\.js/);});
 it("shows the v2 build marker",()=>{assert.match(h,/8C-UMD-v3/);assert.match(j,/8C-UMD-v3/);});
 it("keeps non-module loader",()=>{assert.doesNotMatch(h,/type="module"/);assert.doesNotMatch(j,/from "https:\/\//);});
});