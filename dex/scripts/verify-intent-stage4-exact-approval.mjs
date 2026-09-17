import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const erc20 = new ethers.Interface(["function approve(address,uint256) returns(bool)", "function allowance(address,address) view returns(uint256)"]);
const digestBody = (record, field) => canonicalDigest(Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt")));
const same = (left, right) => ethers.isAddress(left) && ethers.isAddress(right) && left.toLowerCase() === right.toLowerCase();

export async function verifyIntentStage4ExactApproval({ providers, approvalPlan, transactionHash }) {
  if (approvalPlan?.status !== "READY_FOR_SEPARATE_WALLET_REVIEW" || approvalPlan.network?.chainId !== 97 || approvalPlan.transactionOccurred !== false || digestBody(approvalPlan, "approvalPlanDigest") !== approvalPlan.approvalPlanDigest) throw new Error("Invalid Stage-4 approval plan");
  if (!ethers.isHexString(transactionHash, 32) || !Array.isArray(providers) || providers.length < 2) throw new Error("Use one valid approval transaction hash and 2+ BSC testnet RPCs");
  const token = ethers.getAddress(approvalPlan.approval.token), owner = ethers.getAddress(approvalPlan.approval.owner), spender = ethers.getAddress(approvalPlan.approval.spender), amount = BigInt(approvalPlan.approval.amount);
  const heads = await Promise.all(providers.map(async provider => { const network = await provider.getNetwork(); if (Number(network.chainId) !== 97) throw new Error("Stage-4 approval RPC chain mismatch"); return provider.getBlockNumber(); })), finalBlock = Math.min(...heads);
  const observations = await Promise.all(providers.map(async provider => {
    const transaction = await provider.getTransaction(transactionHash), receipt = await provider.getTransactionReceipt(transactionHash);
    if (!transaction || !receipt || receipt.status !== 1 || transaction.hash?.toLowerCase() !== transactionHash.toLowerCase() || receipt.hash?.toLowerCase() !== transactionHash.toLowerCase()) throw new Error("Stage-4 approval transaction missing or failed");
    if (!same(transaction.from, owner) || !same(transaction.to, token) || !same(receipt.from, owner) || !same(receipt.to, token) || BigInt(transaction.value ?? 0) !== 0n || transaction.data?.toLowerCase() !== approvalPlan.transaction.data.toLowerCase()) throw new Error("Stage-4 approval transaction payload mismatch");
    const decoded = erc20.decodeFunctionData("approve", transaction.data); if (!same(decoded[0], spender) || decoded[1] !== amount) throw new Error("Stage-4 approval calldata mismatch");
    if (!Number.isSafeInteger(receipt.blockNumber) || finalBlock - receipt.blockNumber + 1 < 3) throw new Error("Stage-4 approval lacks 3 confirmations");
    const mined = await provider.getBlock(receipt.blockNumber); if (!mined?.hash || mined.hash.toLowerCase() !== receipt.blockHash?.toLowerCase()) throw new Error("Stage-4 approval is not canonical");
    const raw = await provider.call({ to: token, data: erc20.encodeFunctionData("allowance", [owner, spender]) }, finalBlock), allowance = erc20.decodeFunctionResult("allowance", raw)[0];
    if (allowance !== amount) throw new Error("Stage-4 final allowance is not exact");
    return { transactionHash: transactionHash.toLowerCase(), blockNumber: receipt.blockNumber, blockHash: receipt.blockHash.toLowerCase(), finalBlock, confirmations: finalBlock - receipt.blockNumber + 1, allowance: allowance.toString() };
  }));
  const first = observations[0]; for (const observation of observations.slice(1)) if (canonicalDigest(observation) !== canonicalDigest(first)) throw new Error("Stage-4 approval RPC disagreement");
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE4_EXACT_APPROVAL_VERIFICATION", status: "VERIFIED_EXACT_SOURCE_ESCROW_APPROVAL", network: { name: "BSC Testnet", chainId: 97 }, approvalPlanDigest: approvalPlan.approvalPlanDigest, pilotPlanDigest: approvalPlan.pilotPlanDigest, preflightDigest: approvalPlan.preflightDigest, intentHash: approvalPlan.intentHash, transactionHash: first.transactionHash, blockNumber: first.blockNumber, blockHash: first.blockHash, confirmations: first.confirmations, rpcCount: providers.length, approval: { owner, token, spender, amount: amount.toString() }, transactionOccurred: true, safety: "Read-only verification of a separately submitted BSC testnet approval. No signature, wallet request, or transaction is created or sent." };
  return { ...body, approvalVerificationDigest: canonicalDigest(body) };
}

async function main() {
  const urls = String(process.env.BSC_TESTNET_RPC_URLS || "").split(",").map(value => value.trim()).filter(Boolean), [planFile, transactionHash, outputFile] = process.argv.slice(2);
  if (urls.length < 2 || !outputFile) throw new Error("Set 2+ BSC_TESTNET_RPC_URLS and pass <approval-plan.json> <transaction-hash> <output.json>");
  const approvalPlan = JSON.parse(fs.readFileSync(path.resolve(planFile), "utf8"));
  const result = await verifyIntentStage4ExactApproval({ providers: urls.map(url => new ethers.JsonRpcProvider(url, 97, { staticNetwork: true })), approvalPlan, transactionHash });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); console.log(`Wrote ${path.resolve(outputFile)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
