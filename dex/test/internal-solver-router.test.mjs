import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
describe("6/1 Internal Solver Router 2.0 boundaries",function(){const s=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCInternalSolver.sol"),"utf8");
it("accepts execution only from the authenticated Intent Binding",function(){assert.match(s,/modifier onlyBinding/);assert.match(s,/function execute[^\{]+onlyBinding nonReentrant/)});
it("binds the complete route intent passed to Router 2.0",function(){for(const f of ["intentHash","dexId","tokenIn","tokenOut","amountIn","amountOutMinimum","recipient","deadline","routeData"])assert.match(s,new RegExp(f));assert.match(s,/executionRouter\.swapExactInput/)});
it("uses exact temporary Router approval and clears it after execution",function(){assert.match(s,/forceApprove\(address\(executionRouter\),r\.amountIn\)/);assert.match(s,/forceApprove\(address\(executionRouter\),0\)/)});
it("rejects pre-existing or residual tokenIn custody",function(){assert.match(s,/beforeBalance!=r\.amountIn/);assert.match(s,/if\(_balance\(r\.tokenIn\)!=0\)revert ResidualBalance/)});
it("guards the Binding-to-Router path against reentrancy",function(){assert.match(s,/modifier nonReentrant/);assert.match(s,/error Reentrancy/);});});
