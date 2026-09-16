import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const intentFields = [
  { name: "user", type: "address" }, { name: "sourceChainId", type: "uint256" }, { name: "sourceToken", type: "address" },
  { name: "sourceAmount", type: "uint256" }, { name: "destinationChainId", type: "uint256" }, { name: "destinationToken", type: "address" },
  { name: "recipient", type: "address" }, { name: "minAmountOut", type: "uint256" }, { name: "deadline", type: "uint256" },
  { name: "nonce", type: "uint256" }, { name: "salt", type: "bytes32" },
];
const hub = new ethers.Interface([
  "function submitIntent((address user,uint256 sourceChainId,address sourceToken,uint256 sourceAmount,uint256 destinationChainId,address destinationToken,address recipient,uint256 minAmountOut,uint256 deadline,uint256 nonce,bytes32 salt) intent,bytes signature) returns(bytes32)",
  "function sourceEscrow() view returns(address)", "function quoteManager() view returns(address)", "function solverRegistry() view returns(address)",
  "function internalSolver() view returns(address)", "function paused() view returns(bool)", "function nonceUsed(address,uint256) view returns(bool)",
]);
const dependency = new ethers.Interface(["function paused() view returns(bool)"]);
const token = new ethers.Interface(["function balanceOf(address) view returns(uint256)", "function allowance(address,address) view returns(uint256)"]);
const digestBody = (record, field) => canonicalDigest(Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt")));
const address = value => ethers.getAddress(value);
async function read(provider, iface, target, fn, blockTag, args = []) {
  const raw = await provider.call({ to: target, data: iface.encodeFunctionData(fn, args) }, blockTag);
  return iface.decodeFunctionResult(fn, raw)[0];
}

export async function preflightIntentStage4Submission({ providers, submissionPlan, expectedSubmissionPlanDigest }) {
  if (submissionPlan?.status !== "READY_FOR_FINAL_READ_ONLY_PREFLIGHT" || submissionPlan.network?.chainId !== 97 || submissionPlan.transactionOccurred !== false || digestBody(submissionPlan, "submissionPlanDigest") !== submissionPlan.submissionPlanDigest) throw new Error("Invalid Stage-4 submission plan");
  if (submissionPlan.submissionPlanDigest !== expectedSubmissionPlanDigest) throw new Error("Stage-4 submission plan does not match the independently reviewed digest");
  if (!Array.isArray(providers) || providers.length < 2) throw new Error("Use 2+ BSC testnet RPCs");
  const tx = submissionPlan.transaction;
  if (tx?.chainId !== 97 || BigInt(tx.value) !== 0n) throw new Error("Stage-4 submission transaction must target chain 97 with zero value");
  const target = address(tx.to), sender = address(tx.from);
  let decoded;
  try { decoded = hub.decodeFunctionData("submitIntent", tx.data); } catch { throw new Error("Invalid Stage-4 submitIntent calldata"); }
  const rawIntent = decoded[0], signature = decoded[1];
  const intent = Object.fromEntries(intentFields.map(({ name, type }) => [name, type === "address" ? address(rawIntent[name]) : type === "bytes32" ? rawIntent[name] : rawIntent[name].toString()]));
  if (intent.user !== sender || BigInt(intent.sourceChainId) !== 97n || BigInt(intent.destinationChainId) !== 97n) throw new Error("Stage-4 submission sender or chain binding mismatch");
  const domain = { name: "LQC Intent Hub", version: "1", chainId: 97, verifyingContract: target }, types = { Intent: intentFields };
  const intentHash = ethers.TypedDataEncoder.hash(domain, types, intent), recovered = ethers.verifyTypedData(domain, types, intent, signature);
  if (intentHash !== submissionPlan.intentHash || recovered !== sender || ethers.keccak256(signature) !== submissionPlan.signatureHash) throw new Error("Stage-4 submission signature or Intent hash mismatch");
  const amount = BigInt(intent.sourceAmount), nonce = BigInt(intent.nonce), sourceToken = address(intent.sourceToken), destinationToken = address(intent.destinationToken);
  const heads = await Promise.all(providers.map(async provider => { const network = await provider.getNetwork(); if (Number(network.chainId) !== 97) throw new Error("Stage-4 submission RPC chain mismatch"); return provider.getBlockNumber(); }));
  const blockNumber = Math.min(...heads);
  const results = await Promise.all(providers.map(async provider => {
    const block = await provider.getBlock(blockNumber); if (!block?.hash || !Number.isSafeInteger(Number(block.timestamp))) throw new Error("Stage-4 submission canonical block missing");
    const sourceEscrow = address(await read(provider, hub, target, "sourceEscrow", blockNumber)), quoteManager = address(await read(provider, hub, target, "quoteManager", blockNumber)), solverRegistry = address(await read(provider, hub, target, "solverRegistry", blockNumber)), internalSolver = address(await read(provider, hub, target, "internalSolver", blockNumber));
    const runtimeTargets = { intentHub: target, sourceEscrow, quoteManager, solverRegistry, internalSolver, sourceToken, destinationToken };
    const codes = await Promise.all(Object.values(runtimeTargets).map(contract => provider.getCode(contract, blockNumber)));
    if (codes.some(code => code === "0x")) throw new Error("Stage-4 submission required runtime missing");
    const call = { from: sender, to: target, data: tx.data, value: 0n };
    const simulationRaw = await provider.call(call, blockNumber), simulatedIntentHash = hub.decodeFunctionResult("submitIntent", simulationRaw)[0];
    const gasEstimate = await provider.estimateGas(call, blockNumber);
    const observation = {
      blockNumber, blockHash: block.hash.toLowerCase(), blockTimestamp: Number(block.timestamp), addresses: runtimeTargets,
      runtimeDigests: Object.fromEntries(Object.keys(runtimeTargets).map((name, index) => [name, ethers.sha256(codes[index])])),
      paused: { intentHub: await read(provider, hub, target, "paused", blockNumber), quoteManager: await read(provider, dependency, quoteManager, "paused", blockNumber), solverRegistry: await read(provider, dependency, solverRegistry, "paused", blockNumber) },
      nonceUsed: await read(provider, hub, target, "nonceUsed", blockNumber, [sender, nonce]),
      balance: (await read(provider, token, sourceToken, "balanceOf", blockNumber, [sender])).toString(), allowance: (await read(provider, token, sourceToken, "allowance", blockNumber, [sender, sourceEscrow])).toString(),
      simulatedIntentHash,
    };
    return { observation, gasEstimate: BigInt(gasEstimate) };
  }));
  const first = results[0].observation;
  for (const result of results.slice(1)) if (canonicalDigest(result.observation) !== canonicalDigest(first)) throw new Error("Stage-4 submission preflight RPC disagreement");
  if (first.simulatedIntentHash !== submissionPlan.intentHash) throw new Error("Stage-4 submitIntent simulation hash mismatch");
  if (Object.values(first.paused).some(Boolean)) throw new Error("Stage-4 submission dependency paused");
  if (first.nonceUsed) throw new Error("Stage-4 submission nonce already used");
  if (BigInt(first.balance) < amount) throw new Error("Stage-4 submission source balance insufficient");
  if (BigInt(first.allowance) !== amount) throw new Error("Stage-4 submission requires exact SourceEscrow allowance");
  if (BigInt(intent.deadline) < BigInt(first.blockTimestamp) + 120n) throw new Error("Stage-4 submission deadline window too short");
  const estimates = results.map(result => result.gasEstimate), minimumGas = estimates.reduce((a, b) => a < b ? a : b), maximumGas = estimates.reduce((a, b) => a > b ? a : b);
  if ((maximumGas - minimumGas) * 100n > maximumGas * 5n) throw new Error("Stage-4 submission gas estimate RPC disagreement");
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE4_SUBMISSION_PREFLIGHT", status: "READY_FOR_SEPARATE_WALLET_SUBMISSION", network: { name: "BSC Testnet", chainId: 97 }, submissionPlanDigest: submissionPlan.submissionPlanDigest, signingPacketDigest: submissionPlan.signingPacketDigest, signatureVerificationDigest: submissionPlan.signatureVerificationDigest, pilotPlanDigest: submissionPlan.pilotPlanDigest, intentHash: submissionPlan.intentHash, signatureHash: submissionPlan.signatureHash, blockNumber, blockHash: first.blockHash, blockTimestamp: first.blockTimestamp, rpcCount: providers.length, addresses: first.addresses, runtimeDigests: first.runtimeDigests, balance: first.balance, allowance: first.allowance, gasEstimates: estimates.map(value => value.toString()), transaction: tx, transactionOccurred: false, safety: "Final read-only multi-RPC preflight and eth_call simulation only. No wallet request, signature creation, transaction broadcast, or token movement is performed." };
  return { ...body, submissionPreflightDigest: canonicalDigest(body) };
}

async function main() {
  const urls = String(process.env.BSC_TESTNET_RPC_URLS || "").split(",").map(value => value.trim()).filter(Boolean), [planFile, expectedSubmissionPlanDigest, outputFile] = process.argv.slice(2);
  if (urls.length < 2 || !outputFile) throw new Error("Set 2+ BSC_TESTNET_RPC_URLS and pass <submission-plan.json> <expected-submission-plan-digest> <output.json>");
  const submissionPlan = JSON.parse(fs.readFileSync(path.resolve(planFile), "utf8"));
  const result = await preflightIntentStage4Submission({ providers: urls.map(url => new ethers.JsonRpcProvider(url, 97, { staticNetwork: true })), submissionPlan, expectedSubmissionPlanDigest });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); console.log(`Wrote ${path.resolve(outputFile)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
