import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";

export const SAFE_TYPES = {
  SafeTx: [
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "data", type: "bytes" },
    { name: "operation", type: "uint8" },
    { name: "safeTxGas", type: "uint256" },
    { name: "baseGas", type: "uint256" },
    { name: "gasPrice", type: "uint256" },
    { name: "gasToken", type: "address" },
    { name: "refundReceiver", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
};

function verifiedDigest(record, field) {
  if (!record?.[field]) return false;
  const body = Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt"));
  return canonicalDigest(body) === record[field];
}

export function buildIntentStage3SafeProposalPlan({ preflight, review, manifest }) {
  if (preflight?.status !== "PREFLIGHT_VERIFIED_FOR_4_OF_7_REVIEW" || preflight.network?.chainId !== 97 || preflight.transactionOccurred !== false || !verifiedDigest(preflight, "preflightDigest")) throw new Error("Invalid Stage-3 governance preflight");
  if (review?.status !== "REVIEW_REQUIRED" || review.network?.chainId !== 97 || review.transactionOccurred !== false || !verifiedDigest(review, "reviewDigest")) throw new Error("Invalid Stage-3 review package");
  if (manifest?.stage !== "stage3-governance-bindings" || manifest.network?.chainId !== 97 || manifest.dryRun?.transactionOccurred !== false) throw new Error("Invalid Stage-3 governance manifest");
  if (preflight.reviewDigest !== review.reviewDigest || preflight.readinessDigest !== review.readinessDigest) throw new Error("Stage-3 preflight and review mismatch");
  if (preflight.safeThreshold !== "4" || preflight.safeOwnerCount !== 7 || new Set(preflight.safeOwners?.map(value => value.toLowerCase())).size !== 7) throw new Error("Stage-3 Safe policy mismatch");
  if (preflight.actionCount !== review.actions?.length || review.actions.length !== manifest.orderedActions?.length) throw new Error("Stage-3 action count mismatch");

  const safe = ethers.getAddress(preflight.governanceSafe);
  const startingNonce = BigInt(preflight.safeNonce);
  const proposals = manifest.orderedActions.map((action, index) => {
    const reviewed = review.actions[index];
    if (action.id !== index + 1 || reviewed.id !== action.id || reviewed.action !== action.action || action.actor !== "governance-safe" || action.value !== "0") throw new Error(`Invalid Stage-3 action ${index + 1}`);
    const to = ethers.getAddress(action.to);
    if (to.toLowerCase() !== reviewed.to.toLowerCase() || sha256(action.data) !== reviewed.calldataDigest || sha256(action.data) !== preflight.actionCalldataDigests[index]) throw new Error(`Stage-3 action ${index + 1} changed after preflight`);
    const safeTransaction = { to, value: "0", data: action.data, operation: 0, safeTxGas: "0", baseGas: "0", gasPrice: "0", gasToken: ethers.ZeroAddress, refundReceiver: ethers.ZeroAddress, nonce: (startingNonce + BigInt(index)).toString() };
    const safeTxHash = ethers.TypedDataEncoder.hash(
      { chainId: 97, verifyingContract: safe },
      SAFE_TYPES,
      { ...safeTransaction, value: 0n, safeTxGas: 0n, baseGas: 0n, gasPrice: 0n, nonce: BigInt(safeTransaction.nonce) },
    );
    return { id: action.id, action: action.action, calldataDigest: reviewed.calldataDigest, safeTransaction, safeTxHash };
  });

  const body = {
    schemaVersion: 1,
    recordType: "LQC_INTENT_STAGE3_SAFE_PROPOSAL_PLAN",
    status: "READY_FOR_SEPARATE_EXPLICIT_4_OF_7_APPROVAL",
    network: { name: "BSC Testnet", chainId: 97 },
    governanceSafe: safe,
    safeThreshold: 4,
    safeOwnerCount: 7,
    startingNonce: startingNonce.toString(),
    endingNonce: (startingNonce + BigInt(proposals.length - 1)).toString(),
    preflightDigest: preflight.preflightDigest,
    reviewDigest: review.reviewDigest,
    readinessDigest: review.readinessDigest,
    proposals,
    executionPolicy: "Execute one Safe transaction at a time in ascending id and nonce order. Re-run Stage-3 state verification after every execution.",
    transactionOccurred: false,
    safety: "Unsigned deterministic proposal plan only. No Safe proposal is submitted, no signature is collected, and no transaction is executed.",
  };
  return { ...body, proposalPlanDigest: canonicalDigest(body) };
}

async function main() {
  const [preflightFile, reviewFile, manifestFile, outputFile] = process.argv.slice(2);
  if (!outputFile) throw new Error("Usage: node build-intent-stage3-safe-proposal-plan.mjs <preflight.json> <review.json> <manifest.json> <output.json>");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = buildIntentStage3SafeProposalPlan({ preflight: read(preflightFile), review: read(reviewFile), manifest: read(manifestFile) });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(`Wrote ${path.resolve(outputFile)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
