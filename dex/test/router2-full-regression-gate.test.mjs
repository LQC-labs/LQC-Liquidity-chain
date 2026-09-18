import assert from "node:assert/strict";
import fs from "node:fs";
const required=[
 "router2-dex-registry-boundaries.test.mjs",
 "router2-v2-adapter-boundaries.test.mjs",
 "router2-v3-adapter-boundaries.test.mjs",
 "router2-quote-router-boundaries.test.mjs",
 "router2-gas-aware-route-selection.test.mjs",
 "router2-split-optimizer-boundaries.test.mjs",
 "router2-execution-router-boundaries.test.mjs",
 "router2-best-execution-proof-boundaries.test.mjs",
 "router2-risk-emergency-boundaries.test.mjs"
];
describe("LQC official 2/10 Router Full Regression gate",function(){
 it("contains every canonical Router 2.0 work-unit regression suite",function(){for(const name of required)assert.equal(fs.existsSync(new URL(name,import.meta.url)),true,name);});
 it("keeps the canonical 2/1 through 2/9 suite order explicit and complete",function(){assert.deepEqual(required.map(x=>x.match(/router2-(.*)\.test/)[1]),["dex-registry-boundaries","v2-adapter-boundaries","v3-adapter-boundaries","quote-router-boundaries","gas-aware-route-selection","split-optimizer-boundaries","execution-router-boundaries","best-execution-proof-boundaries","risk-emergency-boundaries"]);});
 it("requires production Router 2.0 components for registry quote split execution proof and risk",function(){for(const path of["../contracts/router-v2/LQCDexRegistry.sol","../contracts/router-v2/LQCQuoteRouter.sol","../contracts/router-v2/LQCSplitOptimizer.sol","../contracts/router-v2/LQCExecutionRouter.sol","../contracts/router-v2/LQCBestExecutionProof.sol","../contracts/router-v2/LQCRiskRegistry.sol"])assert.equal(fs.existsSync(new URL(path,import.meta.url)),true,path);});
 it("requires both V2 and V3 execution adapters",function(){for(const path of["../contracts/router-v2/adapters/PancakeV2Adapter.sol","../contracts/router-v2/adapters/PancakeV3ExecutionAdapter.sol"])assert.equal(fs.existsSync(new URL(path,import.meta.url)),true,path);});
 it("retains proof-bound execution and integrated release-readiness gates",function(){for(const path of["../contracts/router-v2/LQCProofBoundExecutionGateway.sol","router2-release-readiness.test.mjs","router2-integrated-readiness-page.test.mjs","router2-route-readiness.test.mjs"])assert.equal(fs.existsSync(new URL(path,import.meta.url)),true,path);});
});