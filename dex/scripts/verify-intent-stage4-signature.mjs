import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const digestBody = (record, field) => canonicalDigest(Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt")));

export function verifyIntentStage4Signature({ signingPacket, expectedSigningPacketDigest, signature }) {
  if (signingPacket?.status !== "READY_FOR_SEPARATE_EIP712_WALLET_REVIEW" || signingPacket.network?.chainId !== 97 || signingPacket.transactionOccurred !== false || signingPacket.signature !== null || digestBody(signingPacket, "signingPacketDigest") !== signingPacket.signingPacketDigest) throw new Error("Invalid Stage-4 signing packet");
  if (signingPacket.signingPacketDigest !== expectedSigningPacketDigest) throw new Error("Stage-4 signing packet does not match the independently reviewed digest");
  if (!ethers.isHexString(signature, 65)) throw new Error("Stage-4 Intent signature must be 65 bytes");
  let normalized; try { normalized = ethers.Signature.from(signature).serialized; } catch { throw new Error("Invalid Stage-4 Intent signature encoding"); }
  const typedHash = ethers.TypedDataEncoder.hash(signingPacket.typedData.domain, signingPacket.typedData.types, signingPacket.typedData.message);
  if (typedHash !== signingPacket.intentHash) throw new Error("Stage-4 signed Intent hash mismatch");
  const recovered = ethers.verifyTypedData(signingPacket.typedData.domain, signingPacket.typedData.types, signingPacket.typedData.message, normalized);
  if (recovered.toLowerCase() !== signingPacket.walletReview.expectedSigner.toLowerCase()) throw new Error("Stage-4 Intent signature signer mismatch");
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE4_SIGNATURE_VERIFICATION", status: "VERIFIED_STAGE4_INTENT_SIGNATURE", network: { name: "BSC Testnet", chainId: 97 }, signingPacketDigest: signingPacket.signingPacketDigest, pilotPlanDigest: signingPacket.pilotPlanDigest, approvalVerificationDigest: signingPacket.approvalVerificationDigest, postApprovalPreflightDigest: signingPacket.postApprovalPreflightDigest, intentHash: signingPacket.intentHash, signer: ethers.getAddress(recovered), signature: normalized, signatureHash: ethers.keccak256(normalized), transactionOccurred: false, safety: "Offline public-signature verification only. No private key, wallet request, Intent submission, approval, or transaction." };
  return { ...body, signatureVerificationDigest: canonicalDigest(body) };
}

async function main() {
  const [packetFile, expectedSigningPacketDigest, signatureFile, outputFile] = process.argv.slice(2);
  if (!outputFile) throw new Error("Usage: node verify-intent-stage4-signature.mjs <signing-packet.json> <expected-packet-digest> <signature.txt> <output.json>");
  const signingPacket = JSON.parse(fs.readFileSync(path.resolve(packetFile), "utf8")), signature = fs.readFileSync(path.resolve(signatureFile), "utf8").trim();
  const result = verifyIntentStage4Signature({ signingPacket, expectedSigningPacketDigest, signature });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); console.log(`Wrote ${path.resolve(outputFile)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
