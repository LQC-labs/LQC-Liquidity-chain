import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { verifyIntentStage4SolverQuoteSignature } from "../scripts/verify-intent-stage4-solver-quote-signature.mjs";

const types = { SolverQuote: [{ name: "intentHash", type: "bytes32" }, { name: "solver", type: "address" }, { name: "amountOut", type: "uint256" }, { name: "deadline", type: "uint256" }] };
async function fixture() {
  const wallet = ethers.Wallet.createRandom(), domain = { name: "LQC Solver Quote Manager", version: "1", chainId: 97, verifyingContract: "0x0000000000000000000000000000000000000009" }, message = { intentHash: ethers.id("intent"), solver: wallet.address, amountOut: "1010", deadline: "5000460" }, quoteHash = ethers.TypedDataEncoder.hash(domain, types, message);
  const body = { status: "READY_FOR_SEPARATE_SOLVER_EIP712_REVIEW", network: { chainId: 97 }, pilotPlanDigest: "sha256:pilot", submissionPlanDigest: "sha256:submission", submissionPreflightDigest: "sha256:preflight", submissionVerificationDigest: "sha256:verification", submissionTransactionHash: ethers.id("submission-tx"), intentHash: message.intentHash, routeHash: ethers.id("route"), typedData: { domain, types, primaryType: "SolverQuote", message }, quoteHash, quoteEconomics: { grossAmountOut: "1010", solverFeeOut: "5", gasCostOut: "5", netAmountOut: "1000", minimumAmountOut: "990" }, walletReview: { expectedSigner: wallet.address }, signature: null, transactionOccurred: false }, solverQuotePacket = { ...body, solverQuotePacketDigest: canonicalDigest(body) }, signature = await wallet.signTypedData(domain, types, message);
  return { solverQuotePacket, expectedSolverQuotePacketDigest: solverQuotePacket.solverQuotePacketDigest, signature, wallet };
}

describe("LQC Intent Stage-4 offline Solver quote signature verification", function () {
  it("recovers the exact independently reviewed Solver signer", async function () {
    const input = await fixture(), result = verifyIntentStage4SolverQuoteSignature(input);
    assert.equal(result.status, "VERIFIED_STAGE4_SOLVER_QUOTE_SIGNATURE"); assert.equal(result.signer, input.wallet.address); assert.equal(result.quoteHash, input.solverQuotePacket.quoteHash); assert.equal(result.transactionOccurred, false); assert.match(result.solverQuoteSignatureVerificationDigest, /^sha256:[0-9a-f]{64}$/);
  });
  it("rejects another signer, mutation, rehash substitution and malformed signatures", async function () {
    let input = await fixture(), outsider = ethers.Wallet.createRandom(); input.signature = await outsider.signTypedData(input.solverQuotePacket.typedData.domain, input.solverQuotePacket.typedData.types, input.solverQuotePacket.typedData.message); assert.throws(() => verifyIntentStage4SolverQuoteSignature(input), /signer/);
    input = await fixture(); input.solverQuotePacket.typedData.message.amountOut = "1011"; assert.throws(() => verifyIntentStage4SolverQuoteSignature(input), /packet/);
    input = await fixture(); input.solverQuotePacket.walletReview.expectedSigner = outsider.address; input.solverQuotePacket.solverQuotePacketDigest = canonicalDigest(Object.fromEntries(Object.entries(input.solverQuotePacket).filter(([key]) => key !== "solverQuotePacketDigest"))); assert.throws(() => verifyIntentStage4SolverQuoteSignature(input), /independently reviewed/);
    input = await fixture(); input.signature = "0x1234"; assert.throws(() => verifyIntentStage4SolverQuoteSignature(input), /65 bytes/);
  });
  it("contains no key, wallet, RPC, execution or transaction mechanism", function () {
    const source = fs.readFileSync(new URL("../scripts/verify-intent-stage4-solver-quote-signature.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(source, /PRIVATE_KEY|JsonRpcProvider|signTypedData|eth_sendTransaction|sendTransaction|executeSameChainIntent/); assert.match(source, /Offline public Solver-signature verification only/);
  });
});
