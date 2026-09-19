import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
describe("6/2 Solver Reputation boundaries",function(){const s=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCSolverReputation.sol"),"utf8");
it("accepts performance records only from the configured reporter",function(){assert.match(s,/modifier onlyReporter/);assert.match(s,/recordResult[^\{]+onlyReporter/)});
it("tracks success ratio and execution quality separately",function(){assert.match(s,/uint64 successes/);assert.match(s,/uint64 failures/);assert.match(s,/qualityPoints/);assert.match(s,/qualitySamples/)});
it("bounds all quality scores to basis points",function(){assert.match(s,/qualityBps>10000/);assert.match(s,/minimumSuccessBps_>10000/)});
it("requires registry capital eligibility plus reputation",function(){assert.match(s,/registry\.solvers\(solver\)/);assert.match(s,/active&&bond>0&&exposure<=bond&&successBps\(solver\)>=minimumSuccessBps/)});
it("keeps policy changes owner-only",function(){assert.match(s,/setReporter\(address next\) external onlyOwner/);assert.match(s,/setMinimumSuccessBps\(uint256 next\) external onlyOwner/)});});
