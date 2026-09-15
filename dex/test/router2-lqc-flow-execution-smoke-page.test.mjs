import assert from "node:assert/strict";import fs from "node:fs";
describe("Router 2.0 LQC Flow execution smoke page",function(){const js=fs.readFileSync(new URL("../app/router2-lqc-flow-execution-smoke-testnet.js",import.meta.url),"utf8"),html=fs.readFileSync(new URL("../app/router2-lqc-flow-execution-smoke-testnet.html",import.meta.url),"utf8");
it("pins the reviewed route, adapter, caps, and 10 tLQC amount",function(){assert.match(js,/0x14db750acf95b469aba3e74032e6db61087ef4cd/);assert.match(js,/7d3375921fc0a5becb9b20cbfdcf03440befc5113d864e8522b8465ca68b8014/);assert.match(js,/AMOUNT=10n\*10n\*\*18n/);assert.match(html,/tLQC → LQC Flow → WBNB/)});
it("requires live quote, remaining daily capacity, exact allowance, and simulation",function(){for(const x of[/0x4e0143cc/,/remaining<AMOUNT/,/===AMOUNT/,/await call\(ROUTER,data,account\)/])assert.match(js,x)});
it("verifies output increase, clears allowance, and blocks duplicate execution",function(){assert.match(js,/balance\(WBNB,account\)<=beforeOut/);assert.match(js,/allowance\(\)!==0n/);assert.match(js,/localStorage\.setItem\(KEY,hash\)/);assert.match(html,/1회 제한/)});
});
