import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const INTENT_TYPES = { Intent: [
  { name: "user", type: "address" }, { name: "sourceChainId", type: "uint256" }, { name: "sourceToken", type: "address" },
  { name: "sourceAmount", type: "uint256" }, { name: "destinationChainId", type: "uint256" }, { name: "destinationToken", type: "address" },
  { name: "recipient", type: "address" }, { name: "minAmountOut", type: "uint256" }, { name: "deadline", type: "uint256" },
  { name: "nonce", type: "uint256" }, { name: "salt", type: "bytes32" },
] };

function validDigest(record, field) {
  if (!record?.[field]) return false;
  const body = Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt"));
  return canonicalDigest(body) === record[field];
}
const address = value => ethers.getAddress(value);

export function prepareIntentStage4Pilot({ handoffVerification, intentHub, user, sourceToken, destinationToken, recipient, sourceAmount, quotedAmountOut, minimumAmountOut, maxSourceAmount, deadline, nonce, salt, dexId, routeData, now }) {
  if (handoffVerification?.status !== "VERIFIED_STAGE3_AUDIT_HANDOFF" || handoffVerification.network?.chainId !== 97 || handoffVerification.transactionOccurred !== false || !validDigest(handoffVerification, "handoffVerificationDigest")) throw new Error("Invalid Stage-3 audit handoff verification");
  const hub = address(intentHub), signer = address(user), tokenIn = address(sourceToken), tokenOut = address(destinationToken), receiver = address(recipient);
  if (tokenIn === tokenOut || !ethers.isHexString(salt, 32) || !ethers.isHexString(dexId, 32) || dexId === ethers.ZeroHash || !ethers.isHexString(routeData) || routeData === "0x") throw new Error("Invalid Stage-4 pilot route or identity");
  const amountIn = BigInt(sourceAmount), quoteOut = BigInt(quotedAmountOut), minOut = BigInt(minimumAmountOut), cap = BigInt(maxSourceAmount), expiry = BigInt(deadline), issuedAt = BigInt(now), intentNonce = BigInt(nonce);
  if (amountIn <= 0n || cap <= 0n || amountIn > cap) throw new Error("Stage-4 pilot input exceeds reviewed cap");
  if (quoteOut <= 0n || minOut <= 0n || minOut > quoteOut || minOut * 10_000n < quoteOut * 9_900n) throw new Error("Stage-4 pilot minimum output must retain 99% of quote");
  if (expiry < issuedAt + 300n || expiry > issuedAt + 900n) throw new Error("Stage-4 pilot deadline must be 5 to 15 minutes");
  if (intentNonce < 0n) throw new Error("Invalid Stage-4 pilot nonce");
  const intent = { user: signer, sourceChainId: "97", sourceToken: tokenIn, sourceAmount: amountIn.toString(), destinationChainId: "97", destinationToken: tokenOut, recipient: receiver, minAmountOut: minOut.toString(), deadline: expiry.toString(), nonce: intentNonce.toString(), salt };
  const domain = { name: "LQC Intent Hub", version: "1", chainId: 97, verifyingContract: hub };
  const body = {
    schemaVersion: 1, recordType: "LQC_INTENT_STAGE4_PILOT_PLAN", status: "READY_FOR_OFFLINE_REVIEW_ONLY", network: { name: "BSC Testnet", chainId: 97 },
    stage3HandoffVerificationDigest: handoffVerification.handoffVerificationDigest, intentHub: hub, intent, domain, types: INTENT_TYPES,
    intentHash: ethers.TypedDataEncoder.hash(domain, INTENT_TYPES, intent), dexId: dexId.toLowerCase(), routeData: routeData.toLowerCase(), routeHash: ethers.keccak256(routeData),
    quoteBounds: { quotedAmountOut: quoteOut.toString(), minimumAmountOut: minOut.toString(), slippageBps: Number((quoteOut - minOut) * 10_000n / quoteOut) },
    pilotLimits: { maxSourceAmount: cap.toString(), deadlineSeconds: Number(expiry - issuedAt), sameChainOnly: true, singleRouteOnly: true },
    requiredManualSteps: ["Re-run read-only on-chain readiness immediately before signing.", "Confirm exact token, amount, recipient, route and deadline in the wallet.", "Approve only the exact source amount to SourceEscrow.", "Sign the EIP-712 Intent separately; do not expose a private key to this tool.", "Submit and execute only after a fresh Solver quote passes independent verification."],
    transactionOccurred: false,
    safety: "Preparation only. No token approval, EIP-712 signature, Solver quote, wallet request, RPC call, or transaction is created or sent.",
  };
  return { ...body, pilotPlanDigest: canonicalDigest(body) };
}

async function main() {
  const [handoffFile, inputFile, outputFile] = process.argv.slice(2);
  if (!outputFile) throw new Error("Usage: node prepare-intent-stage4-pilot.mjs <handoff-verification.json> <pilot-input.json> <output.json>");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = prepareIntentStage4Pilot({ handoffVerification: read(handoffFile), ...read(inputFile) });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(`Wrote ${path.resolve(outputFile)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
