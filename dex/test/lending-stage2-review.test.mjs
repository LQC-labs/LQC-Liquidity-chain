import assert from "node:assert/strict";
import fs from "node:fs";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { buildLendingStage2DeploymentReview } from "../scripts/build-lending-stage2-deployment-review.mjs";

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), "utf8"));
const manifest = read("../deployments/lending-stage2-manifest-bsc-testnet-97.json");
const preflight = read("../deployments/lending-stage2-live-preflight-bsc-testnet-97.json");

describe("LQC Lending Stage-2 deployment review", function () {
  it("reproduces the dual-RPC preflight record and exact budget", function () {
    const review = buildLendingStage2DeploymentReview({ manifest, preflight });
    assert.equal(review.status, "AWAITING_EXPLICIT_DEPLOYMENT_APPROVAL");
    assert.equal(review.deployments.length, 2);
    assert.deepEqual(review.deployments.map(item => item.nonce), ["107", "108"]);
    assert.equal(review.budget.maximumGasBudgetTbnb, "0.00023849856");
    assert.equal(review.reviewDigest, canonicalDigest(Object.fromEntries(Object.entries(review).filter(([key]) => key !== "reviewDigest"))));
  });

  it("pins Registry and Index dependency bindings", function () {
    const review = buildLendingStage2DeploymentReview({ manifest, preflight });
    assert.equal(review.deployments[0].expectedBindings.oracle, manifest.dependencies.oracleManager);
    assert.equal(review.deployments[0].expectedBindings.guardian, manifest.roles.guardianSafe);
    assert.equal(review.deployments[1].expectedBindings.rateModel, manifest.dependencies.interestRateModel);
    assert.equal(review.deployments[1].expectedBindings.core, "0x0000000000000000000000000000000000000000");
  });

  it("rejects substituted address, gas and digest evidence", function () {
    for (const mutate of [
      value => { value.deployments[0].predictedAddress = value.deployments[1].predictedAddress; },
      value => { value.deployments[0].approvedGasLimit = "1"; },
      value => { value.preflightDigest = "sha256:" + "0".repeat(64); },
    ]) {
      const changed = structuredClone(preflight); mutate(changed);
      assert.throws(() => buildLendingStage2DeploymentReview({ manifest, preflight: changed }), /evidence|mismatch/);
    }
  });

  it("contains no wallet, signing or broadcast path", function () {
    const source = fs.readFileSync(new URL("../scripts/build-lending-stage2-deployment-review.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(source, /PRIVATE_KEY|window\.ethereum|signTransaction|eth_sendTransaction/);
  });
});
