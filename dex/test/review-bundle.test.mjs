import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ethers } from "ethers";
import { buildAppConfig } from "../scripts/app-config.mjs";
import { buildReviewBundle, writeReviewBundle } from "../scripts/build-review-bundle.mjs";

const address = number => ethers.getAddress(`0x${number.toString(16).padStart(40, "0")}`);
const inputs = () => {
  const deployment = { network: { name: "BSC Testnet", chainId: 97 }, sourceRevision: "a".repeat(40),
    contracts: { router: { address: address(1) }, quoteRouter: { address: address(2) }, executionRouter: { address: address(3) },
      nativeRouter: { address: address(4) }, splitOptimizer: { address: address(5) }, autoRouter: { address: address(6) },
      gasCostOracle: { address: address(7) }, wbnb: { address: address(8), decimals: 18 },
      lqc: { address: address(9), decimals: 18 } },
    dexes: [{ id: ethers.id("LQC_FLOW"), name: "LQC Flow", adapter: address(10) }],
    verification: { explorerVerifiedSource: false } };
  return { deployment,
    monitoring: { network: { chainId: 97 }, checkedAt: "2026-09-09T02:00:00.000Z", status: "HEALTHY",
      counts: { pass: 10, warning: 0, critical: 0 }, incident: null },
    emergencyDrill: { network: { chainId: 97 }, sourceRevision: deployment.sourceRevision,
      deploymentFingerprint: buildAppConfig(deployment).deploymentFingerprint, result: "PASS", drillId: "drill-001",
      completedAt: "2026-09-09T01:00:00.000Z", evidenceDigest: `sha256:${"b".repeat(64)}` } };
};

describe("LQC single-command review bundle", function () {
  it("binds JSON and Markdown outputs to one manifest", function () {
    const bundle = buildReviewBundle(inputs());
    assert.ok(bundle.markdown.includes(bundle.reviewPackage.packageDigest));
    assert.equal(bundle.bundleManifest.packageDigest, bundle.reviewPackage.packageDigest);
    assert.match(bundle.bundleManifest.bundleDigest, /^sha256:[0-9a-f]{64}$/);
    assert.equal(Object.keys(bundle.bundleManifest.files).length, 2);
  });

  it("inherits strict deployment, monitoring, and drill validation", function () {
    const invalid = inputs(); invalid.monitoring.status = "WARNING";
    assert.throws(() => buildReviewBundle(invalid), /HEALTHY/);
  });

  it("writes all outputs once and refuses to overwrite evidence", function () {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lqc-review-bundle-"));
    try {
      const result = writeReviewBundle(directory, buildReviewBundle(inputs()));
      assert.equal(result.files.length, 3);
      assert.equal(result.files.every(file => fs.existsSync(file)), true);
      assert.throws(() => writeReviewBundle(directory, buildReviewBundle(inputs())), /already exists/);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
