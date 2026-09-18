import assert from "node:assert/strict";
import fs from "node:fs";
import { buildLendingStage3DeploymentReview } from "../scripts/build-lending-stage3-deployment-review.mjs";

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
const manifest = read("../deployments/lending-stage3-manifest-bsc-testnet-97.json");
const preflight = read("../deployments/lending-stage3-live-preflight-bsc-testnet-97.json");

describe("LQC Lending Stage-3 deployment review", function () {
  it("binds one Core deployment to verified Stage-2 dependencies", function () {
    const review = buildLendingStage3DeploymentReview({ manifest, preflight });
    assert.equal(review.status, "AWAITING_EXPLICIT_DEPLOYMENT_APPROVAL");
    assert.equal(review.deployment.contract, "LQCLendingCore");
    assert.equal(review.deployment.nonce, "109");
    assert.equal(review.deployment.predictedAddress, "0x3a3C7303829318d4cbA955c71812679DAF5699ca");
    assert.equal(review.deployment.expectedBindings.registry, manifest.dependencies.marketRegistry);
    assert.equal(review.deployment.expectedBindings.interestIndex, manifest.dependencies.interestIndex);
    assert.equal(review.deployment.expectedBindings.liquidationEngine, "0x0000000000000000000000000000000000000000");
    assert.equal(review.budget.maximumGasBudgetWei, "357423400000000");
    assert.equal(review.transactionOccurred, false);
  });

  it("rejects manifest, preflight, address and gas substitution", function () {
    for (const mutate of [
      value => { value.manifestDigest = "sha256:bad"; },
      value => { value.stage2VerificationDigest = "sha256:bad"; },
      value => { value.deployment.predictedAddress = "0x0000000000000000000000000000000000000001"; },
      value => { value.deployment.approvedGasLimit = "1"; },
    ]) {
      const changed = structuredClone(preflight); mutate(changed);
      assert.throws(() => buildLendingStage3DeploymentReview({ manifest, preflight: changed }));
    }
  });

  it("contains no signing or transaction broadcast path", function () {
    const source = fs.readFileSync(new URL("../scripts/build-lending-stage3-deployment-review.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(source, /PRIVATE_KEY|window\.ethereum|signTransaction|eth_sendTransaction/);
  });
});
