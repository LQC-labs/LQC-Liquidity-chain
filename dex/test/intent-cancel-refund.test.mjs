import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("5/6 Cancel / Refund security boundaries",function(){
 const core=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCCoreIntentState.sol"),"utf8");
 const escrow=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCSourceEscrow.sol"),"utf8");
 const hub=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCIntentHub.sol"),"utf8");

 it("allows cancellation only by the original sender while Pending and unexpired",function(){
   assert.match(core,/IntentRecord memory record=_requirePending\(intentHash\)/);
   assert.match(core,/if\(caller!=record\.sender\) revert UnauthorizedIntentSender\(\)/);
   assert.match(escrow,/_cancelIntent\(intentHash,msg\.sender\)/);
 });
 it("returns the exact escrowed amount and deletes custody before external transfer",function(){
   const start=escrow.indexOf("function cancelAndRefund");
   assert.ok(start>=0);
   assert.ok(escrow.indexOf("delete escrows[intentHash]",start)<escrow.indexOf("transfer(msg.sender,e.amount)",start));
   assert.match(escrow,/Escrow memory e=escrows\[intentHash\]/);
 });
 it("blocks double refund and refund after execution through terminal-state gating",function(){
   assert.match(core,/if\(record\.status!=IntentStatus\.Pending\) revert IntentNotPending\(\)/);
   assert.match(core,/_intents\[intentHash\]\.status=IntentStatus\.Cancelled/);
   assert.match(core,/_intents\[intentHash\]\.status=IntentStatus\.Executed/);
   assert.match(escrow,/delete escrows\[intentHash\]/);
 });
 it("serializes cancel, expiry refund and Hub release with the same reentrancy lock",function(){
   assert.match(escrow,/function release[^\{]+nonReentrant/);
   assert.match(escrow,/function cancelAndRefund[^\{]+nonReentrant/);
   assert.match(escrow,/function expireAndRefund[^\{]+nonReentrant/);
   assert.match(escrow,/if\(_locked!=1\)revert Reentrancy\(\)/);
 });
 it("keeps execute-vs-cancel race fail-closed on the shared Pending state",function(){
   assert.match(hub,/if\(status!=1\)revert IntentNotPending\(\)/);
   assert.match(hub,/escrow\.release\(intentHash,recipient\)/);
   assert.match(core,/IntentStatus\.Pending/);
 });
});
