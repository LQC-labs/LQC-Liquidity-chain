import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {describe,it} from "mocha";
const root=path.resolve(import.meta.dirname,"..");
describe("Futures mobile testnet token artifact",()=>{
 it("includes MockERC20 only in the explicitly testnet artifact builder",()=>{
  const build=fs.readFileSync(path.join(root,"scripts/build-futures-mobile-testnet-artifacts.mjs"),"utf8");
  const gate=fs.readFileSync(path.join(root,"scripts/gate-futures-production-oracle.mjs"),"utf8");
  assert.ok(build.includes('TestToken:["contracts/mocks/MockERC20.sol","MockERC20"]'));
  assert.ok(gate.includes("MockERC20"));
 });
});
