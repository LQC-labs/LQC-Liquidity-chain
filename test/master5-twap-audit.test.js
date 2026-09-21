import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Master 5/4 recognizes existing TWAP qualification/conversion and runtime gap",()=>{
 const pre=fs.readFileSync("dex/scripts/preflight-futures-twap-reference.mjs","utf8");
 const conv=fs.readFileSync("dex/scripts/futures-twap-price-conversion.mjs","utf8");
 const doc=fs.readFileSync("docs/master5/5-4-twap-audit.md","utf8");
 assert.match(pre,/MIN_WINDOW = 300/);
 assert.match(pre,/minimumLiquidity/);
 assert.match(pre,/observationCardinality < 2/);
 assert.match(pre,/pool\.observe/);
 assert.match(pre,/delta < 0n && delta % window !== 0n/);
 assert.match(pre,/activationAuthorized: false/);
 assert.match(conv,/PRICE_SCALE = 10n \*\* 18n/);
 assert.match(conv,/sqrtRatioAtTick/);
 assert.match(conv,/Index\/quote tokens do not match the pool/);
 assert.match(doc,/not yet a shared Oracle Foundation runtime TWAP feed/);
 assert.match(doc,/activationAuthorized: false/);
});
