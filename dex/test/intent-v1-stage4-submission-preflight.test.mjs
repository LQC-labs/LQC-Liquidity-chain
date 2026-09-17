import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { prepareIntentStage4Submission } from "../scripts/prepare-intent-stage4-submission.mjs";
import { preflightIntentStage4Submission } from "../scripts/preflight-intent-stage4-submission.mjs";

const intentFields = [{ name: "user", type: "address" }, { name: "sourceChainId", type: "uint256" }, { name: "sourceToken", type: "address" }, { name: "sourceAmount", type: "uint256" }, { name: "destinationChainId", type: "uint256" }, { name: "destinationToken", type: "address" }, { name: "recipient", type: "address" }, { name: "minAmountOut", type: "uint256" }, { name: "deadline", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "salt", type: "bytes32" }];
const hub = new ethers.Interface(["function submitIntent((address user,uint256 sourceChainId,address sourceToken,uint256 sourceAmount,uint256 destinationChainId,address destinationToken,address recipient,uint256 minAmountOut,uint256 deadline,uint256 nonce,bytes32 salt),bytes) returns(bytes32)", "function sourceEscrow() view returns(address)", "function quoteManager() view returns(address)", "function solverRegistry() view returns(address)", "function internalSolver() view returns(address)", "function paused() view returns(bool)", "function nonceUsed(address,uint256) view returns(bool)"]);
const token = new ethers.Interface(["function balanceOf(address) view returns(uint256)", "function allowance(address,address) view returns(uint256)"]);
const a = value => ethers.getAddress(`0x${value.toString(16).padStart(40, "0")}`);

async function fixture(change = {}) {
  const wallet = ethers.Wallet.createRandom(), hubAddress = a(1), sourceToken = a(2), destinationToken = a(3), escrow = a(4), quote = a(5), registry = a(6), solver = a(7);
  const domain = { name: "LQC Intent Hub", version: "1", chainId: 97, verifyingContract: hubAddress }, types = { Intent: intentFields }, message = { user: wallet.address, sourceChainId: "97", sourceToken, sourceAmount: "1000", destinationChainId: "97", destinationToken, recipient: wallet.address, minAmountOut: "990", deadline: String(change.deadline ?? 5000600), nonce: "12", salt: ethers.id("pilot-12") };
  const intentHash = ethers.TypedDataEncoder.hash(domain, types, message), signature = await wallet.signTypedData(domain, types, message);
  const packetBody = { status: "READY_FOR_SEPARATE_EIP712_WALLET_REVIEW", network: { chainId: 97 }, pilotPlanDigest: "sha256:pilot", typedData: { domain, types, primaryType: "Intent", message }, intentHash, walletReview: { expectedSigner: wallet.address, verifyingContract: hubAddress }, transactionOccurred: false }, signingPacket = { ...packetBody, signingPacketDigest: canonicalDigest(packetBody) };
  const verificationBody = { status: "VERIFIED_STAGE4_INTENT_SIGNATURE", network: { chainId: 97 }, signingPacketDigest: signingPacket.signingPacketDigest, pilotPlanDigest: signingPacket.pilotPlanDigest, intentHash, signer: wallet.address, signature, signatureHash: ethers.keccak256(signature), transactionOccurred: false }, signatureVerification = { ...verificationBody, signatureVerificationDigest: canonicalDigest(verificationBody) };
  const submissionPlan = prepareIntentStage4Submission({ signingPacket, signatureVerification, expectedSignatureVerificationDigest: signatureVerification.signatureVerificationDigest });
  const provider = (disagreement, gasDisagreement = false) => ({
    getNetwork: async () => ({ chainId: 97n }), getBlockNumber: async () => 800,
    getBlock: async () => ({ hash: disagreement ? ethers.id("other-block") : ethers.id("submission-block"), timestamp: 5000300 }),
    getCode: async target => change.noCode?.toLowerCase() === target.toLowerCase() ? "0x" : "0x60016000",
    estimateGas: async () => BigInt(gasDisagreement ? 120000 : 100000),
    call: async tx => {
      const selector = tx.data.slice(0, 10), target = tx.to.toLowerCase();
      if (selector === hub.getFunction("submitIntent").selector) return hub.encodeFunctionResult("submitIntent", [change.simulationMismatch ? ethers.id("wrong") : intentHash]);
      let fragment = hub.getFunction(selector), iface = hub;
      if (!fragment) { fragment = token.getFunction(selector); iface = token; }
      const fn = fragment?.name;
      let value;
      if (target === hubAddress.toLowerCase()) value = { sourceEscrow: escrow, quoteManager: quote, solverRegistry: registry, internalSolver: solver, paused: Boolean(change.hubPaused), nonceUsed: Boolean(change.nonceUsed) }[fn];
      else if ([quote, registry].some(item => item.toLowerCase() === target) && fn === "paused") value = Boolean(change.dependencyPaused);
      else if (target === sourceToken.toLowerCase() && fn === "balanceOf") value = BigInt(change.balance ?? 1000);
      else if (target === sourceToken.toLowerCase() && fn === "allowance") value = BigInt(change.allowance ?? 1000);
      else throw new Error(`Missing mock ${target}.${fn}`);
      return iface.encodeFunctionResult(fn, [value]);
    },
  });
  return { providers: [provider(false), provider(Boolean(change.rpcDisagreement), Boolean(change.gasDisagreement))], submissionPlan, expectedSubmissionPlanDigest: submissionPlan.submissionPlanDigest, addresses: { sourceToken } };
}

describe("LQC Intent Stage-4 final submission preflight", function () {
  it("revalidates exact state and simulates the reviewed calldata on 2+ RPCs", async function () {
    const result = await preflightIntentStage4Submission(await fixture());
    assert.equal(result.status, "READY_FOR_SEPARATE_WALLET_SUBMISSION"); assert.deepEqual(result.gasEstimates, ["100000", "100000"]); assert.equal(result.allowance, "1000"); assert.equal(result.transactionOccurred, false); assert.match(result.submissionPreflightDigest, /^sha256:[0-9a-f]{64}$/);
  });
  it("rejects unsafe state, simulation, runtime and independent evidence mismatches", async function () {
    for (const [change, pattern] of [[{ hubPaused: true }, /paused/], [{ nonceUsed: true }, /nonce/], [{ balance: 999 }, /balance/], [{ allowance: 999 }, /allowance/], [{ deadline: 5000400 }, /deadline/], [{ simulationMismatch: true }, /simulation/], [{ noCode: a(2) }, /runtime/], [{ rpcDisagreement: true }, /disagreement/], [{ gasDisagreement: true }, /gas estimate/]]) await assert.rejects(preflightIntentStage4Submission(await fixture(change)), pattern);
    const input = await fixture(); input.expectedSubmissionPlanDigest = "sha256:unreviewed"; await assert.rejects(preflightIntentStage4Submission(input), /independently reviewed/);
  });
  it("contains no signing, wallet or transaction broadcast mechanism", function () {
    const source = fs.readFileSync(new URL("../scripts/preflight-intent-stage4-submission.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(source, /PRIVATE_KEY|signTypedData|eth_sendTransaction|sendTransaction/); assert.match(source, /eth_call simulation only/);
  });
});
