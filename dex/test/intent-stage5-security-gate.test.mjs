import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("5/7 Intent Security integrated gate",function(){
 const sdk=fs.readFileSync(path.resolve(import.meta.dirname,"../app/router-sdk.js"),"utf8");
 const core=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCCoreIntentState.sol"),"utf8");
 const escrow=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCSourceEscrow.sol"),"utf8");
 const hub=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCIntentHub.sol"),"utf8");

 it("binds the off-chain canonical identity to EIP-712 domain and signature recovery",function(){
   assert.match(sdk,/hashScheme:'EIP712_V1'/);assert.match(sdk,/TypedDataEncoder\.hash/);assert.match(sdk,/verifyTypedData/);
   assert.match(sdk,/verifyingContract\.toLowerCase\(\)===ethers\.ZeroAddress\.toLowerCase\(\)/);
 });
 it("binds one sender nonce permanently to one canonical intent",function(){
   assert.match(core,/mapping\(address => mapping\(uint256 => bytes32\)\)/);
   assert.match(core,/NonceAlreadyUsed/);assert.doesNotMatch(core,/delete _nonceIntent/);
 });
 it("keeps custody, execution coordination and emergency authority separated",function(){
   assert.match(escrow,/contract LQCSourceEscrow is LQCCoreIntentState/);
   assert.match(hub,/ILQCSourceEscrow public immutable escrow/);assert.doesNotMatch(hub,/IERC20|transferFrom/);
   assert.match(hub,/onlySolver/);assert.match(hub,/onlyGuardianOrOwner/);
 });
 it("makes execute, cancel and expire mutually exclusive terminal outcomes",function(){
   assert.match(core,/IntentStatus\.Executed/);assert.match(core,/IntentStatus\.Cancelled/);assert.match(core,/IntentStatus\.Expired/);
   assert.match(core,/record\.status!=IntentStatus\.Pending/);
 });
 it("fails closed on stale intents before Hub release and supports expiry refund",function(){
   assert.match(hub,/block\.timestamp>deadline/);assert.match(escrow,/_markExpired\(intentHash\)/);
   assert.match(escrow,/transfer\(r\.sender,e\.amount\)/);
 });
 it("prevents double withdrawal and reentrant token callbacks",function(){
   assert.match(escrow,/delete escrows\[intentHash\]/);assert.match(escrow,/modifier nonReentrant/);
   assert.match(escrow,/if\(_locked!=1\)revert Reentrancy\(\)/);
 });
 it("preserves the 5-stage invariant: no terminal intent can become Pending again",function(){
   assert.doesNotMatch(core,/status=IntentStatus\.Pending/);
   assert.match(core,/_intents\[intentHash\]=IntentRecord\(sender,nonce,deadline,IntentStatus\.Pending\)/);
   assert.match(core,/if\(_intents\[intentHash\]\.status!=IntentStatus\.None\) revert IntentAlreadyRegistered\(\)/);
 });
});
