import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { verifyIntentStage4Signature } from "../scripts/verify-intent-stage4-signature.mjs";

const types = { Intent: [{ name: "user", type: "address" }, { name: "sourceChainId", type: "uint256" }, { name: "nonce", type: "uint256" }] };
async function fixture() {
  const wallet = ethers.Wallet.createRandom(), domain = { name: "LQC Intent Hub", version: "1", chainId: 97, verifyingContract: "0x0000000000000000000000000000000000000001" }, message = { user: wallet.address, sourceChainId: "97", nonce: "11" }, intentHash = ethers.TypedDataEncoder.hash(domain, types, message);
  const body = { status: "READY_FOR_SEPARATE_EIP712_WALLET_REVIEW", network: { chainId: 97 }, pilotPlanDigest: "sha256:pilot", approvalVerificationDigest: "sha256:approval", postApprovalPreflightDigest: "sha256:preflight", typedData: { domain, types, primaryType: "Intent", message }, intentHash, walletReview: { expectedSigner: wallet.address }, signature: null, transactionOccurred: false }, signingPacket = { ...body, signingPacketDigest: canonicalDigest(body) }, signature = await wallet.signTypedData(domain, types, message);
  return { signingPacket, expectedSigningPacketDigest: signingPacket.signingPacketDigest, signature, wallet };
}

describe("LQC Intent Stage-4 offline signature verification", function () {
  it("recovers the exact reviewed Intent signer", async function () { const input = await fixture(), result = verifyIntentStage4Signature(input); assert.equal(result.status, "VERIFIED_STAGE4_INTENT_SIGNATURE"); assert.equal(result.signer, input.wallet.address); assert.equal(result.intentHash, input.signingPacket.intentHash); assert.equal(result.transactionOccurred, false); assert.match(result.signatureVerificationDigest, /^sha256:[0-9a-f]{64}$/); });
  it("rejects another signer, changed packet, rehashed packet and malformed signature", async function () { let input = await fixture(), outsider = ethers.Wallet.createRandom(); input.signature = await outsider.signTypedData(input.signingPacket.typedData.domain, input.signingPacket.typedData.types, input.signingPacket.typedData.message); assert.throws(() => verifyIntentStage4Signature(input), /signer/); input = await fixture(); input.signingPacket.typedData.message.nonce = "12"; assert.throws(() => verifyIntentStage4Signature(input), /packet/); input = await fixture(); input.signingPacket.walletReview.expectedSigner = outsider.address; input.signingPacket.signingPacketDigest = canonicalDigest(Object.fromEntries(Object.entries(input.signingPacket).filter(([key]) => key !== "signingPacketDigest"))); assert.throws(() => verifyIntentStage4Signature(input), /independently reviewed/); input = await fixture(); input.signature = "0x1234"; assert.throws(() => verifyIntentStage4Signature(input), /65 bytes/); });
  it("contains no key loading, wallet request or transaction path", function () { const source = fs.readFileSync(new URL("../scripts/verify-intent-stage4-signature.mjs", import.meta.url), "utf8"); assert.doesNotMatch(source, /PRIVATE_KEY|JsonRpcProvider|signTypedData|eth_sendTransaction|sendTransaction/); assert.match(source, /Offline public-signature verification only/); });
});
