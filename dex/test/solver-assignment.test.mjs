import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
describe("6/4 Solver Assignment boundaries",function(){const s=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCSolverAssignment.sol"),"utf8");
it("binds one intent to one solver, quote hash, score and expiry",function(){assert.match(s,/mapping\(bytes32=>Assignment\)/);assert.match(s,/Assignment\(solver,quoteHash,score,expiresAt,false\)/)});
it("allows assignment only from the configured selection authority",function(){assert.match(s,/modifier onlyAssigner/);assert.match(s,/function assign[^\{]+onlyAssigner/)});
it("prevents reassignment and stale assignment execution",function(){assert.match(s,/AlreadyAssigned/);assert.match(s,/block\.timestamp>a\.expiresAt/);});
it("lets only IntentHub consume the exact selected solver and quote once",function(){assert.match(s,/modifier onlyIntentHub/);assert.match(s,/if\(a\.solver!=solver\)revert WrongSolver/);assert.match(s,/if\(a\.quoteHash!=quoteHash\)/);assert.match(s,/if\(a\.consumed\)revert AssignmentConsumed/);});
});
