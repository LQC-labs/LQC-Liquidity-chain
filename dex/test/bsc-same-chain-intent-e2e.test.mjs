import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("6/5 BSC same-chain Intent E2E gate",function(){
 const sdk=fs.readFileSync(path.resolve(import.meta.dirname,"../app/router-sdk.js"),"utf8");
 const core=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCCoreIntentState.sol"),"utf8");
 const escrow=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCSourceEscrow.sol"),"utf8");
 const hub=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCIntentHub.sol"),"utf8");
 const binding=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCIntentSolverBinding.sol"),"utf8");
 const solver=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCInternalSolver.sol"),"utf8");
 const router=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/router-v2/LQCExecutionRouter.sol"),"utf8");
 const receipt=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCExecutionReceipt.sol"),"utf8");

 it("pins canonical EIP-712 identity before same-chain execution",function(){assert.match(sdk,/hashScheme:'EIP712_V1'/);assert.match(sdk,/TypedDataEncoder\.hash/)});
 it("keeps replay and expiry gates ahead of custody execution",function(){assert.match(core,/NonceAlreadyUsed/);assert.match(core,/IntentExpired/);assert.match(escrow,/_requirePending\(intentHash\)/)});
 it("binds the exact intent into the Internal Solver request",function(){assert.match(binding,/r\.intentHash!=canonicalIntentHash/);assert.match(binding,/amountOut=solver\.execute\(r\)/)});
 it("uses exact temporary approval into Router 2.0 and requires zero residual input custody",function(){assert.match(solver,/forceApprove\(address\(executionRouter\),r\.amountIn\)/);assert.match(solver,/forceApprove\(address\(executionRouter\),0\)/);assert.match(solver,/_balance\(r\.tokenIn\)!=0/)});
 it("enforces Router deadline and minimum output",function(){assert.match(router,/block\.timestamp > deadline/);assert.match(router,/amountOut < amountOutMinimum/)});
 it("makes escrow-to-execution atomic and fail-closed",function(){assert.match(escrow,/executionTarget\.call\(executionCall\)/);assert.match(escrow,/if\(!ok\)\{assembly\{revert/);assert.match(escrow,/_markExecuted\(intentHash\)/)});
 it("records one chain-domain-separated execution receipt per intent",function(){assert.match(receipt,/ReceiptAlreadyExists/);assert.match(receipt,/block\.chainid,address\(this\),intentHash,executionHash/);});
 it("keeps the user path non-custodial outside the bounded atomic execution hop",function(){assert.doesNotMatch(hub,/transferFrom|forceApprove/);assert.match(solver,/ResidualBalance/);});
});
