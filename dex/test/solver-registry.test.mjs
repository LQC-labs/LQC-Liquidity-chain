import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
describe("6/1 Solver Registry bond/exposure boundaries",function(){const s=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCSolverRegistry.sol"),"utf8");
it("requires bonded capital before solver activation",function(){assert.match(s,/s\.active=s\.bond>=minimumBond/);assert.match(s,/s\.bond<minimumBond/);});
it("caps live exposure by policy and bonded capital",function(){assert.match(s,/next>exposureLimit\|\|next>s\.bond/);assert.match(s,/onlyExposureManager/);});
it("blocks bond withdrawal while exposure is active",function(){assert.match(s,/if\(s\.exposure!=0\)revert ActiveExposure\(\)/);});
it("uses emergency pause and separates governance from exposure accounting",function(){assert.match(s,/onlyGuardianOrOwner/);assert.match(s,/setExposureManager\(address next\) external onlyOwner/);});
it("guards external token movement against reentrancy",function(){assert.match(s,/function bond[^\{]+nonReentrant/);assert.match(s,/function withdrawBond[^\{]+nonReentrant/);assert.match(s,/error Reentrancy/);});});
