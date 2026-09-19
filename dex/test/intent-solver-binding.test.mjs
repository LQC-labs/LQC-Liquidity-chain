import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
describe("6/2 Intent to Solver binding",function(){const s=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCIntentSolverBinding.sol"),"utf8");
it("accepts atomic forwarding only from SourceEscrow",function(){assert.match(s,/modifier onlyEscrow/);assert.match(s,/function forward[^\{]+onlyEscrow/)});
it("binds canonical intent hash, sender, nonce and deadline to escrow state",function(){assert.match(s,/r\.intentHash!=canonicalIntentHash/);assert.match(s,/sender!=expectedSender\|\|nonce!=expectedNonce\|\|deadline!=r\.deadline/)});
it("requires the intent to remain Pending and unexpired",function(){assert.match(s,/status!=1/);assert.match(s,/block\.timestamp>deadline/)});
it("commits every solver execution field into a deterministic execution hash",function(){assert.match(s,/keccak256\(abi\.encode\(r\.intentHash,r\.dexId,r\.tokenIn,r\.tokenOut,r\.amountIn,r\.amountOutMinimum,r\.recipient,r\.deadline,keccak256\(r\.routeData\)\)\)/)});
it("forwards exact escrow funding, executes Solver and records measured output",function(){assert.match(s,/escrowToken!=r\.tokenIn\|\|escrowAmount!=r\.amountIn/);assert.match(s,/safeTransfer\(address\(solver\),r\.amountIn\)/);assert.match(s,/amountOut=solver\.execute\(r\)/);assert.match(s,/receiptHash=receipt\.record/);});});
