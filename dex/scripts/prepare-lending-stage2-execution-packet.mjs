import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";
import { buildLendingStage2DeploymentReview } from "./build-lending-stage2-deployment-review.mjs";

export function prepareLendingStage2ExecutionPacket({ manifest, preflight, review, approvedReviewDigest }) {
  const expected = buildLendingStage2DeploymentReview({ manifest, preflight });
  const { reviewDigest, ...reviewBody } = review;
  if (canonicalDigest(reviewBody) !== reviewDigest || canonicalDigest(review) !== canonicalDigest(expected) || approvedReviewDigest !== reviewDigest) throw new Error("Missing or invalid explicit Lending Stage-2 approval");
  const transactions = manifest.orderedActions.map((action, index) => {
    const approved = review.deployments[index];
    return { order: index + 1, contract: action.contract, chainId: 97, from: review.deployer, to: null, nonce: approved.nonce, value: "0", data: action.data, gasLimit: approved.approvedGasLimit, predictedAddress: approved.predictedAddress, expectedBindings: approved.expectedBindings, initCodeDigest: approved.initCodeDigest };
  });
  const body = { schemaVersion: 1, recordType: "LQC_LENDING_STAGE2_UNSIGNED_EXECUTION_PACKET", status: "APPROVED_PACKET_REQUIRES_FRESH_SIGNING_PREFLIGHT", network: manifest.network, manifestDigest: manifest.manifestDigest, preflightDigest: preflight.preflightDigest, approvedReviewDigest: reviewDigest, deployer: review.deployer, transactions, maximumGasBudgetWei: review.budget.maximumGasBudgetWei, signingRequirements: ["recheck-chain-97", "recheck-current-nonce-107", "recheck-two-empty-predicted-addresses", "recheck-stage1-dependencies", "recheck-current-gas-and-balance", "sign-one-transaction-at-a-time", "verify-first-receipt-and-bindings-before-second"], transactionOccurred: false, safety: "Unsigned packet only. No private key, wallet request, signature or transaction broadcast mechanism." };
  return { ...body, packetDigest: canonicalDigest(body) };
}

async function main() {
  const [manifestFile, preflightFile, reviewFile, approvedDigest, outputFile] = process.argv.slice(2);
  if (!manifestFile || !preflightFile || !reviewFile || !approvedDigest) throw new Error("Usage: node prepare-lending-stage2-execution-packet.mjs <manifest> <preflight> <review> <approved-digest> [output]");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file)));
  const result = prepareLendingStage2ExecutionPacket({ manifest: read(manifestFile), preflight: read(preflightFile), review: read(reviewFile), approvedReviewDigest: approvedDigest });
  if (outputFile) fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  else console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
