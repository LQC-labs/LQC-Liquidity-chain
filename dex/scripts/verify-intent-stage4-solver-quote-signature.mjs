import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const digestBody = (record, field) => canonicalDigest(Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt")));

export function verifyIntentStage4SolverQuoteSignature({ solverQuotePacket, expectedSolverQuotePacketDigest, signature }) {
  if (solverQuotePacket?.status !== "READY_FOR_SEPARATE_SOLVER_EIP712_REVIEW" || solverQuotePacket.network?.chainId !== 97 || solverQuotePacket.transactionOccurred !== false || solverQuotePacket.signature !== null || digestBody(solverQuotePacket, "solverQuotePacketDigest") !== solverQuotePacket.solverQuotePacketDigest) throw new Error("Invalid Stage-4 Solver quote packet");
  if (solverQuotePacket.solverQuotePacketDigest !== expectedSolverQuotePacketDigest) throw new Error("Stage-4 Solver quote packet does not match the independently reviewed digest");
  if (!ethers.isHexString(signature, 65)) throw new Error("Stage-4 Solver quote signature must be 65 bytes");
  let normalized; try { normalized = ethers.Signature.from(signature).serialized; } catch { throw new Error("Invalid Stage-4 Solver quote signature encoding"); }
  const typedHash = ethers.TypedDataEncoder.hash(solverQuotePacket.typedData.domain, solverQuotePacket.typedData.types, solverQuotePacket.typedData.message);
  if (typedHash !== solverQuotePacket.quoteHash) throw new Error("Stage-4 signed Solver quote hash mismatch");
  const recovered = ethers.verifyTypedData(solverQuotePacket.typedData.domain, solverQuotePacket.typedData.types, solverQuotePacket.typedData.message, normalized), expected = ethers.getAddress(solverQuotePacket.walletReview.expectedSigner);
  if (ethers.getAddress(recovered) !== expected || ethers.getAddress(solverQuotePacket.typedData.message.solver) !== expected) throw new Error("Stage-4 Solver quote signature signer mismatch");
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE4_SOLVER_QUOTE_SIGNATURE_VERIFICATION", status: "VERIFIED_STAGE4_SOLVER_QUOTE_SIGNATURE", network: { name: "BSC Testnet", chainId: 97 }, solverQuotePacketDigest: solverQuotePacket.solverQuotePacketDigest, pilotPlanDigest: solverQuotePacket.pilotPlanDigest, submissionPlanDigest: solverQuotePacket.submissionPlanDigest, submissionPreflightDigest: solverQuotePacket.submissionPreflightDigest, submissionVerificationDigest: solverQuotePacket.submissionVerificationDigest, submissionTransactionHash: solverQuotePacket.submissionTransactionHash, intentHash: solverQuotePacket.intentHash, routeHash: solverQuotePacket.routeHash, quoteHash: solverQuotePacket.quoteHash, signer: expected, signature: normalized, signatureHash: ethers.keccak256(normalized), quoteEconomics: solverQuotePacket.quoteEconomics, transactionOccurred: false, safety: "Offline public Solver-signature verification only. No private key, wallet request, RPC call, route execution, settlement, or transaction." };
  return { ...body, solverQuoteSignatureVerificationDigest: canonicalDigest(body) };
}

async function main() {
  const [packetFile, expectedSolverQuotePacketDigest, signatureFile, outputFile] = process.argv.slice(2);
  if (!outputFile) throw new Error("Usage: node verify-intent-stage4-solver-quote-signature.mjs <solver-quote-packet.json> <expected-packet-digest> <signature.txt> <output.json>");
  const solverQuotePacket = JSON.parse(fs.readFileSync(path.resolve(packetFile), "utf8")), signature = fs.readFileSync(path.resolve(signatureFile), "utf8").trim();
  const result = verifyIntentStage4SolverQuoteSignature({ solverQuotePacket, expectedSolverQuotePacketDigest, signature });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); console.log(`Wrote ${path.resolve(outputFile)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
