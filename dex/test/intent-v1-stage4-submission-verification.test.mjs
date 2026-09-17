import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { verifyIntentStage4Submission } from "../scripts/verify-intent-stage4-submission.mjs";

const hub = new ethers.Interface(["function submitIntent((address user,uint256 sourceChainId,address sourceToken,uint256 sourceAmount,uint256 destinationChainId,address destinationToken,address recipient,uint256 minAmountOut,uint256 deadline,uint256 nonce,bytes32 salt),bytes) returns(bytes32)", "function getIntent(bytes32) view returns((address user,address sourceToken,uint256 sourceAmount,uint256 destinationChainId,address destinationToken,address recipient,uint256 minAmountOut,uint256 deadline,uint8 status,address solver,uint256 actualAmountOut,bytes32 destinationTxHash,bytes32 executionHash,bytes32 quoteHash,bytes32 routeHash))", "function nonceUsed(address,uint256) view returns(bool)", "function sourceEscrow() view returns(address)", "event IntentSubmitted(bytes32 indexed intentHash,address indexed user,uint256 indexed nonce,uint256 deadline)"]);
const escrow = new ethers.Interface(["function getDeposit(bytes32) view returns((address user,address token,uint256 amount,bool active))", "event SourceLocked(bytes32 indexed intentHash,address indexed user,address indexed token,uint256 amount)"]);
const a = value => ethers.getAddress(`0x${value.toString(16).padStart(40, "0")}`);

function fixture(change = {}) {
  const user = a(1), target = a(2), sourceToken = a(3), destinationToken = a(4), sourceEscrow = a(5), amount = 1000n, nonce = 12n, deadline = 5000600n, intentHash = ethers.id("stage4-submitted-intent"), transactionHash = `0x${"44".repeat(32)}`;
  const intent = { user, sourceChainId: 97n, sourceToken, sourceAmount: amount, destinationChainId: 97n, destinationToken, recipient: user, minAmountOut: 990n, deadline, nonce, salt: ethers.id("pilot-12") }, data = hub.encodeFunctionData("submitIntent", [intent, `0x${"11".repeat(65)}`]);
  const planBody = { status: "READY_FOR_FINAL_READ_ONLY_PREFLIGHT", network: { chainId: 97 }, signingPacketDigest: "sha256:signing", signatureVerificationDigest: "sha256:signature", pilotPlanDigest: "sha256:pilot", intentHash, signatureHash: ethers.id("signature"), transaction: { chainId: 97, from: user, to: target, value: "0", data }, transactionOccurred: false }, submissionPlan = { ...planBody, submissionPlanDigest: canonicalDigest(planBody) };
  const preflightBody = { status: "READY_FOR_SEPARATE_WALLET_SUBMISSION", network: { chainId: 97 }, submissionPlanDigest: submissionPlan.submissionPlanDigest, signingPacketDigest: submissionPlan.signingPacketDigest, signatureVerificationDigest: submissionPlan.signatureVerificationDigest, pilotPlanDigest: submissionPlan.pilotPlanDigest, intentHash, signatureHash: submissionPlan.signatureHash, transaction: submissionPlan.transaction, transactionOccurred: false }, submissionPreflight = { ...preflightBody, submissionPreflightDigest: canonicalDigest(preflightBody) };
  const intentEvent = hub.encodeEventLog(hub.getEvent("IntentSubmitted"), [intentHash, user, nonce, deadline]), lockedEvent = escrow.encodeEventLog(escrow.getEvent("SourceLocked"), [intentHash, user, sourceToken, amount]);
  const logs = change.badEvent ? [{ address: target, topics: intentEvent.topics, data: hub.encodeEventLog(hub.getEvent("IntentSubmitted"), [intentHash, user, nonce, deadline + 1n]).data }, { address: sourceEscrow, ...lockedEvent }] : [{ address: target, ...intentEvent }, { address: sourceEscrow, ...lockedEvent }];
  const provider = disagreement => ({
    getNetwork: async () => ({ chainId: 97n }), getBlockNumber: async () => 102,
    getTransaction: async () => ({ hash: transactionHash, from: user, to: target, value: 0n, data: change.badData ? `0xdeadbeef${data.slice(10)}` : data }),
    getTransactionReceipt: async () => ({ hash: transactionHash, from: user, to: target, status: change.failed ? 0 : 1, blockNumber: change.weak ? 101 : 100, blockHash: disagreement ? ethers.id("other") : ethers.id("submitted"), logs: change.missingLogs ? [] : logs }),
    getBlock: async () => ({ hash: disagreement ? ethers.id("other") : ethers.id("submitted") }),
    call: async tx => {
      const selector = tx.data.slice(0, 10);
      if (selector === hub.getFunction("sourceEscrow").selector) return hub.encodeFunctionResult("sourceEscrow", [sourceEscrow]);
      if (selector === hub.getFunction("nonceUsed").selector) return hub.encodeFunctionResult("nonceUsed", [!change.unusedNonce]);
      if (selector === hub.getFunction("getIntent").selector) return hub.encodeFunctionResult("getIntent", [[user, sourceToken, change.badRecord ? 999n : amount, 97n, destinationToken, user, 990n, deadline, change.closed ? 2 : 1, ethers.ZeroAddress, 0n, ethers.ZeroHash, ethers.ZeroHash, ethers.ZeroHash, ethers.ZeroHash]]);
      if (selector === escrow.getFunction("getDeposit").selector) return escrow.encodeFunctionResult("getDeposit", [[user, sourceToken, amount, !change.inactiveDeposit]]);
      throw new Error(`Missing mock ${selector}`);
    },
  });
  return { providers: [provider(false), provider(Boolean(change.rpcDisagreement))], submissionPlan, submissionPreflight, expectedSubmissionPreflightDigest: submissionPreflight.submissionPreflightDigest, transactionHash };
}

describe("LQC Intent Stage-4 submission verification", function () {
  it("verifies the exact transaction, events, OPEN record and active escrow deposit", async function () {
    const result = await verifyIntentStage4Submission(fixture());
    assert.equal(result.status, "VERIFIED_STAGE4_INTENT_SUBMISSION"); assert.equal(result.confirmations, 3); assert.equal(result.intentStatus, "OPEN"); assert.equal(result.deposit.active, true); assert.equal(result.transactionOccurred, true); assert.match(result.submissionVerificationDigest, /^sha256:[0-9a-f]{64}$/);
  });
  it("rejects failed, weak, changed, non-canonical or incomplete submission evidence", async function () {
    for (const [change, pattern] of [[{ failed: true }, /failed/], [{ weak: true }, /confirmations/], [{ badData: true }, /payload/], [{ badRecord: true }, /record/], [{ closed: true }, /record/], [{ unusedNonce: true }, /nonce/], [{ inactiveDeposit: true }, /deposit/], [{ missingLogs: true }, /event/], [{ badEvent: true }, /event/], [{ rpcDisagreement: true }, /disagreement/]]) await assert.rejects(verifyIntentStage4Submission(fixture(change)), pattern, JSON.stringify(change));
    const input = fixture(); input.expectedSubmissionPreflightDigest = "sha256:unreviewed"; await assert.rejects(verifyIntentStage4Submission(input), /independently reviewed/);
  });
  it("contains no signing, wallet, settlement or transaction broadcast mechanism", function () {
    const source = fs.readFileSync(new URL("../scripts/verify-intent-stage4-submission.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(source, /PRIVATE_KEY|signTypedData|eth_sendTransaction|sendTransaction|settleIntent\(/); assert.match(source, /Read-only verification/);
  });
});
