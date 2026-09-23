import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("Pyth deploy artifact loader final recovery",()=>{
 const h=fs.readFileSync(path.join(root,"app","futures-pyth-testnet-deploy-v2.html"),"utf8");
 const j=fs.readFileSync(path.join(root,"app","futures","futures-pyth-testnet-deploy-v2.js"),"utf8");
 it("depends only on the required Pyth runtime bundle",()=>{
   assert.match(j,/\.\/futures\/futures-pyth-runtime-artifacts\.json/);
   assert.doesNotMatch(j,/futures-production-oracle-mobile-artifacts/);
 });
 it("checks HTTP success before parsing runtime artifacts",()=>{assert.match(j,/if\(!rp\.ok\)/);});
 it("enables deployment only after both required artifacts exist",()=>{assert.match(j,/artifacts\?\.PythUpdateHelper/);assert.match(j,/artifacts\?\.PythReference/);assert.match(j,/setDeployEnabled\(true\)/);});
 it("shows v4 build marker",()=>{assert.match(h,/8C-UMD-v4/);assert.match(j,/8C-UMD-v4/);});
});