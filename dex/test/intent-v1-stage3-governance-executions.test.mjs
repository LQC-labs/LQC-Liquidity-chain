import assert from "node:assert/strict";
import { ethers } from "ethers";
import { canonicalDigest } from "../scripts/build-intent-reproducibility-seal.mjs";
import { SAFE_TYPES } from "../scripts/build-intent-stage3-safe-proposal-plan.mjs";
import { verifyIntentStage3GovernanceExecutions } from "../scripts/verify-intent-stage3-governance-executions.mjs";

describe("LQC Intent Stage-3 Governance execution verification", function () {
  const address = value => ethers.getAddress(`0x${value.toString(16).padStart(40, "0")}`), safe = address(10);
  const safeInterface = new ethers.Interface(["function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns(bool)", "event ExecutionSuccess(bytes32 txHash,uint256 payment)"]);
  const log = (hash) => { const event = safeInterface.getEvent("ExecutionSuccess"), encoded = safeInterface.encodeEventLog(event, [hash, 0]); return { address: safe, topics: encoded.topics, data: encoded.data }; };

  function fixture() {
    const proposals = Array.from({ length: 11 }, (_, index) => {
      const tx = { to: address(20 + index), value: "0", data: `0x${(index + 1).toString(16).padStart(8, "0")}`, operation: 0, safeTxGas: "0", baseGas: "0", gasPrice: "0", gasToken: ethers.ZeroAddress, refundReceiver: ethers.ZeroAddress, nonce: String(9 + index) };
      const typed = { ...tx, value: 0n, safeTxGas: 0n, baseGas: 0n, gasPrice: 0n, nonce: BigInt(tx.nonce) };
      return { id: index + 1, action: `action-${index + 1}`, safeTransaction: tx, safeTxHash: ethers.TypedDataEncoder.hash({ chainId: 97, verifyingContract: safe }, SAFE_TYPES, typed) };
    });
    const planBody = { status: "READY_FOR_SEPARATE_EXPLICIT_4_OF_7_APPROVAL", network: { chainId: 97 }, governanceSafe: safe, startingNonce: "9", endingNonce: "19", proposals, transactionOccurred: false };
    const plan = { ...planBody, proposalPlanDigest: canonicalDigest(planBody) };
    const executions = proposals.map((proposal, index) => {
      const p = proposal.safeTransaction, hash = ethers.id(`tx-${index}`), data = safeInterface.encodeFunctionData("execTransaction", [p.to, 0, p.data, 0, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, "0x1234"]), blockHash = ethers.id(`block-${index}`);
      return { transaction: { hash, to: safe, data }, receipt: { hash, to: safe, status: 1, blockNumber: 100 + index, index: 0, blockHash, logs: [log(proposal.safeTxHash)] }, canonicalBlockHash: blockHash, latestBlock: 120 };
    });
    return { plan, executions };
  }

  it("verifies all ordered Safe payloads, hashes, receipts and finality", function () {
    const result = verifyIntentStage3GovernanceExecutions(fixture());
    assert.equal(result.status, "SAFE_EXECUTIONS_VERIFIED_PENDING_FINAL_STATE");
    assert.equal(result.verifiedExecutions.length, 11);
    assert.equal(result.verifiedExecutions[0].nonce, "9");
    assert.equal(result.verifiedExecutions[10].nonce, "19");
    assert.equal(result.transactionOccurred, true);
  });

  it("rejects payload substitution, weak finality, reordering and missing Safe success", function () {
    let input = fixture(); input.executions[0].transaction.data = input.executions[1].transaction.data; assert.throws(() => verifyIntentStage3GovernanceExecutions(input), /payload/);
    input = fixture(); input.executions[10].latestBlock = 111; assert.throws(() => verifyIntentStage3GovernanceExecutions(input), /finality/);
    input = fixture(); input.executions[1].receipt.blockNumber = 99; assert.throws(() => verifyIntentStage3GovernanceExecutions(input), /out of order/);
    input = fixture(); input.executions[0].receipt.logs = []; assert.throws(() => verifyIntentStage3GovernanceExecutions(input), /success event/);
  });
});
