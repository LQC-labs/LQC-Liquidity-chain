import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const required=[
 "docs/master5/5-1-feed-registry-audit.md",
 "docs/master5/5-2-primary-feed.md",
 "docs/master5/5-3-reference-feed.md",
 "docs/master5/5-4-twap-audit.md",
 "docs/master5/5-5-freshness.md",
 "docs/master5/5-6-deviation.md",
 "docs/master5/5-7-circuit-breaker.md",
 "docs/master5/5-8-oracle-e2e.md",
 "dex/test/lending-oracle-manager.test.mjs",
 "dex/test/futures-oracle-adapter.test.mjs",
 "dex/test/futures-twap-reference-qualification.test.mjs",
 "dex/test/futures-twap-price-conversion.test.mjs",
 "dex/test/futures-oracle-guard.test.mjs"
];

test("Master 5/8 Oracle E2E evidence is complete and activation remains forbidden",()=>{
 for(const p of required) assert.equal(fs.existsSync(p),true,"missing evidence: "+p);
 const doc=fs.readFileSync("docs/master5/5-8-oracle-e2e.md","utf8");
 assert.match(doc,/Feed Registry/);
 assert.match(doc,/Primary Feed/);
 assert.match(doc,/Reference Feed/);
 assert.match(doc,/TWAP/);
 assert.match(doc,/Freshness/);
 assert.match(doc,/Deviation/);
 assert.match(doc,/Circuit Breakers/);
 assert.match(doc,/activationAuthorized: false/);
});
