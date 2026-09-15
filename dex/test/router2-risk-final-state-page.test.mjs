import assert from "node:assert/strict";import fs from "node:fs";
const source=fs.readFileSync(new URL("../app/router2-risk-final-state-testnet.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../app/router2-risk-final-state-testnet.html",import.meta.url),"utf8");
describe("Router 2.0 risk final-state page",function(){
it("is read-only and pins the completed chain-97 deployment",function(){for(const value of["0x61","0xe10a1d467a553900cb4d1755e079b35b0cd0c48b","0x2e0a7f59ca65ed36977add5e71b8b64ba38d939f","0x5235e26EE4D511aE8ba1FB1cff2619Fc1D90C02A"])assert.match(source,new RegExp(value,"i"));assert.doesNotMatch(source,/eth_sendTransaction|eth_sign|personal_sign/);assert.match(html,/읽기 전용/)});
it("checks ownership, pending owner, executor, both token limits and both DEX caps",function(){for(const selector of["8da5cb5b","e30c3978","c34c08e5","417a0698","d6a067ee"])assert.match(source,new RegExp(selector));assert.match(source,/checks\.every\(Boolean\)/)});
});
