import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {describe,it} from "mocha";
const root=path.resolve(import.meta.dirname,"..");
describe("Futures production oracle gate",()=>{
 it("keeps MockLQCFuturesOracle test-only and wires a fail-closed production gate",()=>{
  const mock=fs.readFileSync(path.join(root,"contracts/futures/mocks/MockLQCFuturesOracle.sol"),"utf8");
  const gate=fs.readFileSync(path.join(root,"scripts/gate-futures-production-oracle.mjs"),"utf8");
  const pkg=JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
  assert.match(mock,/Test-only oracle/);
  assert.match(gate,/MockLQCFuturesOracle/);
  assert.match(gate,/no production Futures deployment\/config manifest exists/);
  assert.match(pkg.scripts["deploy:futures:production"],/^npm run gate:futures:production-oracle &&/);
 });
});
