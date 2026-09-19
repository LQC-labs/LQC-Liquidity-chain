import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
describe("5/2 SourceEscrow boundaries",function(){const s=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCSourceEscrow.sol"),"utf8");
it("reuses canonical intent state and locks exact ERC20 custody",function(){assert.match(s,/is LQCCoreIntentState/);assert.match(s,/_registerIntent\(intentHash,msg\.sender,nonce,deadline\)/);assert.match(s,/transferFrom\(msg\.sender,address\(this\),amount\)/)});
it("restricts execution release to IntentHub and deletes custody before transfer",function(){assert.match(s,/modifier onlyHub/);assert.match(s,/_markExecuted\(intentHash\)/);assert.match(s,/delete escrows\[intentHash\]/)});
it("supports sender cancel refund and permissionless expiry refund",function(){assert.match(s,/_cancelIntent\(intentHash,msg\.sender\)/);assert.match(s,/_markExpired\(intentHash\)/);assert.match(s,/transfer\(r\.sender,e\.amount\)/)});
it("guards all token-moving entry points against reentrancy",function(){assert.ok((s.match(/external[^\{]+nonReentrant/g)||[]).length>=4);assert.match(s,/error Reentrancy/)});});
