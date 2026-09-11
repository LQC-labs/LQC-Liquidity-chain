import fs from "node:fs";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";

const digest = value => `sha256:${crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const cell = value => String(value ?? "—").replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");

export function renderReviewEvidenceMarkdown(reviewPackage) {
  if (reviewPackage?.schemaVersion !== 1 || reviewPackage.packageType !== "LQC_CEX_SECURITY_REVIEW_EVIDENCE") {
    throw new Error("Unsupported LQC review evidence package.");
  }
  const { packageDigest, ...manifest } = reviewPackage;
  if (digest(manifest) !== packageDigest) throw new Error("Review package digest mismatch.");
  if (!/^[0-9a-f]{40}$/.test(reviewPackage.sourceRevision || "") ||
      !/^0x[0-9a-fA-F]{64}$/.test(reviewPackage.deploymentFingerprint || "") ||
      !/^0x[0-9a-fA-F]{64}$/.test(reviewPackage.roleReviewFingerprint || "")) {
    throw new Error("Review package source revision or fingerprint is invalid.");
  }
  const artifacts = reviewPackage.artifacts || {};
  for (const name of ["deployment", "monitoring", "emergencyDrill"]) {
    if (!/^sha256:[0-9a-f]{64}$/.test(artifacts[name]?.digest || "")) throw new Error(`Missing ${name} artifact digest.`);
  }
  const pending = reviewPackage.pendingExternalEvidence || [];
  const statusLabel = reviewPackage.submissionStatus === "READY_FOR_REVIEW" ? "READY FOR REVIEW" : "INCOMPLETE — EXTERNAL EVIDENCE REQUIRED";
  const rows = [
    ["Deployment record", "PASS", artifacts.deployment.digest],
    ["Operational monitoring", artifacts.monitoring.status, artifacts.monitoring.digest],
    ["Emergency recovery drill", "PASS", artifacts.emergencyDrill.evidenceDigest],
    ["Independent audit", pending.includes("INDEPENDENT_AUDIT") ? "PENDING" : "PROVIDED", reviewPackage.externalEvidence?.auditReportHash],
    ["Explorer verified source", pending.includes("EXPLORER_VERIFIED_SOURCE") ? "PENDING" : "VERIFIED", "Deployment verification record"],
    ["Legal / KYB package", pending.includes("LEGAL_KYB_PACKAGE") ? "PENDING" : "PROVIDED", reviewPackage.externalEvidence?.legalPackageReference]
  ];
  return [
    "# LQC Exchange & Security Review Evidence Summary",
    "",
    `**Submission status:** ${statusLabel}`,
    "",
    "This summary is generated from a cryptographically bound evidence manifest. It is not an audit, legal approval, listing approval, or mainnet-readiness claim.",
    "",
    "## Review baseline",
    "",
    "| Field | Value |",
    "|---|---|",
    `| Network | ${cell(reviewPackage.network?.name)} (chain ${cell(reviewPackage.network?.chainId)}) |`,
    `| Source revision | \`${cell(reviewPackage.sourceRevision)}\` |`,
    `| Deployment fingerprint | \`${cell(reviewPackage.deploymentFingerprint)}\` |`,
    `| Role review fingerprint | \`${cell(reviewPackage.roleReviewFingerprint)}\` |`,
    `| Package digest | \`${cell(packageDigest)}\` |`,
    "",
    "## Evidence status",
    "",
    "| Evidence | Status | Reference / digest |",
    "|---|---|---|",
    ...rows.map(row => `| ${cell(row[0])} | ${cell(row[1])} | ${cell(row[2])} |`),
    "",
    "## Outstanding gates",
    "",
    ...(pending.length ? pending.map(item => `- [ ] ${cell(item)}`) : ["- [x] No external gates are marked pending in this manifest."]),
    "",
    "## Drill reference",
    "",
    `- Drill ID: ${cell(artifacts.emergencyDrill.drillId)}`,
    `- Completed: ${cell(artifacts.emergencyDrill.completedAt)}`,
    `- Monitoring checked: ${cell(artifacts.monitoring.checkedAt)}`,
    ""
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw new Error("Usage: npm run render:review-summary -- <review-evidence-package.json>");
    console.log(renderReviewEvidenceMarkdown(JSON.parse(fs.readFileSync(process.argv[2], "utf8"))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
