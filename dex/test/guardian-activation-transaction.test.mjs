import assert from "node:assert/strict";
import { ethers } from "ethers";
import { validateGuardianActivationTransaction } from "../scripts/verify-guardian-activation-transaction.mjs";

const address = value => `0x${value.toString(16).padStart(40, "0")}`;
const emergencyInterface = new ethers.Interface(["event GuardianChanged(address indexed guardian,bool enabled)"]);
const safeInterface = new ethers.Interface(["event ExecutionSuccess(bytes32 txHash,uint256 payment)"]);
const governance = address(1), guardian = address(2), emergency = address(3);
const transactionHash = `0x${"11".repeat(32)}`, safeTransactionHash = `0x${"22".repeat(32)}`;
const deployment = { network: { chainId: 97 }, owner: governance, guardian,
  contracts: { emergencyController: { address: emergency } } };
const encodedLog = (iface, event, values, emitter) => {
  const fragment = iface.getEvent(event), encoded = iface.encodeEventLog(fragment, values);
  return { address: emitter, topics: encoded.topics, data: encoded.data };
};
const transaction = { hash: transactionHash, to: governance };
const receipt = { hash: transactionHash, to: governance, status: 1, blockNumber: 100, logs: [
  encodedLog(safeInterface, "ExecutionSuccess", [safeTransactionHash, 0], governance),
  encodedLog(emergencyInterface, "GuardianChanged", [guardian, true], emergency),
] };

describe("Guardian activation transaction evidence", function () {
  it("verifies Safe execution, Guardian event, finality, and active state", function () {
    const result = validateGuardianActivationTransaction({ deployment, transaction, receipt, latestBlock: 102, guardianEnabled: true });
    assert.equal(result.status, "VERIFIED");
    assert.equal(result.confirmations, 3);
    assert.equal(result.guardian, ethers.getAddress(guardian));
  });

  it("rejects failed, weak-finality, non-Safe, tampered, and inactive evidence", function () {
    const verify = overrides => validateGuardianActivationTransaction({
      deployment, transaction, receipt, latestBlock: 102, guardianEnabled: true, ...overrides
    });
    assert.throws(() => verify({ receipt: { ...receipt, status: 0 } }), /did not succeed/);
    assert.throws(() => verify({ latestBlock: 101 }), /lacks required confirmations/);
    assert.throws(() => verify({ transaction: { ...transaction, to: address(9) } }), /Governance Safe/);
    assert.throws(() => verify({ receipt: { ...receipt, logs: receipt.logs.slice(1) } }), /Safe success event/);
    const wrongGuardianLog = encodedLog(emergencyInterface, "GuardianChanged", [address(9), true], emergency);
    assert.throws(() => verify({ receipt: { ...receipt, logs: [receipt.logs[0], wrongGuardianLog] } }), /event is missing/);
    assert.throws(() => verify({ guardianEnabled: false }), /not active/);
  });
});
