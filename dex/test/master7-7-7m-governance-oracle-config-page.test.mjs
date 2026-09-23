import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("7/7-7M governance oracle config page",()=>{
 const h=fs.readFileSync(path.join(root,"app","futures-governance-oracle-config.html"),"utf8");
 const j=fs.readFileSync(path.join(root,"app","futures","governance-oracle-config-page.js"),"utf8");
 it("pins governance owner and final oracle addresses",()=>{for(const x of["0x89d992f696B40ABbDB6610144faeF336911D8175","0x2582c3156e42df6115c020fb8006b3949c93c1a9","0x5AE96E36356AC18728804577E926B4b362017c0d"])assert.match(j,new RegExp(x,"i"))});
 it("requires chain 97 and exact owner",()=>{assert.match(j,/chainId!==97n/);assert.match(j,/Governance Owner 지갑이 아닙니다/);});
 it("enforces setFeed before setCircuitBreaker",()=>{assert.match(j,/feedDone=true/);assert.match(j,/if\(cbDone\|\|!feedDone\)return/);});
 it("has copy buttons and no private key input",()=>{assert.match(h,/data-copy/);assert.doesNotMatch(h+j,/privateKey|seed phrase|mnemonic/i);});
});