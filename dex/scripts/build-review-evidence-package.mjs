import fs from "node:fs";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildAppConfig } from "./app-config.mjs";

const SOURCE_REVISION = /^[0-9a-fA-F]{40}$/;
const digest = value => `sha256:${crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

export function buildReviewEvidencePackage({ deployment, monitoring, emergencyDrill, externalEvidence = {} }) {
  if (Number(deployment?.network?.chainId) !== 97 || Number(monitoring?.network?.chainId) !== 97 ||
      Number(emergencyDrill?.network?.chainId) !== 97) {
    throw new Error("Every technical artifact must target BSC testnet chain 97.");
  }
  if (!SOURCE_REVISION.test(deployment.sourceRevision || "")) throw new Error("Deployment sourceRevision must be a full Git commit SHA.");
  const deploymentFingerprint = buildAppConfig(deployment).deploymentFingerprint;
  if (emergencyDrill.sourceRevision?.toLowerCase() !== deployment.sourceRevision.toLowerCase()) {
    throw new Error("Emergency drill source revision does not match the deployment record.");
  }
  if (emergencyDrill.deploymentFingerprint !== deploymentFingerprint) {
    throw new Error("Emergency drill fingerprint does not match the deployment record.");
  }
  if (monitoring.status !== "HEALTHY" || monitoring.counts?.critical !== 0 || monitoring.incident) {
    throw new Error("A HEALTHY monitoring report without an open incident is required.");
  }
  if (emergencyDrill.result !== "PASS" || !/^sha256:[0-9a-f]{64}$/.test(emergencyDrill.evidenceDigest || "")) {
    throw new Error("A passing emergency drill with an evidence digest is required.");
  }
  const pendingExternalEvidence = [];
  if (!deployment.verification?.explorerVerifiedSource) pendingExternalEvidence.push("EXPLORER_VERIFIED_SOURCE");
  if (!externalEvidence.auditReportHash) pendingExternalEvidence.push("INDEPENDENT_AUDIT");
  if (!externalEvidence.legalPackageReference) pendingExternalEvidence.push("LEGAL_KYB_PACKAGE");
  const artifacts = {
    deployment: { digest: digest(deployment), sourceRevision: deployment.sourceRevision.toLowerCase(), deploymentFingerprint },
    monitoring: { digest: digest(monitoring), checkedAt: monitoring.checkedAt, status: monitoring.status },
    emergencyDrill: { digest: digest(emergencyDrill), drillId: emergencyDrill.drillId,
      completedAt: emergencyDrill.completedAt, evidenceDigest: emergencyDrill.evidenceDigest }
  };
  const manifest = { schemaVersion: 1, packageType: "LQC_CEX_SECURITY_REVIEW_EVIDENCE",
    network: deployment.network, technicalEvidenceStatus: "PASS",
    submissionStatus: pendingExternalEvidence.length ? "INCOMPLETE" : "READY_FOR_REVIEW",
    sourceRevision: deployment.sourceRevision.toLowerCase(), deploymentFingerprint,
    artifacts, pendingExternalEvidence,
    externalEvidence: { auditReportHash: externalEvidence.auditReportHash || null,
      legalPackageReference: externalEvidence.legalPackageReference || null } };
  return { ...manifest, packageDigest: digest(manifest) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [deploymentPath, monitoringPath, drillPath, externalPath] = process.argv.slice(2);
    if (!deploymentPath || !monitoringPath || !drillPath) {
      throw new Error("Usage: npm run package:review-evidence -- <deployment.json> <monitoring.json> <drill.json> [external-evidence.json]");
    }
    const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
    const result = buildReviewEvidencePackage({ deployment: read(deploymentPath), monitoring: read(monitoringPath),
      emergencyDrill: read(drillPath), externalEvidence: externalPath ? read(externalPath) : {} });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
