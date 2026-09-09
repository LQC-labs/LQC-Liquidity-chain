import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildReviewEvidencePackage } from "./build-review-evidence-package.mjs";
import { renderReviewEvidenceMarkdown } from "./render-review-evidence-markdown.mjs";

const digest = value => `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
const FILES = {
  evidence: "lqc-review-evidence.json",
  summary: "lqc-review-summary.md",
  manifest: "lqc-review-bundle-manifest.json"
};

export function buildReviewBundle(inputs) {
  const reviewPackage = buildReviewEvidencePackage(inputs);
  const markdown = renderReviewEvidenceMarkdown(reviewPackage);
  if (!markdown.includes(reviewPackage.packageDigest)) throw new Error("Markdown summary is not bound to the package digest.");
  const evidenceText = `${JSON.stringify(reviewPackage, null, 2)}\n`;
  const summaryText = `${markdown.trimEnd()}\n`;
  const binding = { schemaVersion: 1, bundleType: "LQC_CEX_SECURITY_REVIEW_BUNDLE",
    sourceRevision: reviewPackage.sourceRevision, deploymentFingerprint: reviewPackage.deploymentFingerprint,
    packageDigest: reviewPackage.packageDigest,
    files: { [FILES.evidence]: digest(evidenceText), [FILES.summary]: digest(summaryText) } };
  const bundleManifest = { ...binding, bundleDigest: digest(JSON.stringify(binding)) };
  return { reviewPackage, markdown: summaryText, bundleManifest };
}

export function writeReviewBundle(outputDirectory, bundle) {
  const directory = path.resolve(outputDirectory);
  fs.mkdirSync(directory, { recursive: true });
  const targets = Object.values(FILES).map(file => path.join(directory, file));
  if (targets.some(target => fs.existsSync(target))) {
    throw new Error("Review bundle already exists; use a new empty output directory to preserve prior evidence.");
  }
  const values = [
    `${JSON.stringify(bundle.reviewPackage, null, 2)}\n`,
    bundle.markdown,
    `${JSON.stringify(bundle.bundleManifest, null, 2)}\n`
  ];
  const temporary = targets.map(target => `${target}.tmp-${process.pid}-${Date.now()}`);
  try {
    temporary.forEach((file, index) => fs.writeFileSync(file, values[index], { encoding: "utf8", mode: 0o600, flag: "wx" }));
    temporary.forEach((file, index) => fs.renameSync(file, targets[index]));
  } catch (error) {
    temporary.forEach(file => { try { fs.unlinkSync(file); } catch {} });
    throw error;
  }
  return { directory, files: [...targets] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [deploymentPath, monitoringPath, drillPath, outputDirectory, externalPath] = process.argv.slice(2);
    if (!deploymentPath || !monitoringPath || !drillPath || !outputDirectory) {
      throw new Error("Usage: npm run build:review-bundle -- <deployment.json> <monitoring.json> <drill.json> <empty-output-dir> [external-evidence.json]");
    }
    const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
    const bundle = buildReviewBundle({ deployment: read(deploymentPath), monitoring: read(monitoringPath),
      emergencyDrill: read(drillPath), externalEvidence: externalPath ? read(externalPath) : {} });
    console.log(JSON.stringify(writeReviewBundle(outputDirectory, bundle), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
