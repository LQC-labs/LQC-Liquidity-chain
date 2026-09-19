import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("5/4 Nonce / Replay Protection integration boundaries",function(){
 const core=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCCoreIntentState.sol"),"utf8");
 const escrow=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCSourceEscrow.sol"),"utf8");
 const hub=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCIntentHub.sol"),"utf8");

 it("reserves one intent hash and one sender nonce at registration",function(){
   assert.match(core,/if\(_intents\[intentHash\]\.status!=IntentStatus\.None\) revert IntentAlreadyRegistered\(\)/);
   assert.match(core,/if\(_nonceIntent\[sender\]\[nonce\]!=bytes32\(0\)\) revert NonceAlreadyUsed\(\)/);
   assert.match(core,/_nonceIntent\[sender\]\[nonce\]=intentHash/);
 });
 it("never releases escrow without a Pending unexpired transition",function(){
   assert.match(escrow,/_markExecuted\(intentHash\)/);
   assert.match(core,/record=_intents\[intentHash\]/);
   assert.match(core,/record\.status!=IntentStatus\.Pending/);
   assert.match(core,/block\.timestamp>record\.deadline/);
 });
 it("makes execute, cancel and expiry terminal against replay",function(){
   assert.match(core,/_intents\[intentHash\]\.status=IntentStatus\.Executed/);
   assert.match(core,/_intents\[intentHash\]\.status=IntentStatus\.Cancelled/);
   assert.match(core,/record\.status=IntentStatus\.Expired/);
   assert.match(core,/if\(record\.status!=IntentStatus\.Pending\) revert IntentNotPending\(\)/);
 });
 it("keeps IntentHub execution behind the same escrow lifecycle gate",function(){
   assert.match(hub,/if\(status!=1\)revert IntentNotPending\(\)/);
   assert.match(hub,/if\(block\.timestamp>deadline\)revert IntentExpired\(\)/);
   assert.match(hub,/escrow\.release\(intentHash,recipient\)/);
 });
 it("does not clear sender nonce reservations after terminal states",function(){
   assert.doesNotMatch(core,/delete _nonceIntent/);
   assert.doesNotMatch(escrow,/delete _nonceIntent/);
 });
});
