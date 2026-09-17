import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";

const interfaces = {
  registry: new ethers.Interface([
    "function setExposureManager(address)",
    "function setExecutionVerifier(address)",
    "function setResolver(address)",
    "function setSlashRecipient(address)",
  ]),
  quote: new ethers.Interface(["function setSolverRegistry(address)"]),
  hub: new ethers.Interface(["function setQuoteManager(address)", "function setSolverRegistry(address)", "function setInternalSolver(address)"]),
  solver: new ethers.Interface(["function acceptHubRole()"]),
  verifier: new ethers.Interface(["function setAttester(address,bool)"]),
};

function verifyDigest(record, field) {
  const expected = record?.[field];
  if (!expected) return false;
  const body = Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt"));
  return canonicalDigest(body) === expected;
}

function sameAddress(left, right) {
  return ethers.isAddress(left) && ethers.isAddress(right) && left.toLowerCase() === right.toLowerCase();
}

function expectedActions(readiness) {
  const a = readiness.addresses;
  const roles = readiness.roles;
  return [
    ["registry-set-exposure-manager", a.LQCSolverRegistry, interfaces.registry.encodeFunctionData("setExposureManager", [a.LQCIntentHub])],
    ["registry-set-verifier", a.LQCSolverRegistry, interfaces.registry.encodeFunctionData("setExecutionVerifier", [a.LQCExecutionVerifier])],
    ["registry-set-resolver", a.LQCSolverRegistry, interfaces.registry.encodeFunctionData("setResolver", [roles.riskSafe])],
    ["registry-set-slash-recipient", a.LQCSolverRegistry, interfaces.registry.encodeFunctionData("setSlashRecipient", [roles.treasurySafe])],
    ["quote-set-registry", a.LQCQuoteManager, interfaces.quote.encodeFunctionData("setSolverRegistry", [a.LQCSolverRegistry])],
    ["hub-set-quote-manager", a.LQCIntentHub, interfaces.hub.encodeFunctionData("setQuoteManager", [a.LQCQuoteManager])],
    ["hub-set-solver-registry", a.LQCIntentHub, interfaces.hub.encodeFunctionData("setSolverRegistry", [a.LQCSolverRegistry])],
    ["hub-begin-internal-solver", a.LQCIntentHub, interfaces.hub.encodeFunctionData("setInternalSolver", [a.LQCInternalSolver])],
    ["solver-accept-hub-role", a.LQCInternalSolver, interfaces.solver.encodeFunctionData("acceptHubRole")],
    ...readiness.attesters.map((attester, index) => [
      `verifier-enable-attester-${index + 1}`,
      a.LQCExecutionVerifier,
      interfaces.verifier.encodeFunctionData("setAttester", [attester, true]),
    ]),
  ];
}

export function buildIntentStage3ReviewPackage({ readiness, manifest }) {
  if (readiness?.status !== "READY_FOR_GOVERNANCE_BINDING_REVIEW" || readiness.network?.chainId !== 97 || readiness.transactionOccurred !== false || !verifyDigest(readiness, "readinessDigest")) throw new Error("Invalid Stage-3 readiness evidence");
  if (manifest?.stage !== "stage3-governance-bindings" || manifest.network?.chainId !== 97 || manifest.dryRun?.transactionOccurred !== false || !Array.isArray(manifest.orderedActions)) throw new Error("Invalid Stage-3 manifest");
  if (manifest.addresses?.LQCInternalSolver && !sameAddress(manifest.addresses.LQCInternalSolver, readiness.addresses?.LQCInternalSolver)) throw new Error("Stage-3 address binding mismatch");
  for (const [key, value] of Object.entries(readiness.roles || {})) if (!sameAddress(manifest.roles?.[key], value)) throw new Error(`Stage-3 ${key} binding mismatch`);
  for (const [key, value] of Object.entries(readiness.dependencies || {})) if (!sameAddress(manifest.dependencies?.[key], value)) throw new Error(`Stage-3 ${key} dependency mismatch`);
  if (canonicalDigest(manifest.policy) !== canonicalDigest(readiness.policy) || canonicalDigest(manifest.attesters) !== canonicalDigest(readiness.attesters)) throw new Error("Stage-3 policy or attester mismatch");

  const expected = expectedActions(readiness);
  if (manifest.orderedActions.length !== expected.length) throw new Error("Stage-3 action count mismatch");
  const actions = manifest.orderedActions.map((action, index) => {
    const [name, target, data] = expected[index];
    if (action.id !== index + 1 || action.actor !== "governance-safe" || action.action !== name || action.value !== "0" || !sameAddress(action.to, target) || action.data.toLowerCase() !== data.toLowerCase()) throw new Error(`Invalid Stage-3 action ${index + 1}`);
    return { id: action.id, actor: action.actor, action: action.action, to: ethers.getAddress(action.to), value: action.value, calldataDigest: sha256(action.data), calldataBytes: (action.data.length - 2) / 2 };
  });

  const body = {
    schemaVersion: 1,
    packageType: "LQC_INTENT_STAGE3_GOVERNANCE_BINDING_REVIEW",
    status: "REVIEW_REQUIRED",
    network: { name: "BSC Testnet", chainId: 97 },
    readinessDigest: readiness.readinessDigest,
    stage2VerificationDigest: readiness.stage2VerificationDigest,
    governanceSafe: ethers.getAddress(readiness.roles.governanceSafe),
    addresses: readiness.addresses,
    roles: readiness.roles,
    dependencies: readiness.dependencies,
    policy: readiness.policy,
    attesters: readiness.attesters.map(ethers.getAddress),
    actions,
    reviewChecklist: [
      "Confirm BSC Testnet chain ID 97 and the canonical Stage-3 readiness block.",
      "Confirm every target, calldata digest, Safe role, Bond policy, and attester address.",
      "Keep all actions in the recorded order; the Internal Solver uses a two-step role acceptance.",
      "Re-run read-only preflight immediately before collecting Governance Safe approvals.",
      "Obtain separate explicit approval before any 4-of-7 Safe signature or execution.",
    ],
    transactionOccurred: false,
    safety: "Review package only. It does not sign, execute, bind contracts, activate a Solver or attester, approve tokens, or submit a transaction.",
  };
  return { ...body, reviewDigest: canonicalDigest(body) };
}

export function writeIntentStage3ReviewPackage(outputDirectory, review, inputs) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  if (fs.readdirSync(outputDirectory).length) throw new Error("Use an empty output directory to preserve immutable review evidence");
  for (const [name, value] of Object.entries({ "review-manifest.json": review, "stage3-readiness.json": inputs.readiness, "stage3-governance-manifest.json": inputs.manifest })) fs.writeFileSync(path.join(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDirectory, "REVIEW.md"), `# LQC Intent Stage 3 Governance Binding Review\n\nReview digest: \`${review.reviewDigest}\`\n\n${review.reviewChecklist.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\n> ${review.safety}\n`);
  return { status: "REVIEW_PACKAGE_WRITTEN", reviewDigest: review.reviewDigest, fileCount: 4, outputDirectory };
}

async function main() {
  const [readinessFile, manifestFile, outputDirectory] = process.argv.slice(2);
  if (!outputDirectory) throw new Error("Usage: node build-intent-stage3-review-package.mjs <readiness.json> <stage3-manifest.json> <empty-output-dir>");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const inputs = { readiness: read(readinessFile), manifest: read(manifestFile) };
  const review = buildIntentStage3ReviewPackage(inputs);
  console.log(JSON.stringify(writeIntentStage3ReviewPackage(path.resolve(outputDirectory), review, inputs), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
