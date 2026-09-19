import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("5/5 Deadline / Expiry boundaries",function(){
 const core=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCCoreIntentState.sol"),"utf8");
 const escrow=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCSourceEscrow.sol"),"utf8");
 const hub=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCIntentHub.sol"),"utf8");

 it("requires a future deadline at registration",function(){
   assert.match(core,/if\(deadline<=block\.timestamp\) revert InvalidDeadline\(\)/);
 });
 it("allows execution at the exact deadline but rejects after it",function(){
   assert.match(core,/if\(block\.timestamp>record\.deadline\) revert IntentExpired\(\)/);
   assert.match(hub,/if\(block\.timestamp>deadline\)revert IntentExpired\(\)/);
   assert.doesNotMatch(core,/block\.timestamp>=record\.deadline/);
 });
 it("marks expiry only strictly after the deadline",function(){
   assert.match(core,/if\(block\.timestamp<=record\.deadline\) revert IntentNotExpired\(\)/);
   assert.match(core,/record\.status=IntentStatus\.Expired/);
 });
 it("refunds expired escrow only to the original sender and deletes custody first",function(){
   const start=escrow.indexOf("function expireAndRefund");
   const body=escrow.slice(start,escrow.indexOf("}",start)+1);
   assert.match(escrow,/IntentRecord memory r=_intents\[intentHash\]/);
   assert.match(escrow,/_markExpired\(intentHash\)/);
   assert.ok(escrow.indexOf("delete escrows[intentHash]",start)<escrow.indexOf("transfer(r.sender,e.amount)",start));
 });
 it("keeps cancellation and expiry distinct terminal paths",function(){
   assert.match(escrow,/function cancelAndRefund/);assert.match(escrow,/function expireAndRefund/);
   assert.match(core,/IntentStatus\.Cancelled/);assert.match(core,/IntentStatus\.Expired/);
 });
});
