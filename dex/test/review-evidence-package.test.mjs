import assert from "node:assert/strict";
import { ethers } from "ethers";
import { buildAppConfig } from "../scripts/app-config.mjs";
import { buildReviewEvidencePackage } from "../scripts/build-review-evidence-package.mjs";

const address = number => ethers.getAddress(`0x${number.toString(16).padStart(40, "0")}`);
const deployment = () => ({
  network: { name: "BSC Testnet", chainId: 97 }, sourceRevision: "a".repeat(40),
  contracts: { router: { address: address(1) }, quoteRouter: { address: address(2) },
    executionRouter: { address: address(3) }, nativeRouter: { address: address(4) },
    splitOptimizer: { address: address(5) }, autoRouter: { address: address(6) },
    gasCostOracle: { address: address(7) }, wbnb: { address: address(8), decimals: 18 },
    lqc: { address: address(9), decimals: 18 }, mockUsdt: { address: address(10), decimals: 18 } },
  dexes: [{ id: ethers.id("LQC_FLOW"), name: "LQC Flow", adapter: address(11) }],
  verification: { explorerVerifiedSource: false }
});
const inputs = () => {
  const deployed = deployment();
  return { deployment: deployed,
    monitoring: { schemaVersion: 2, checkedAt: "2026-09-09T02:00:00.000Z", network: { chainId: 97 },
      status: "HEALTHY", counts: { pass: 10, warning: 0, critical: 0 }, incident: null },
    emergencyDrill: { network: { chainId: 97 }, sourceRevision: deployed.sourceRevision,
      deploymentFingerprint: buildAppConfig(deployed).deploymentFingerprint, result: "PASS", drillId: "drill-001",
      completedAt: "2026-09-09T01:00:00.000Z", evidenceDigest: `sha256:${"b".repeat(64)}` } };
};

describe("LQC exchange and security review evidence package", function () {
  it("binds deployment, monitoring, and drill evidence without overstating readiness", function () {
    const report = buildReviewEvidencePackage(inputs());
    assert.equal(report.technicalEvidenceStatus, "PASS");
    assert.equal(report.submissionStatus, "INCOMPLETE");
    assert.deepEqual(report.pendingExternalEvidence,
      ["EXPLORER_VERIFIED_SOURCE", "INDEPENDENT_AUDIT", "LEGAL_KYB_PACKAGE"]);
    assert.match(report.packageDigest, /^sha256:[0-9a-f]{64}$/);
  });

  it("rejects mixed deployments, source revisions, and networks", function () {
    const mixed = inputs(); mixed.emergencyDrill.deploymentFingerprint = ethers.id("another-deployment");
    assert.throws(() => buildReviewEvidencePackage(mixed), /fingerprint/);
    const revision = inputs(); revision.emergencyDrill.sourceRevision = "c".repeat(40);
    assert.throws(() => buildReviewEvidencePackage(revision), /source revision/);
    const network = inputs(); network.monitoring.network.chainId = 56;
    assert.throws(() => buildReviewEvidencePackage(network), /chain 97/);
  });

  it("rejects unhealthy monitoring and marks complete external evidence ready for review", function () {
    const unhealthy = inputs(); unhealthy.monitoring.status = "CRITICAL"; unhealthy.monitoring.counts.critical = 1;
    assert.throws(() => buildReviewEvidencePackage(unhealthy), /HEALTHY/);
    const complete = inputs(); complete.deployment.verification.explorerVerifiedSource = true;
    complete.externalEvidence = { auditReportHash: `sha256:${"c".repeat(64)}`, legalPackageReference: "secure-submission:legal-001" };
    const report = buildReviewEvidencePackage(complete);
    assert.equal(report.submissionStatus, "READY_FOR_REVIEW");
    assert.deepEqual(report.pendingExternalEvidence, []);
  });
});
