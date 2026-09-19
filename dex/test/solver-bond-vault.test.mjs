import assert from "node:assert/strict";import fs from "node:fs";import path from "node:path";
describe("7/3 Stablecoin/LQC Bond boundaries",function(){const s=fs.readFileSync(path.resolve(import.meta.dirname,"../contracts/intent-v1/LQCSolverBondVault.sol"),"utf8");
it("accepts only the configured Stablecoin and LQC bond assets",function(){assert.match(s,/asset!=stablecoin&&asset!=lqcToken/);});
it("values Stablecoin at full collateral and LQC with a conservative initial haircut",function(){assert.match(s,/AssetPolicy\(true,10000\)/);assert.match(s,/AssetPolicy\(true,7000\)/);});
it("caps collateral factors at 100 percent and keeps policy owner-only",function(){assert.match(s,/collateralBps==0\|\|collateralBps>10000/);assert.match(s,/setAssetPolicy[^\{]+onlyOwner/)});
it("tracks raw per-asset balances separately from weighted bond capacity",function(){assert.match(s,/mapping\(address=>mapping\(address=>uint256\)\) public balances/);assert.match(s,/mapping\(address=>uint256\) public weightedBond/)});
it("guards token-moving paths and supports emergency deposit pause",function(){assert.match(s,/function deposit[^\{]+nonReentrant/);assert.match(s,/function withdraw[^\{]+nonReentrant/);assert.match(s,/if\(paused\)revert Paused/);});});
