import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
describe("6/3 Escrow to Router execution boundaries",function(){const s=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCSourceEscrow.sol"),"utf8");
it("allows atomic execution handoff only from IntentHub",function(){assert.match(s,/function executeThrough[^\{]+onlyHub nonReentrant/)});
it("keeps Pending escrow readable for authenticated validation and deletes it only after success",function(){const i=s.indexOf("function executeThrough");const call=s.indexOf("executionTarget.call",i);const deletion=s.indexOf("delete escrows[intentHash]",i);const mark=s.indexOf("_markExecuted(intentHash)",i);assert.ok(s.indexOf("_requirePending(intentHash)",i)<call);assert.ok(deletion>call);assert.ok(mark>deletion);});
it("moves the exact escrowed amount to the execution target",function(){assert.match(s,/transfer\(executionTarget,e\.amount\)/)});
it("bubbles target failure so transfer and accounting roll back atomically",function(){assert.match(s,/if\(!ok\)\{assembly\{revert\(add\(data,32\),mload\(data\)\)\}\}/)});
it("guards the readable escrow record against reentrant consumption",function(){assert.match(s,/function executeThrough[^\{]+onlyHub nonReentrant/);assert.match(s,/modifier nonReentrant/)});
it("marks Executed only after target success and escrow deletion",function(){const i=s.indexOf("function executeThrough");assert.ok(s.indexOf("_markExecuted(intentHash)",i)>s.indexOf("delete escrows[intentHash]",i));});});
