import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("7/7-8E Pyth fresh update mobile",()=>{
 const h=fs.readFileSync(path.join(root,"app","futures-pyth-fresh-update.html"),"utf8");
 const j=fs.readFileSync(path.join(root,"app","futures","futures-pyth-fresh-update.js"),"utf8");
 it("pins deployed helper/adapter and BNB feed",()=>{assert.match(j,/C9a880dC29037ac3139CdDA6C42cc5A55A744f35/i);assert.match(j,/cbCc852873C98CDcEF37F07992BfA05C6Ae07e26/i);assert.match(j,/2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f/i);});
 it("never persists the API key",()=>{assert.match(h,/type="password"/);assert.doesNotMatch(j,/localStorage|sessionStorage|indexedDB/);assert.match(j,/\$\("apiKey"\)\.value=""/);});
 it("clears the API key in finally after every Hermes fetch attempt",()=>{assert.match(j,/try\s*\{[\s\S]*await fetch\([\s\S]*\}\s*finally\s*\{\s*\$\("apiKey"\)\.value=""\s*;?\s*\}/);});
 it("uses authenticated Hermes and permissionless helper update",()=>{assert.match(j,/authorization:"Bearer "/);assert.match(j,/getUpdateFee/);assert.match(j,/helper\.update/);});
 it("verifies fresh reference and keeps governance absent",()=>{assert.match(j,/latestRoundData/);assert.match(j,/age>120n/);assert.doesNotMatch(j,/setCircuitBreaker|setFeed|referenceFeed/);});
 it("uses non-module UMD loader",()=>{assert.match(h,/ethers\.umd\.min\.js/);assert.doesNotMatch(h,/type="module"/);});
});