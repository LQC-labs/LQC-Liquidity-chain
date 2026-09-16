import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const digestBody = (record, field) => canonicalDigest(Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt")));

export function prepareIntentStage4SigningPacket({ pilotPlan, pilotVerification, approvalVerification, postApprovalPreflight, expectedPreflightDigest }) {
  if (pilotPlan?.status !== "READY_FOR_OFFLINE_REVIEW_ONLY" || pilotPlan.network?.chainId !== 97 || digestBody(pilotPlan, "pilotPlanDigest") !== pilotPlan.pilotPlanDigest) throw new Error("Invalid Stage-4 pilot plan");
  if (pilotVerification?.status !== "VERIFIED_STAGE4_PILOT_PLAN" || digestBody(pilotVerification, "pilotVerificationDigest") !== pilotVerification.pilotVerificationDigest || pilotVerification.pilotPlanDigest !== pilotPlan.pilotPlanDigest || pilotVerification.intentHash !== pilotPlan.intentHash) throw new Error("Invalid Stage-4 pilot verification");
  if (approvalVerification?.status !== "VERIFIED_EXACT_SOURCE_ESCROW_APPROVAL" || approvalVerification.network?.chainId !== 97 || approvalVerification.transactionOccurred !== true || digestBody(approvalVerification, "approvalVerificationDigest") !== approvalVerification.approvalVerificationDigest || approvalVerification.pilotPlanDigest !== pilotPlan.pilotPlanDigest || approvalVerification.intentHash !== pilotPlan.intentHash) throw new Error("Invalid Stage-4 approval verification");
  if (postApprovalPreflight?.status !== "READY_FOR_INTENT_SIGNATURE" || postApprovalPreflight.network?.chainId !== 97 || postApprovalPreflight.transactionOccurred !== false || postApprovalPreflight.exactApprovalRequired !== false || digestBody(postApprovalPreflight, "preflightDigest") !== postApprovalPreflight.preflightDigest || postApprovalPreflight.preflightDigest !== expectedPreflightDigest) throw new Error("Invalid Stage-4 post-approval preflight");
  if (postApprovalPreflight.pilotPlanDigest !== pilotPlan.pilotPlanDigest || postApprovalPreflight.pilotVerificationDigest !== pilotVerification.pilotVerificationDigest || postApprovalPreflight.intentHash !== pilotPlan.intentHash || postApprovalPreflight.routeHash !== pilotPlan.routeHash || BigInt(postApprovalPreflight.allowance) !== BigInt(pilotPlan.intent.sourceAmount)) throw new Error("Stage-4 signing evidence binding mismatch");
  const recomputedIntentHash = ethers.TypedDataEncoder.hash(pilotPlan.domain, pilotPlan.types, pilotPlan.intent);
  if (recomputedIntentHash !== pilotPlan.intentHash) throw new Error("Stage-4 signing Intent hash mismatch");
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE4_SIGNING_PACKET", status: "READY_FOR_SEPARATE_EIP712_WALLET_REVIEW", network: { name: "BSC Testnet", chainId: 97 }, pilotPlanDigest: pilotPlan.pilotPlanDigest, pilotVerificationDigest: pilotVerification.pilotVerificationDigest, approvalVerificationDigest: approvalVerification.approvalVerificationDigest, postApprovalPreflightDigest: postApprovalPreflight.preflightDigest, approvalTransactionHash: approvalVerification.transactionHash, sourceBlock: { number: postApprovalPreflight.blockNumber, hash: postApprovalPreflight.blockHash }, typedData: { domain: pilotPlan.domain, types: pilotPlan.types, primaryType: "Intent", message: pilotPlan.intent }, intentHash: pilotPlan.intentHash, walletReview: { expectedSigner: pilotPlan.intent.user, verifyingContract: pilotPlan.intentHub, sourceToken: pilotPlan.intent.sourceToken, sourceAmount: pilotPlan.intent.sourceAmount, destinationToken: pilotPlan.intent.destinationToken, recipient: pilotPlan.intent.recipient, minimumAmountOut: pilotPlan.intent.minAmountOut, deadline: pilotPlan.intent.deadline, nonce: pilotPlan.intent.nonce }, signature: null, transactionOccurred: false, safety: "Unsigned EIP-712 review packet only. This tool does not request a wallet, access a key, create a signature, submit an Intent, or send a transaction." };
  return { ...body, signingPacketDigest: canonicalDigest(body) };
}

async function main() {
  const [pilotFile, pilotVerificationFile, approvalVerificationFile, preflightFile, expectedPreflightDigest, outputFile] = process.argv.slice(2);
  if (!outputFile) throw new Error("Usage: node prepare-intent-stage4-signing-packet.mjs <pilot.json> <pilot-verification.json> <approval-verification.json> <post-approval-preflight.json> <expected-preflight-digest> <output.json>");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = prepareIntentStage4SigningPacket({ pilotPlan: read(pilotFile), pilotVerification: read(pilotVerificationFile), approvalVerification: read(approvalVerificationFile), postApprovalPreflight: read(preflightFile), expectedPreflightDigest });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); console.log(`Wrote ${path.resolve(outputFile)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
