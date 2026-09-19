import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
describe("6/3 Escrow to Router execution boundaries",function(){const s=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCSourceEscrow.sol"),"utf8");
it("allows atomic execution handoff only from IntentHub",function(){assert.match(s,/function executeThrough[^\{]+onlyHub nonReentrant/)});
it("requires Pending intent and deletes escrow accounting before external calls",function(){const i=s.indexOf("function executeThrough");assert.ok(s.indexOf("_requirePending(intentHash)",i)<s.indexOf("executionTarget.call",i));assert.ok(s.indexOf("delete escrows[intentHash]",i)<s.indexOf("transfer(executionTarget,e.amount)",i));});
it("moves the exact escrowed amount to the execution target",function(){assert.match(s,/transfer\(executionTarget,e\.amount\)/)});
it("bubbles target failure so transfer and accounting roll back atomically",function(){assert.match(s,/if\(!ok\)\{assembly\{revert\(add\(data,32\),mload\(data\)\)\}\}/)});
it("marks Executed only after the target call succeeds",function(){const i=s.indexOf("function executeThrough");assert.ok(s.indexOf("_markExecuted(intentHash)",i)>s.indexOf("executionTarget.call",i));});});
