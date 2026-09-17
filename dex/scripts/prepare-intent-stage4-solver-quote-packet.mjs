import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const QUOTE_TYPES = { SolverQuote: [
  { name: "intentHash", type: "bytes32" }, { name: "solver", type: "address" }, { name: "dexId", type: "bytes32" },
  { name: "amountOut", type: "uint256" }, { name: "solverFeeOut", type: "uint256" }, { name: "gasCostOut", type: "uint256" },
  { name: "routeHash", type: "bytes32" }, { name: "issuedAt", type: "uint256" }, { name: "deadline", type: "uint256" },
  { name: "nonce", type: "uint256" },
] };
const digestBody = (record, field) => canonicalDigest(Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt")));

export function prepareIntentStage4SolverQuotePacket({ pilotPlan, submissionPreflight, submissionVerification, expectedSubmissionVerificationDigest, solver, amountOut, solverFeeOut, gasCostOut, issuedAt, deadline, nonce }) {
  if (pilotPlan?.status !== "READY_FOR_OFFLINE_REVIEW_ONLY" || pilotPlan.network?.chainId !== 97 || pilotPlan.transactionOccurred !== false || digestBody(pilotPlan, "pilotPlanDigest") !== pilotPlan.pilotPlanDigest) throw new Error("Invalid Stage-4 pilot plan");
  if (submissionPreflight?.status !== "READY_FOR_SEPARATE_WALLET_SUBMISSION" || submissionPreflight.network?.chainId !== 97 || submissionPreflight.transactionOccurred !== false || digestBody(submissionPreflight, "submissionPreflightDigest") !== submissionPreflight.submissionPreflightDigest) throw new Error("Invalid Stage-4 submission preflight");
  if (submissionVerification?.status !== "VERIFIED_STAGE4_INTENT_SUBMISSION" || submissionVerification.network?.chainId !== 97 || submissionVerification.transactionOccurred !== true || digestBody(submissionVerification, "submissionVerificationDigest") !== submissionVerification.submissionVerificationDigest) throw new Error("Invalid Stage-4 submission verification");
  if (submissionVerification.submissionVerificationDigest !== expectedSubmissionVerificationDigest) throw new Error("Stage-4 submission verification does not match the independently reviewed digest");
  if (submissionPreflight.submissionPlanDigest !== submissionVerification.submissionPlanDigest || submissionPreflight.submissionPreflightDigest !== submissionVerification.submissionPreflightDigest || submissionVerification.pilotPlanDigest !== pilotPlan.pilotPlanDigest || submissionVerification.intentHash !== pilotPlan.intentHash || submissionPreflight.intentHash !== pilotPlan.intentHash) throw new Error("Stage-4 Solver quote evidence binding mismatch");
  if (submissionVerification.intentStatus !== "OPEN" || submissionVerification.deposit?.active !== true || BigInt(submissionVerification.deposit?.amount ?? 0) !== BigInt(pilotPlan.intent.sourceAmount)) throw new Error("Stage-4 Intent is not open with an active exact deposit");
  const quoteManager = ethers.getAddress(submissionPreflight.addresses?.quoteManager), quoteSolver = ethers.getAddress(solver);
  if (quoteSolver === ethers.ZeroAddress) throw new Error("Invalid Stage-4 Solver address");
  const gross = BigInt(amountOut), fee = BigInt(solverFeeOut), gas = BigInt(gasCostOut), start = BigInt(issuedAt), expiry = BigInt(deadline), quoteNonce = BigInt(nonce), minimum = BigInt(pilotPlan.intent.minAmountOut);
  if (gross <= 0n || fee < 0n || gas < 0n || fee >= gross || gas >= gross - fee) throw new Error("Invalid Stage-4 Solver quote economics");
  const net = gross - fee - gas;
  if (net < minimum) throw new Error("Stage-4 Solver quote is below the Intent minimum output");
  if (start <= 0n || expiry < start || expiry - start > 120n || expiry > BigInt(pilotPlan.intent.deadline)) throw new Error("Invalid Stage-4 Solver quote lifetime");
  if (quoteNonce < 0n) throw new Error("Invalid Stage-4 Solver quote nonce");
  const quote = { intentHash: pilotPlan.intentHash, solver: quoteSolver, dexId: pilotPlan.dexId, amountOut: gross.toString(), solverFeeOut: fee.toString(), gasCostOut: gas.toString(), routeHash: pilotPlan.routeHash, issuedAt: start.toString(), deadline: expiry.toString(), nonce: quoteNonce.toString() };
  const domain = { name: "LQC Solver Quote Manager", version: "1", chainId: 97, verifyingContract: quoteManager }, quoteHash = ethers.TypedDataEncoder.hash(domain, QUOTE_TYPES, quote);
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE4_SOLVER_QUOTE_PACKET", status: "READY_FOR_SEPARATE_SOLVER_EIP712_REVIEW", network: { name: "BSC Testnet", chainId: 97 }, pilotPlanDigest: pilotPlan.pilotPlanDigest, submissionPlanDigest: submissionVerification.submissionPlanDigest, submissionPreflightDigest: submissionPreflight.submissionPreflightDigest, submissionVerificationDigest: submissionVerification.submissionVerificationDigest, submissionTransactionHash: submissionVerification.transactionHash, intentHash: pilotPlan.intentHash, routeData: pilotPlan.routeData, routeHash: pilotPlan.routeHash, typedData: { domain, types: QUOTE_TYPES, primaryType: "SolverQuote", message: quote }, quoteHash, quoteEconomics: { grossAmountOut: gross.toString(), solverFeeOut: fee.toString(), gasCostOut: gas.toString(), netAmountOut: net.toString(), minimumAmountOut: minimum.toString() }, walletReview: { expectedSigner: quoteSolver, verifyingContract: quoteManager, quoteLifetimeSeconds: Number(expiry - start) }, signature: null, transactionOccurred: false, safety: "Unsigned Solver EIP-712 quote packet only. No private key, wallet request, signature, RPC call, route execution, settlement, or transaction is created or sent." };
  return { ...body, solverQuotePacketDigest: canonicalDigest(body) };
}

async function main() {
  const [pilotFile, preflightFile, verificationFile, expectedSubmissionVerificationDigest, quoteInputFile, outputFile] = process.argv.slice(2);
  if (!outputFile) throw new Error("Usage: node prepare-intent-stage4-solver-quote-packet.mjs <pilot.json> <submission-preflight.json> <submission-verification.json> <expected-verification-digest> <quote-input.json> <output.json>");
  const readJson = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = prepareIntentStage4SolverQuotePacket({ pilotPlan: readJson(pilotFile), submissionPreflight: readJson(preflightFile), submissionVerification: readJson(verificationFile), expectedSubmissionVerificationDigest, ...readJson(quoteInputFile) });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); console.log(`Wrote ${path.resolve(outputFile)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
