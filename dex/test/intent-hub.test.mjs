import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
describe("5/3 IntentHub boundaries",function(){const s=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCIntentHub.sol"),"utf8");
it("keeps custody in SourceEscrow and coordinates release only",function(){assert.match(s,/ILQCSourceEscrow public immutable escrow/);assert.match(s,/escrow\.release\(intentHash,recipient\)/);assert.doesNotMatch(s,/transferFrom|IERC20/)});
it("restricts execution to the configured solver",function(){assert.match(s,/modifier onlySolver/);assert.match(s,/executeIntent\(bytes32 intentHash,address recipient\) external onlySolver/)});
it("fails closed on pause, non-pending state, expiry and zero recipient",function(){assert.match(s,/modifier whenActive/);assert.match(s,/status!=1/);assert.match(s,/block\.timestamp>deadline/);assert.match(s,/recipient==address\(0\)/)});
it("separates owner configuration and guardian emergency pause",function(){assert.match(s,/setSolver\(address next\) external onlyOwner/);assert.match(s,/setPaused\(bool value\) external onlyGuardianOrOwner/)});
});
