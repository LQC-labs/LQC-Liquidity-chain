import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";

function verifyDigest(record, field) {
  const expected = record?.[field];
  if (!expected) return false;
  const body = Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt"));
  return canonicalDigest(body) === expected;
}

export function buildIntentStage2ReviewPackage({ readiness, manifest }) {
  if (readiness?.status !== "READY_FOR_INTERNAL_SOLVER_DEPLOYMENT_REVIEW" || readiness.network?.chainId !== 97 || readiness.transactionOccurred !== false || !verifyDigest(readiness, "readinessDigest") || manifest?.network?.chainId !== 97 || manifest.stage !== "stage2-solver-deploy" || manifest.dryRun?.transactionOccurred !== false || manifest.orderedActions?.length !== 1) throw new Error("Invalid Stage-2 review inputs");
  const action = manifest.orderedActions[0];
  if (action.actor !== "deployer" || action.action !== "deploy-internal-solver" || action.to !== null || action.value !== "0" || !ethers.isHexString(action.data)) throw new Error("Invalid Internal Solver deployment action");
  const addresses = readiness.addresses;
  if (!addresses || !ethers.isAddress(addresses.LQCIntentHub) || manifest.addresses?.LQCIntentHub?.toLowerCase() !== addresses.LQCIntentHub.toLowerCase() || manifest.dependencies?.executionRouter?.toLowerCase() !== readiness.dependencies?.executionRouter?.toLowerCase() || manifest.roles?.governanceSafe?.toLowerCase() !== readiness.roles?.governanceSafe?.toLowerCase() || manifest.dependencies?.bondToken?.toLowerCase() !== readiness.bondToken?.toLowerCase()) throw new Error("Stage-2 review binding mismatch");
  const body = { schemaVersion: 1, packageType: "LQC_INTENT_STAGE2_INTERNAL_SOLVER_REVIEW", status: "REVIEW_REQUIRED", network: { name: "BSC Testnet", chainId: 97 }, readinessDigest: readiness.readinessDigest, stage1ReviewDigest: readiness.reviewDigest, stage1DeploymentVerificationDigest: readiness.deploymentVerificationDigest, dependencies: { intentHub: addresses.LQCIntentHub, executionRouter: manifest.dependencies.executionRouter, governanceSafe: manifest.roles.governanceSafe, bondToken: manifest.dependencies.bondToken }, action: { id: action.id, actor: action.actor, action: action.action, to: action.to, value: action.value, initCodeDigest: sha256(action.data), initCodeBytes: (action.data.length - 2) / 2 }, reviewChecklist: ["Confirm BSC Testnet chain ID 97.", "Confirm Stage-1 deployment verification and Stage-2 readiness digests.", "Decode the Internal Solver constructor and confirm the exact Hub, Router 2.0, and Governance Safe addresses.", "Confirm the expected CREATE address has no runtime code immediately before deployment.", "Obtain separate explicit deployment approval before submitting the transaction."], transactionOccurred: false, safety: "Review package only. It does not sign, deploy, bind the Hub, approve tokens, or submit a transaction." };
  return { ...body, reviewDigest: canonicalDigest(body) };
}

export function writeIntentStage2ReviewPackage(outputDirectory, review, inputs) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  if (fs.readdirSync(outputDirectory).length) throw new Error("Use an empty output directory to preserve immutable review evidence");
  for (const [name, value] of Object.entries({ "review-manifest.json": review, "stage2-readiness.json": inputs.readiness, "stage2-deployment-manifest.json": inputs.manifest })) fs.writeFileSync(path.join(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDirectory, "REVIEW.md"), `# LQC Intent Stage 2 Internal Solver Review\n\nReview digest: \`${review.reviewDigest}\`\n\n${review.reviewChecklist.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\n> ${review.safety}\n`);
  return { status: "REVIEW_PACKAGE_WRITTEN", reviewDigest: review.reviewDigest, fileCount: 4, outputDirectory };
}

async function main() {
  const [readinessFile, manifestFile, outputDirectory] = process.argv.slice(2);
  if (!outputDirectory) throw new Error("Usage: node build-intent-stage2-review-package.mjs <readiness.json> <stage2-manifest.json> <empty-output-dir>");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const inputs = { readiness: read(readinessFile), manifest: read(manifestFile) };
  const review = buildIntentStage2ReviewPackage(inputs);
  console.log(JSON.stringify(writeIntentStage2ReviewPackage(path.resolve(outputDirectory), review, inputs), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
