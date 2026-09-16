import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const view = new ethers.Interface([
  "function sourceEscrow() view returns(address)", "function quoteManager() view returns(address)", "function solverRegistry() view returns(address)",
  "function internalSolver() view returns(address)", "function paused() view returns(bool)", "function nonceUsed(address,uint256) view returns(bool)",
  "function balanceOf(address) view returns(uint256)", "function allowance(address,address) view returns(uint256)",
]);
const digestBody = (record, field) => canonicalDigest(Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt")));
const address = value => ethers.getAddress(value);
async function read(provider, target, fn, blockTag, args = []) { const raw = await provider.call({ to: target, data: view.encodeFunctionData(fn, args) }, blockTag); return view.decodeFunctionResult(fn, raw)[0]; }

export async function preflightIntentStage4Pilot({ providers, pilotPlan, pilotVerification }) {
  if (pilotPlan?.status !== "READY_FOR_OFFLINE_REVIEW_ONLY" || pilotPlan.network?.chainId !== 97 || digestBody(pilotPlan, "pilotPlanDigest") !== pilotPlan.pilotPlanDigest) throw new Error("Invalid Stage-4 pilot plan");
  if (pilotVerification?.status !== "VERIFIED_STAGE4_PILOT_PLAN" || pilotVerification.network?.chainId !== 97 || pilotVerification.transactionOccurred !== false || digestBody(pilotVerification, "pilotVerificationDigest") !== pilotVerification.pilotVerificationDigest || pilotVerification.pilotPlanDigest !== pilotPlan.pilotPlanDigest || pilotVerification.intentHash !== pilotPlan.intentHash || pilotVerification.routeHash !== pilotPlan.routeHash) throw new Error("Invalid Stage-4 pilot verification");
  if (!Array.isArray(providers) || providers.length < 2) throw new Error("Use 2+ BSC testnet RPCs");
  const hub = address(pilotPlan.intentHub), user = address(pilotPlan.intent.user), tokenIn = address(pilotPlan.intent.sourceToken), tokenOut = address(pilotPlan.intent.destinationToken), amountIn = BigInt(pilotPlan.intent.sourceAmount), nonce = BigInt(pilotPlan.intent.nonce);
  const heads = await Promise.all(providers.map(async provider => { const network = await provider.getNetwork(); if (Number(network.chainId) !== 97) throw new Error("Stage-4 preflight RPC chain mismatch"); return provider.getBlockNumber(); }));
  const blockNumber = Math.min(...heads);
  const observations = await Promise.all(providers.map(async provider => {
    const block = await provider.getBlock(blockNumber); if (!block?.hash || !Number.isSafeInteger(Number(block.timestamp))) throw new Error("Stage-4 canonical block missing");
    const sourceEscrow = address(await read(provider, hub, "sourceEscrow", blockNumber)), quoteManager = address(await read(provider, hub, "quoteManager", blockNumber)), solverRegistry = address(await read(provider, hub, "solverRegistry", blockNumber)), internalSolver = address(await read(provider, hub, "internalSolver", blockNumber));
    const targets = [hub, sourceEscrow, quoteManager, solverRegistry, internalSolver, tokenIn, tokenOut], codes = await Promise.all(targets.map(target => provider.getCode(target, blockNumber)));
    if (codes.some(code => code === "0x")) throw new Error("Stage-4 required runtime missing");
    return { blockNumber, blockHash: block.hash.toLowerCase(), blockTimestamp: Number(block.timestamp), addresses: { sourceEscrow, quoteManager, solverRegistry, internalSolver }, runtimeDigests: codes.map(code => ethers.sha256(code)), paused: { hub: await read(provider, hub, "paused", blockNumber), quoteManager: await read(provider, quoteManager, "paused", blockNumber), solverRegistry: await read(provider, solverRegistry, "paused", blockNumber) }, nonceUsed: await read(provider, hub, "nonceUsed", blockNumber, [user, nonce]), balance: (await read(provider, tokenIn, "balanceOf", blockNumber, [user])).toString(), allowance: (await read(provider, tokenIn, "allowance", blockNumber, [user, sourceEscrow])).toString() };
  }));
  const first = observations[0]; for (const observation of observations.slice(1)) if (canonicalDigest(observation) !== canonicalDigest(first)) throw new Error("Stage-4 preflight RPC disagreement");
  if (Object.values(first.paused).some(Boolean)) throw new Error("Stage-4 pilot dependency paused");
  if (first.nonceUsed) throw new Error("Stage-4 pilot nonce already used");
  if (BigInt(first.balance) < amountIn) throw new Error("Stage-4 pilot source balance insufficient");
  const allowance = BigInt(first.allowance); if (allowance !== 0n && allowance !== amountIn) throw new Error("Stage-4 pilot requires zero or exact SourceEscrow allowance");
  if (BigInt(pilotPlan.intent.deadline) < BigInt(first.blockTimestamp) + 120n) throw new Error("Stage-4 pilot signing window too short");
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE4_PREFLIGHT", status: allowance === amountIn ? "READY_FOR_INTENT_SIGNATURE" : "READY_FOR_EXACT_APPROVAL", network: { name: "BSC Testnet", chainId: 97 }, pilotPlanDigest: pilotPlan.pilotPlanDigest, pilotVerificationDigest: pilotVerification.pilotVerificationDigest, intentHash: pilotPlan.intentHash, routeHash: pilotPlan.routeHash, blockNumber, blockHash: first.blockHash, blockTimestamp: first.blockTimestamp, rpcCount: providers.length, addresses: { intentHub: hub, ...first.addresses, sourceToken: tokenIn, destinationToken: tokenOut, user }, runtimeDigests: first.runtimeDigests, balance: first.balance, allowance: first.allowance, exactApprovalRequired: allowance === 0n, transactionOccurred: false, safety: "Read-only preflight. No approval, signature, Solver quote, wallet request, or transaction is created or sent." };
  return { ...body, preflightDigest: canonicalDigest(body) };
}

async function main() {
  const urls = String(process.env.BSC_TESTNET_RPC_URLS || "").split(",").map(value => value.trim()).filter(Boolean), [pilotFile, verificationFile, outputFile] = process.argv.slice(2);
  if (urls.length < 2 || !outputFile) throw new Error("Set 2+ BSC_TESTNET_RPC_URLS and pass <pilot-plan.json> <pilot-verification.json> <output.json>");
  const readJson = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = await preflightIntentStage4Pilot({ providers: urls.map(url => new ethers.JsonRpcProvider(url, 97, { staticNetwork: true })), pilotPlan: readJson(pilotFile), pilotVerification: readJson(verificationFile) });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); console.log(`Wrote ${path.resolve(outputFile)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
