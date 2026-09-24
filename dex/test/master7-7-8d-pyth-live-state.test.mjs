import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
describe("7/7-8D Pyth live state verification",()=>{
 const s=fs.readFileSync(path.join(root,"scripts","verify-master7-7-8d-pyth-live-state.mjs"),"utf8");
 it("pins observed deployed addresses",()=>{assert.match(s,/C9a880dC29037ac3139CdDA6C42cc5A55A744f35/i);assert.match(s,/cbCc852873C98CDcEF37F07992BfA05C6Ae07e26/i);});
 it("verifies Pyth constructor state",()=>{assert.match(s,/priceId/);assert.match(s,/maxAge/);assert.match(s,/maxConfidenceBps/);assert.match(s,/decimals/);});
 it("keeps governance replacement unauthorized",()=>{assert.match(s,/governanceReferenceReplacementAuthorized:false/);});
});