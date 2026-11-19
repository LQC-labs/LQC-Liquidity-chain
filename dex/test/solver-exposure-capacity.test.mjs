import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
describe("7/4 Solver Exposure / Capacity official gate",function(){const s=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCSolverRegistry.sol"),"utf8");
it("allows exposure accounting only through the configured exposure manager",function(){assert.match(s,/modifier onlyExposureManager/);assert.match(s,/increaseExposure[^\{]+onlyExposureManager/);assert.match(s,/decreaseExposure[^\{]+onlyExposureManager/)});
it("requires an active solver with minimum bonded capital before exposure",function(){assert.match(s,/!s\.active\|\|s\.bond<minimumBond/);});
it("caps exposure by both protocol policy and solver bond",function(){assert.match(s,/next>exposureLimit\|\|next>s\.bond/);});
it("blocks bond withdrawal while any live exposure remains",function(){assert.match(s,/if\(s\.exposure!=0\)revert ActiveExposure\(\)/);});
it("fails closed on exposure underflow",function(){assert.match(s,/if\(amount>s\.exposure\)revert InvalidAmount\(\)/);});
it("lets guardian or owner pause new exposure while keeping de-risking available",function(){assert.match(s,/setPaused\(bool value\) external onlyGuardianOrOwner/);assert.match(s,/function increaseExposure[\s\S]*?if\(paused\)revert Paused\(\)/);assert.doesNotMatch(s,/function decreaseExposure[\s\S]*?if\(paused\)revert Paused\(\)/);});
});
