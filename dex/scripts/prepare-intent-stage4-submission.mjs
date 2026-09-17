import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const hub = new ethers.Interface(["function submitIntent((address user,uint256 sourceChainId,address sourceToken,uint256 sourceAmount,uint256 destinationChainId,address destinationToken,address recipient,uint256 minAmountOut,uint256 deadline,uint256 nonce,bytes32 salt) intent,bytes signature) returns(bytes32)"]);
const digestBody = (record, field) => canonicalDigest(Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt")));

export function prepareIntentStage4Submission({ signingPacket, signatureVerification, expectedSignatureVerificationDigest }) {
  if (signingPacket?.status !== "READY_FOR_SEPARATE_EIP712_WALLET_REVIEW" || signingPacket.network?.chainId !== 97 || signingPacket.transactionOccurred !== false || digestBody(signingPacket, "signingPacketDigest") !== signingPacket.signingPacketDigest) throw new Error("Invalid Stage-4 signing packet");
  if (signatureVerification?.status !== "VERIFIED_STAGE4_INTENT_SIGNATURE" || signatureVerification.network?.chainId !== 97 || signatureVerification.transactionOccurred !== false || digestBody(signatureVerification, "signatureVerificationDigest") !== signatureVerification.signatureVerificationDigest) throw new Error("Invalid Stage-4 signature verification");
  if (signatureVerification.signatureVerificationDigest !== expectedSignatureVerificationDigest) throw new Error("Stage-4 signature verification does not match the independently reviewed digest");
  if (signatureVerification.signingPacketDigest !== signingPacket.signingPacketDigest || signatureVerification.pilotPlanDigest !== signingPacket.pilotPlanDigest || signatureVerification.intentHash !== signingPacket.intentHash || signatureVerification.signer.toLowerCase() !== signingPacket.walletReview.expectedSigner.toLowerCase()) throw new Error("Stage-4 submission evidence binding mismatch");
  const intentHash = ethers.TypedDataEncoder.hash(signingPacket.typedData.domain, signingPacket.typedData.types, signingPacket.typedData.message), recovered = ethers.verifyTypedData(signingPacket.typedData.domain, signingPacket.typedData.types, signingPacket.typedData.message, signatureVerification.signature);
  if (intentHash !== signingPacket.intentHash || recovered.toLowerCase() !== signatureVerification.signer.toLowerCase() || ethers.keccak256(signatureVerification.signature) !== signatureVerification.signatureHash) throw new Error("Stage-4 submission signature mismatch");
  const target = ethers.getAddress(signingPacket.walletReview.verifyingContract), sender = ethers.getAddress(signatureVerification.signer), data = hub.encodeFunctionData("submitIntent", [signingPacket.typedData.message, signatureVerification.signature]);
  const transaction = { chainId: 97, from: sender, to: target, value: "0", data };
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE4_SUBMISSION_PLAN", status: "READY_FOR_FINAL_READ_ONLY_PREFLIGHT", network: { name: "BSC Testnet", chainId: 97 }, signingPacketDigest: signingPacket.signingPacketDigest, signatureVerificationDigest: signatureVerification.signatureVerificationDigest, pilotPlanDigest: signingPacket.pilotPlanDigest, intentHash: signingPacket.intentHash, signatureHash: signatureVerification.signatureHash, transaction, finalChecks: ["Re-run multi-RPC pause, nonce, balance, exact allowance and deadline checks.", "Simulate this exact calldata from the recorded sender at the latest block.", "Confirm zero native value and the reviewed Intent fields in the wallet.", "Submit at most once and preserve the transaction hash before waiting for the receipt."], transactionOccurred: false, safety: "Unsigned submission plan only. No RPC, simulation, wallet request, signature creation, Intent submission, token movement, or transaction is performed." };
  return { ...body, submissionPlanDigest: canonicalDigest(body) };
}

async function main() {
  const [packetFile, signatureVerificationFile, expectedSignatureVerificationDigest, outputFile] = process.argv.slice(2);
  if (!outputFile) throw new Error("Usage: node prepare-intent-stage4-submission.mjs <signing-packet.json> <signature-verification.json> <expected-signature-digest> <output.json>");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = prepareIntentStage4Submission({ signingPacket: read(packetFile), signatureVerification: read(signatureVerificationFile), expectedSignatureVerificationDigest });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); console.log(`Wrote ${path.resolve(outputFile)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
