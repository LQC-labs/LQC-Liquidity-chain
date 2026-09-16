import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const hub = new ethers.Interface([
  "function submitIntent((address user,uint256 sourceChainId,address sourceToken,uint256 sourceAmount,uint256 destinationChainId,address destinationToken,address recipient,uint256 minAmountOut,uint256 deadline,uint256 nonce,bytes32 salt) intent,bytes signature) returns(bytes32)",
  "function getIntent(bytes32) view returns((address user,address sourceToken,uint256 sourceAmount,uint256 destinationChainId,address destinationToken,address recipient,uint256 minAmountOut,uint256 deadline,uint8 status,address solver,uint256 actualAmountOut,bytes32 destinationTxHash,bytes32 executionHash,bytes32 quoteHash,bytes32 routeHash))",
  "function nonceUsed(address,uint256) view returns(bool)", "function sourceEscrow() view returns(address)",
  "event IntentSubmitted(bytes32 indexed intentHash,address indexed user,uint256 indexed nonce,uint256 deadline)",
]);
const escrow = new ethers.Interface([
  "function getDeposit(bytes32) view returns((address user,address token,uint256 amount,bool active))",
  "event SourceLocked(bytes32 indexed intentHash,address indexed user,address indexed token,uint256 amount)",
]);
const digestBody = (record, field) => canonicalDigest(Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt")));
const same = (left, right) => ethers.isAddress(left) && ethers.isAddress(right) && left.toLowerCase() === right.toLowerCase();
const sameTransaction = (left, right) => canonicalDigest(left) === canonicalDigest(right);
async function read(provider, iface, target, fn, args, blockTag) {
  const raw = await provider.call({ to: target, data: iface.encodeFunctionData(fn, args) }, blockTag);
  return iface.decodeFunctionResult(fn, raw)[0];
}

export async function verifyIntentStage4Submission({ providers, submissionPlan, submissionPreflight, expectedSubmissionPreflightDigest, transactionHash }) {
  if (submissionPlan?.status !== "READY_FOR_FINAL_READ_ONLY_PREFLIGHT" || submissionPlan.network?.chainId !== 97 || submissionPlan.transactionOccurred !== false || digestBody(submissionPlan, "submissionPlanDigest") !== submissionPlan.submissionPlanDigest) throw new Error("Invalid Stage-4 submission plan");
  if (submissionPreflight?.status !== "READY_FOR_SEPARATE_WALLET_SUBMISSION" || submissionPreflight.network?.chainId !== 97 || submissionPreflight.transactionOccurred !== false || digestBody(submissionPreflight, "submissionPreflightDigest") !== submissionPreflight.submissionPreflightDigest) throw new Error("Invalid Stage-4 submission preflight");
  if (submissionPreflight.submissionPreflightDigest !== expectedSubmissionPreflightDigest) throw new Error("Stage-4 submission preflight does not match the independently reviewed digest");
  if (submissionPreflight.submissionPlanDigest !== submissionPlan.submissionPlanDigest || submissionPreflight.intentHash !== submissionPlan.intentHash || submissionPreflight.signatureHash !== submissionPlan.signatureHash || !sameTransaction(submissionPreflight.transaction, submissionPlan.transaction)) throw new Error("Stage-4 submission evidence binding mismatch");
  if (!ethers.isHexString(transactionHash, 32) || !Array.isArray(providers) || providers.length < 2) throw new Error("Use one valid submission transaction hash and 2+ BSC testnet RPCs");
  const expected = submissionPlan.transaction, intentHash = submissionPlan.intentHash, sender = ethers.getAddress(expected.from), target = ethers.getAddress(expected.to);
  const decoded = hub.decodeFunctionData("submitIntent", expected.data), intent = decoded[0], sourceToken = ethers.getAddress(intent.sourceToken), amount = BigInt(intent.sourceAmount), nonce = BigInt(intent.nonce);
  const heads = await Promise.all(providers.map(async provider => { const network = await provider.getNetwork(); if (Number(network.chainId) !== 97) throw new Error("Stage-4 submission RPC chain mismatch"); return provider.getBlockNumber(); })), finalBlock = Math.min(...heads);
  const observations = await Promise.all(providers.map(async provider => {
    const transaction = await provider.getTransaction(transactionHash), receipt = await provider.getTransactionReceipt(transactionHash);
    if (!transaction || !receipt || receipt.status !== 1 || transaction.hash?.toLowerCase() !== transactionHash.toLowerCase() || receipt.hash?.toLowerCase() !== transactionHash.toLowerCase()) throw new Error("Stage-4 submission transaction missing or failed");
    if (!same(transaction.from, sender) || !same(transaction.to, target) || !same(receipt.from, sender) || !same(receipt.to, target) || BigInt(transaction.value ?? 0) !== 0n || transaction.data?.toLowerCase() !== expected.data.toLowerCase()) throw new Error("Stage-4 submission transaction payload mismatch");
    if (!Number.isSafeInteger(receipt.blockNumber) || finalBlock - receipt.blockNumber + 1 < 3) throw new Error("Stage-4 submission lacks 3 confirmations");
    const mined = await provider.getBlock(receipt.blockNumber); if (!mined?.hash || mined.hash.toLowerCase() !== receipt.blockHash?.toLowerCase()) throw new Error("Stage-4 submission is not canonical");
    const sourceEscrow = ethers.getAddress(await read(provider, hub, target, "sourceEscrow", [], finalBlock));
    const intentRecord = await read(provider, hub, target, "getIntent", [intentHash], finalBlock), deposit = await read(provider, escrow, sourceEscrow, "getDeposit", [intentHash], finalBlock), used = await read(provider, hub, target, "nonceUsed", [sender, nonce], finalBlock);
    if (!same(intentRecord.user, sender) || !same(intentRecord.sourceToken, sourceToken) || intentRecord.sourceAmount !== amount || intentRecord.destinationChainId !== BigInt(intent.destinationChainId) || !same(intentRecord.destinationToken, intent.destinationToken) || !same(intentRecord.recipient, intent.recipient) || intentRecord.minAmountOut !== BigInt(intent.minAmountOut) || intentRecord.deadline !== BigInt(intent.deadline) || intentRecord.status !== 1n) throw new Error("Stage-4 final Intent record mismatch");
    if (!used || !same(deposit.user, sender) || !same(deposit.token, sourceToken) || deposit.amount !== amount || deposit.active !== true) throw new Error("Stage-4 final nonce or escrow deposit mismatch");
    const submittedLogs = [], lockedLogs = [];
    for (const log of receipt.logs ?? []) {
      try { const parsed = hub.parseLog(log); if (same(log.address, target) && parsed?.name === "IntentSubmitted") submittedLogs.push(parsed.args); } catch {}
      try { const parsed = escrow.parseLog(log); if (same(log.address, sourceEscrow) && parsed?.name === "SourceLocked") lockedLogs.push(parsed.args); } catch {}
    }
    if (submittedLogs.length !== 1 || submittedLogs[0].intentHash !== intentHash || !same(submittedLogs[0].user, sender) || submittedLogs[0].nonce !== nonce || submittedLogs[0].deadline !== BigInt(intent.deadline)) throw new Error("Stage-4 IntentSubmitted event mismatch");
    if (lockedLogs.length !== 1 || lockedLogs[0].intentHash !== intentHash || !same(lockedLogs[0].user, sender) || !same(lockedLogs[0].token, sourceToken) || lockedLogs[0].amount !== amount) throw new Error("Stage-4 SourceLocked event mismatch");
    return { transactionHash: transactionHash.toLowerCase(), blockNumber: receipt.blockNumber, blockHash: receipt.blockHash.toLowerCase(), finalBlock, confirmations: finalBlock - receipt.blockNumber + 1, sourceEscrow, intentStatus: "OPEN", nonceUsed: true, deposit: { user: sender, token: sourceToken, amount: amount.toString(), active: true } };
  }));
  const first = observations[0]; for (const observation of observations.slice(1)) if (canonicalDigest(observation) !== canonicalDigest(first)) throw new Error("Stage-4 submission RPC disagreement");
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE4_SUBMISSION_VERIFICATION", status: "VERIFIED_STAGE4_INTENT_SUBMISSION", network: { name: "BSC Testnet", chainId: 97 }, submissionPlanDigest: submissionPlan.submissionPlanDigest, submissionPreflightDigest: submissionPreflight.submissionPreflightDigest, signingPacketDigest: submissionPlan.signingPacketDigest, signatureVerificationDigest: submissionPlan.signatureVerificationDigest, pilotPlanDigest: submissionPlan.pilotPlanDigest, intentHash, signatureHash: submissionPlan.signatureHash, transactionHash: first.transactionHash, blockNumber: first.blockNumber, blockHash: first.blockHash, confirmations: first.confirmations, rpcCount: providers.length, sourceEscrow: first.sourceEscrow, intentStatus: first.intentStatus, deposit: first.deposit, transactionOccurred: true, safety: "Read-only verification of a separately submitted BSC testnet Intent. No signature, wallet request, transaction broadcast, settlement, or token movement is initiated." };
  return { ...body, submissionVerificationDigest: canonicalDigest(body) };
}

async function main() {
  const urls = String(process.env.BSC_TESTNET_RPC_URLS || "").split(",").map(value => value.trim()).filter(Boolean), [planFile, preflightFile, expectedSubmissionPreflightDigest, transactionHash, outputFile] = process.argv.slice(2);
  if (urls.length < 2 || !outputFile) throw new Error("Set 2+ BSC_TESTNET_RPC_URLS and pass <submission-plan.json> <submission-preflight.json> <expected-preflight-digest> <transaction-hash> <output.json>");
  const readJson = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = await verifyIntentStage4Submission({ providers: urls.map(url => new ethers.JsonRpcProvider(url, 97, { staticNetwork: true })), submissionPlan: readJson(planFile), submissionPreflight: readJson(preflightFile), expectedSubmissionPreflightDigest, transactionHash });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); console.log(`Wrote ${path.resolve(outputFile)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
