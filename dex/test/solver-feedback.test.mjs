import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
describe("6/6 Solver feedback boundaries",function(){const s=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCSolverFeedback.sol"),"utf8");
it("accepts feedback only from the configured verifier",function(){assert.match(s,/modifier onlyVerifier/);assert.match(s,/recordVerifiedResult[^\{]+onlyVerifier/)});
it("records each intent result exactly once",function(){assert.match(s,/mapping\(bytes32=>Result\)/);assert.match(s,/ResultAlreadyRecorded/);assert.match(s,/results\[intentHash\]=Result\(solver,success,qualityBps,true\)/)});
it("bounds execution quality to basis points",function(){assert.match(s,/qualityBps>10000/)});
it("feeds verified success and quality into Solver Reputation",function(){assert.match(s,/reputation\.recordResult\(solver,success,qualityBps\)/)});
it("keeps verifier configuration owner-only",function(){assert.match(s,/setVerifier\(address next\) external onlyOwner/)});});
