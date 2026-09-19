import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
describe("6/3 Best Execution Score boundaries",function(){const s=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCBestExecutionScore.sol"),"utf8");
it("starts from user net output after gas cost",function(){assert.match(s,/uint256 netOut=q\.amountOut-q\.gasCostOut/)});
it("combines execution quality, success and free bonded capital",function(){assert.match(s,/averageQualityBps/);assert.match(s,/successBps/);assert.match(s,/freeCapitalBps=\(bond-exposure\)\*BPS\/bond/)});
it("penalizes price impact and excludes ineligible solvers",function(){assert.match(s,/executionBps=BPS-q\.priceImpactBps/);assert.match(s,/reputation\.eligible\(q\.solver\)/)});
it("uses deterministic tie breaking",function(){assert.match(s,/candidate==bestScore&&net>netAmountOut/);assert.match(s,/uint160\(q\.solver\)<uint160\(solver\)/)});
it("fails closed when no solver is eligible",function(){assert.match(s,/if\(solver==address\(0\)\)revert NoEligibleSolver\(\)/)});});
