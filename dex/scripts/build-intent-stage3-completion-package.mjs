import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

function verifiedDigest(record, field) {
  if (!record?.[field]) return false;
  const body = Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt"));
  return canonicalDigest(body) === record[field];
}

function sameAddress(left, right) {
  return ethers.isAddress(left) && ethers.isAddress(right) && left.toLowerCase() === right.toLowerCase();
}

export function buildIntentStage3CompletionPackage({ verification, finalState, plan }) {
  if (verification?.status !== "SAFE_EXECUTIONS_VERIFIED_PENDING_FINAL_STATE" || verification.network?.chainId !== 97 || verification.transactionOccurred !== true || !verifiedDigest(verification, "verificationDigest")) throw new Error("Invalid Stage-3 execution verification");
  if (finalState?.status !== "VERIFIED_STAGE3_GOVERNANCE_BINDINGS" || finalState.network?.chainId !== 97 || finalState.transactionOccurred !== true || !verifiedDigest(finalState, "finalStateDigest")) throw new Error("Invalid Stage-3 final state");
  if (plan?.status !== "READY_FOR_SEPARATE_EXPLICIT_4_OF_7_APPROVAL" || plan.network?.chainId !== 97 || plan.transactionOccurred !== false || !verifiedDigest(plan, "proposalPlanDigest")) throw new Error("Invalid Stage-3 proposal plan");
  if (verification.proposalPlanDigest !== plan.proposalPlanDigest || finalState.proposalPlanDigest !== plan.proposalPlanDigest || finalState.executionVerificationDigest !== verification.verificationDigest) throw new Error("Stage-3 evidence digest binding mismatch");
  if (!sameAddress(plan.governanceSafe, finalState.roles?.governanceSafe ?? finalState.addresses?.governanceSafe ?? plan.governanceSafe)) throw new Error("Stage-3 Governance Safe mismatch");
  if (!Array.isArray(plan.proposals) || plan.proposals.length === 0 || !Array.isArray(verification.transactions) || verification.transactions.length !== plan.proposals.length) throw new Error("Stage-3 execution count mismatch");
  if (BigInt(finalState.safeNonce) !== BigInt(plan.endingNonce) + 1n) throw new Error("Stage-3 final Safe nonce mismatch");

  const body = {
    schemaVersion: 1,
    packageType: "LQC_INTENT_STAGE3_COMPLETION_EVIDENCE",
    status: "STAGE3_GOVERNANCE_BINDINGS_VERIFIED",
    network: { name: "BSC Testnet", chainId: 97 },
    governanceSafe: ethers.getAddress(plan.governanceSafe),
    proposalCount: plan.proposals.length,
    startingNonce: String(plan.startingNonce),
    endingNonce: String(plan.endingNonce),
    finalSafeNonce: String(finalState.safeNonce),
    canonicalFinalBlock: { number: finalState.blockNumber, hash: finalState.blockHash },
    rpcCount: finalState.rpcCount,
    proposalPlanDigest: plan.proposalPlanDigest,
    executionVerificationDigest: verification.verificationDigest,
    finalStateDigest: finalState.finalStateDigest,
    addresses: finalState.addresses,
    attesters: finalState.attesters,
    runtimeDigests: finalState.runtimeDigests,
    executionTransactions: verification.transactions.map((entry, index) => ({ id: index + 1, hash: entry.hash, blockNumber: entry.blockNumber, safeTxHash: plan.proposals[index].safeTxHash })),
    transactionOccurred: true,
    scope: "Stage 3 Governance bindings on BSC Testnet only.",
    exclusions: ["Cross-chain settlement activation", "Permissionless Solver activation", "Mainnet activation", "Custody of user funds"],
  };
  return { ...body, completionDigest: canonicalDigest(body) };
}

export function writeIntentStage3CompletionPackage(outputDirectory, completion, inputs) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  if (fs.readdirSync(outputDirectory).length) throw new Error("Use an empty output directory to preserve immutable completion evidence");
  const files = {
    "completion-manifest.json": completion,
    "safe-proposal-plan.json": inputs.plan,
    "execution-verification.json": inputs.verification,
    "final-state-verification.json": inputs.finalState,
  };
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  fs.writeFileSync(path.join(outputDirectory, "COMPLETION.md"), renderIntentStage3CompletionMarkdown(completion), { flag: "wx" });
  return { status: "COMPLETION_PACKAGE_WRITTEN", completionDigest: completion.completionDigest, fileCount: 5, outputDirectory };
}

export function renderIntentStage3CompletionMarkdown(completion) {
  return `# LQC Intent Stage 3 Completion Evidence\n\nStatus: **${completion.status}**\n\nCompletion digest: \`${completion.completionDigest}\`\n\n- Network: BSC Testnet (97)\n- Governance actions: ${completion.proposalCount}\n- Final Safe nonce: ${completion.finalSafeNonce}\n- Canonical final block: ${completion.canonicalFinalBlock.number} (\`${completion.canonicalFinalBlock.hash}\`)\n\nThis package proves only the scope recorded in the manifest. It does not authorize cross-chain settlement, permissionless Solvers, mainnet activation, or custody of user funds.\n`;
}

async function main() {
  const [planFile, verificationFile, finalStateFile, outputDirectory] = process.argv.slice(2);
  if (!outputDirectory) throw new Error("Usage: node build-intent-stage3-completion-package.mjs <plan.json> <execution-verification.json> <final-state.json> <empty-output-dir>");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const inputs = { plan: read(planFile), verification: read(verificationFile), finalState: read(finalStateFile) };
  const completion = buildIntentStage3CompletionPackage(inputs);
  console.log(JSON.stringify(writeIntentStage3CompletionPackage(path.resolve(outputDirectory), completion, inputs), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
