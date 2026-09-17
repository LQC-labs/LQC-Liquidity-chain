import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const erc20 = new ethers.Interface(["function approve(address spender,uint256 amount) returns(bool)"]);
const digestBody = (record, field) => canonicalDigest(Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt")));
const same = (left, right) => ethers.isAddress(left) && ethers.isAddress(right) && left.toLowerCase() === right.toLowerCase();

export function prepareIntentStage4ExactApproval({ pilotPlan, pilotVerification, preflight, expectedPreflightDigest }) {
  if (pilotPlan?.status !== "READY_FOR_OFFLINE_REVIEW_ONLY" || pilotPlan.network?.chainId !== 97 || digestBody(pilotPlan, "pilotPlanDigest") !== pilotPlan.pilotPlanDigest) throw new Error("Invalid Stage-4 pilot plan");
  if (pilotVerification?.status !== "VERIFIED_STAGE4_PILOT_PLAN" || digestBody(pilotVerification, "pilotVerificationDigest") !== pilotVerification.pilotVerificationDigest || pilotVerification.pilotPlanDigest !== pilotPlan.pilotPlanDigest) throw new Error("Invalid Stage-4 pilot verification");
  if (preflight?.status !== "READY_FOR_EXACT_APPROVAL" || preflight.network?.chainId !== 97 || preflight.transactionOccurred !== false || preflight.exactApprovalRequired !== true || preflight.allowance !== "0" || digestBody(preflight, "preflightDigest") !== preflight.preflightDigest) throw new Error("Invalid Stage-4 exact-approval preflight");
  if (preflight.preflightDigest !== expectedPreflightDigest) throw new Error("Stage-4 preflight does not match the independently reviewed digest");
  if (preflight.pilotPlanDigest !== pilotPlan.pilotPlanDigest || preflight.pilotVerificationDigest !== pilotVerification.pilotVerificationDigest || preflight.intentHash !== pilotPlan.intentHash || preflight.routeHash !== pilotPlan.routeHash) throw new Error("Stage-4 approval evidence binding mismatch");
  if (!same(preflight.addresses.intentHub, pilotPlan.intentHub) || !same(preflight.addresses.user, pilotPlan.intent.user) || !same(preflight.addresses.sourceToken, pilotPlan.intent.sourceToken)) throw new Error("Stage-4 approval address binding mismatch");
  const token = ethers.getAddress(pilotPlan.intent.sourceToken), escrow = ethers.getAddress(preflight.addresses.sourceEscrow), user = ethers.getAddress(pilotPlan.intent.user), amount = BigInt(pilotPlan.intent.sourceAmount);
  if (amount <= 0n || BigInt(preflight.balance) < amount) throw new Error("Stage-4 approval balance mismatch");
  const transaction = { chainId: 97, from: user, to: token, value: "0", data: erc20.encodeFunctionData("approve", [escrow, amount]) };
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE4_EXACT_APPROVAL_PLAN", status: "READY_FOR_SEPARATE_WALLET_REVIEW", network: { name: "BSC Testnet", chainId: 97 }, pilotPlanDigest: pilotPlan.pilotPlanDigest, pilotVerificationDigest: pilotVerification.pilotVerificationDigest, preflightDigest: preflight.preflightDigest, intentHash: pilotPlan.intentHash, sourceBlock: { number: preflight.blockNumber, hash: preflight.blockHash }, approval: { owner: user, token, spender: escrow, amount: amount.toString() }, transaction, transactionOccurred: false, safety: "Unsigned exact-allowance plan only. Re-run preflight before any separate wallet approval. This tool does not request a wallet, sign, or send a transaction." };
  return { ...body, approvalPlanDigest: canonicalDigest(body) };
}

async function main() {
  const [pilotFile, verificationFile, preflightFile, expectedPreflightDigest, outputFile] = process.argv.slice(2);
  if (!outputFile) throw new Error("Usage: node prepare-intent-stage4-exact-approval.mjs <pilot.json> <verification.json> <preflight.json> <expected-preflight-digest> <output.json>");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = prepareIntentStage4ExactApproval({ pilotPlan: read(pilotFile), pilotVerification: read(verificationFile), preflight: read(preflightFile), expectedPreflightDigest });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); console.log(`Wrote ${path.resolve(outputFile)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
