import assert from "node:assert/strict";
import crypto from "node:crypto";
import { renderReviewEvidenceMarkdown } from "../scripts/render-review-evidence-markdown.mjs";

const seal = manifest => ({ ...manifest,
  packageDigest: `sha256:${crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex")}` });
const base = () => seal({ schemaVersion: 1, packageType: "LQC_CEX_SECURITY_REVIEW_EVIDENCE",
  network: { name: "BSC Testnet", chainId: 97 }, technicalEvidenceStatus: "PASS", submissionStatus: "INCOMPLETE",
  sourceRevision: "a".repeat(40), deploymentFingerprint: `0x${"b".repeat(64)}`,
  roleReviewFingerprint: `0x${"c".repeat(64)}`,
  artifacts: {
    deployment: { digest: `sha256:${"1".repeat(64)}` },
    monitoring: { digest: `sha256:${"2".repeat(64)}`, status: "HEALTHY", checkedAt: "2026-09-09T02:00:00.000Z" },
    emergencyDrill: { digest: `sha256:${"3".repeat(64)}`, evidenceDigest: `sha256:${"4".repeat(64)}`,
      drillId: "drill-001", completedAt: "2026-09-09T01:00:00.000Z" }
  }, pendingExternalEvidence: ["EXPLORER_VERIFIED_SOURCE", "INDEPENDENT_AUDIT", "LEGAL_KYB_PACKAGE"],
  externalEvidence: { auditReportHash: null, legalPackageReference: null }
});

describe("LQC review evidence Markdown summary", function () {
  it("renders a reviewer-readable baseline, evidence table, and pending gates", function () {
    const markdown = renderReviewEvidenceMarkdown(base());
    assert.match(markdown, /INCOMPLETE — EXTERNAL EVIDENCE REQUIRED/);
    assert.match(markdown, /\| Operational monitoring \| HEALTHY \|/);
    assert.match(markdown, /- \[ \] INDEPENDENT_AUDIT/);
    assert.match(markdown, /drill-001/);
    assert.match(markdown, /Role review fingerprint/);
  });

  it("rejects a tampered package or missing artifact digest", function () {
    const tampered = base(); tampered.sourceRevision = "c".repeat(40);
    assert.throws(() => renderReviewEvidenceMarkdown(tampered), /digest mismatch/);
    const missing = base(); delete missing.artifacts.monitoring.digest;
    const resealed = seal(Object.fromEntries(Object.entries(missing).filter(([key]) => key !== "packageDigest")));
    assert.throws(() => renderReviewEvidenceMarkdown(resealed), /monitoring artifact digest/);
  });

  it("escapes Markdown table delimiters in external references", function () {
    const input = base();
    const manifest = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "packageDigest"));
    manifest.externalEvidence.legalPackageReference = "secure|reference\nreviewed";
    const markdown = renderReviewEvidenceMarkdown(seal(manifest));
    assert.match(markdown, /secure\\\|reference reviewed/);
  });
});
