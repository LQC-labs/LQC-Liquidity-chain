import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const requiredSuites=[
  "dex/test/lending-core.test.mjs",
  "dex/test/lending-collateral-boundaries.test.mjs",
  "dex/test/lending-supply-withdraw-boundaries.test.mjs",
  "dex/test/lending-borrow-boundaries.test.mjs",
  "dex/test/lending-repay-boundaries.test.mjs",
  "dex/test/lending-interest.test.mjs",
  "dex/test/lending-health-factor-boundaries.test.mjs",
  "dex/test/lending-liquidation-boundaries.test.mjs",
  "dex/test/lending-bad-debt-reserve-gate.test.mjs",
  "dex/test/lending-security-invariant-gate.test.mjs"
];

test("Master 6/13 reuses the existing Lending regression surface instead of rebuilding it",()=>{
  for(const file of requiredSuites) assert.ok(fs.existsSync(file),file);
});

test("Master 6/13 is chained to the verified 10/10 clean BSC Testnet deployment",()=>{
  const v=JSON.parse(fs.readFileSync("dex/deployments/master6-clean-post-deployment-verification-bsc-testnet-97.json","utf8"));
  assert.equal(v.status,"VERIFIED_10_OF_10_CLEAN_DEPLOYMENT");
  assert.equal(v.network.chainId,97);
  assert.equal(v.deployments.length,10);
  assert.equal(v.finalPendingNonce,"27");
  assert.equal(v.transactionOccurred,true);
});

test("Master 6/13 readiness does not silently activate Lending",()=>{
  const v=JSON.parse(fs.readFileSync("dex/deployments/master6-clean-post-deployment-verification-bsc-testnet-97.json","utf8"));
  assert.equal(v.activationAuthorized,false);
  assert.equal(v.governanceConfigurationAuthorized,false);
});
