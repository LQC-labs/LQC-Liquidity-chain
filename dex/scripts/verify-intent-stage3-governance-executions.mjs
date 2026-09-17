import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";
import { SAFE_TYPES } from "./build-intent-stage3-safe-proposal-plan.mjs";

const safeInterface = new ethers.Interface([
  "function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,bytes signatures) returns(bool success)",
  "event ExecutionSuccess(bytes32 txHash,uint256 payment)",
]);

function verifiedPlan(plan) {
  if (!plan?.proposalPlanDigest) return false;
  const body = Object.fromEntries(Object.entries(plan).filter(([key]) => key !== "proposalPlanDigest" && key !== "checkedAt"));
  return canonicalDigest(body) === plan.proposalPlanDigest;
}

function sameAddress(left, right) {
  return ethers.isAddress(left) && ethers.isAddress(right) && left.toLowerCase() === right.toLowerCase();
}

function executionSuccess(receipt, safe, expectedHash) {
  for (const log of receipt.logs || []) {
    if (!sameAddress(log.address, safe)) continue;
    try {
      const parsed = safeInterface.parseLog(log);
      if (parsed?.name === "ExecutionSuccess" && parsed.args.txHash.toLowerCase() === expectedHash.toLowerCase()) return true;
    } catch {}
  }
  return false;
}

export function verifyIntentStage3GovernanceExecutions({ plan, executions }) {
  if (plan?.status !== "READY_FOR_SEPARATE_EXPLICIT_4_OF_7_APPROVAL" || plan.network?.chainId !== 97 || plan.transactionOccurred !== false || !verifiedPlan(plan)) throw new Error("Invalid Stage-3 Safe proposal plan");
  if (!Array.isArray(executions) || executions.length !== plan.proposals?.length) throw new Error("Stage-3 execution count mismatch");
  const safe = ethers.getAddress(plan.governanceSafe);
  const seenTransactions = new Set();
  let previousPosition = null;
  const verifiedExecutions = executions.map((evidence, index) => {
    const proposal = plan.proposals[index], transaction = evidence?.transaction, receipt = evidence?.receipt;
    if (!transaction?.hash || !receipt || transaction.hash.toLowerCase() !== receipt.hash?.toLowerCase()) throw new Error(`Stage-3 transaction ${index + 1} receipt mismatch`);
    if (seenTransactions.has(transaction.hash.toLowerCase())) throw new Error("Duplicate Stage-3 transaction hash");
    seenTransactions.add(transaction.hash.toLowerCase());
    if (!sameAddress(transaction.to, safe) || Number(receipt.status) !== 1 || !sameAddress(receipt.to, safe)) throw new Error(`Stage-3 Safe execution ${index + 1} failed`);
    if (receipt.blockHash?.toLowerCase() !== evidence.canonicalBlockHash?.toLowerCase()) throw new Error(`Stage-3 transaction ${index + 1} is not canonical`);
    const confirmations = Number(evidence.latestBlock) - Number(receipt.blockNumber) + 1;
    if (!Number.isSafeInteger(confirmations) || confirmations < 3) throw new Error(`Stage-3 transaction ${index + 1} lacks finality`);
    const position = [Number(receipt.blockNumber), Number(receipt.index ?? receipt.transactionIndex)];
    if (!position.every(Number.isSafeInteger) || position[1] < 0 || (previousPosition && (position[0] < previousPosition[0] || (position[0] === previousPosition[0] && position[1] <= previousPosition[1])))) throw new Error("Stage-3 executions are out of order");
    previousPosition = position;

    let decoded;
    try { decoded = safeInterface.decodeFunctionData("execTransaction", transaction.data); } catch { throw new Error(`Invalid Stage-3 Safe calldata ${index + 1}`); }
    const expected = proposal.safeTransaction;
    const actual = { to: decoded[0], value: decoded[1], data: decoded[2], operation: decoded[3], safeTxGas: decoded[4], baseGas: decoded[5], gasPrice: decoded[6], gasToken: decoded[7], refundReceiver: decoded[8], nonce: BigInt(expected.nonce) };
    if (!sameAddress(actual.to, expected.to) || actual.value !== BigInt(expected.value) || actual.data.toLowerCase() !== expected.data.toLowerCase() || actual.operation !== BigInt(expected.operation) || actual.safeTxGas !== BigInt(expected.safeTxGas) || actual.baseGas !== BigInt(expected.baseGas) || actual.gasPrice !== BigInt(expected.gasPrice) || !sameAddress(actual.gasToken, expected.gasToken) || !sameAddress(actual.refundReceiver, expected.refundReceiver)) throw new Error(`Stage-3 Safe payload ${index + 1} mismatch`);
    const safeTxHash = ethers.TypedDataEncoder.hash({ chainId: 97, verifyingContract: safe }, SAFE_TYPES, actual);
    if (safeTxHash.toLowerCase() !== proposal.safeTxHash.toLowerCase() || !executionSuccess(receipt, safe, safeTxHash)) throw new Error(`Stage-3 Safe success event ${index + 1} mismatch`);
    return { id: proposal.id, action: proposal.action, nonce: expected.nonce, transactionHash: transaction.hash.toLowerCase(), safeTxHash, blockNumber: position[0], transactionIndex: position[1], confirmations };
  });

  const body = {
    schemaVersion: 1,
    recordType: "LQC_INTENT_STAGE3_GOVERNANCE_EXECUTION_VERIFICATION",
    status: "SAFE_EXECUTIONS_VERIFIED_PENDING_FINAL_STATE",
    network: { name: "BSC Testnet", chainId: 97 },
    governanceSafe: safe,
    proposalPlanDigest: plan.proposalPlanDigest,
    startingNonce: plan.startingNonce,
    endingNonce: plan.endingNonce,
    verifiedExecutions,
    transactionOccurred: true,
    safety: "This verifies submitted Safe executions only. Contract bindings and enabled attesters must still pass a separate multi-RPC final-state gate.",
  };
  return { ...body, verificationDigest: canonicalDigest(body) };
}

async function main() {
  const [planFile, executionsFile, outputFile] = process.argv.slice(2);
  if (!outputFile) throw new Error("Usage: node verify-intent-stage3-governance-executions.mjs <proposal-plan.json> <executions.json> <output.json>");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = verifyIntentStage3GovernanceExecutions({ plan: read(planFile), executions: read(executionsFile) });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  console.log(`Wrote ${path.resolve(outputFile)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
