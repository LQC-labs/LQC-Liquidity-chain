import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("TokenPocket UMD loader recovery",()=>{
 const html=fs.readFileSync(path.join(root,"app","futures-pyth-testnet-deploy.html"),"utf8");
 const js=fs.readFileSync(path.join(root,"app","futures","futures-pyth-testnet-deploy.js"),"utf8");
 it("does not use ESM module loading",()=>{assert.doesNotMatch(html,/type="module"/);assert.doesNotMatch(js,/from "https:\/\//);});
 it("loads ethers UMD before the app script",()=>{assert.match(html,/ethers\.umd\.min\.js/);assert.ok(html.indexOf("ethers.umd.min.js")<html.indexOf("futures-pyth-testnet-deploy.js"));});
 it("shows a visible build marker and JS status",()=>{assert.match(html,/buildVersion/);assert.match(js,/8C-UMD-v1/);assert.match(js,/JS 로드 성공/);});
});