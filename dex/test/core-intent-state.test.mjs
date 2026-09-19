import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("5/1 Core Intent State boundaries",function(){
 const source=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCCoreIntentState.sol"),"utf8");
 it("defines one canonical lifecycle shared by later Intent components",function(){
   assert.match(source,/enum IntentStatus \{ None, Pending, Executed, Cancelled, Expired \}/);
   assert.match(source,/mapping\(bytes32 => IntentRecord\)/);
   assert.match(source,/mapping\(address => mapping\(uint256 => bytes32\)\)/);
 });
 it("fails closed on hash replay, nonce reuse, expiry, and non-sender cancellation",function(){
   assert.match(source,/IntentAlreadyRegistered/);assert.match(source,/NonceAlreadyUsed/);
   assert.match(source,/if\(block\.timestamp>record\.deadline\) revert IntentExpired\(\)/);
   assert.match(source,/if\(caller!=record\.sender\) revert UnauthorizedIntentSender\(\)/);
 });
 it("keeps terminal states one-way",function(){
   assert.match(source,/if\(record\.status!=IntentStatus\.Pending\) revert IntentNotPending\(\)/);
   assert.match(source,/IntentStatus\.Executed/);assert.match(source,/IntentStatus\.Cancelled/);assert.match(source,/IntentStatus\.Expired/);
 });
});
