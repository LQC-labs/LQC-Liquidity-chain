import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const view = new ethers.Interface([
  "function nonce() view returns(uint256)", "function quoteManager() view returns(address)", "function solverRegistry() view returns(address)",
  "function internalSolver() view returns(address)", "function pendingInternalSolver() view returns(address)", "function exposureManager() view returns(address)",
  "function executionVerifier() view returns(address)", "function resolver() view returns(address)", "function slashRecipient() view returns(address)",
  "function attesterEnabled(address) view returns(bool)", "function paused() view returns(bool)",
]);

const digestBody = (record, field) => canonicalDigest(Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt")));
const same = (left, right) => ethers.isAddress(left) && ethers.isAddress(right) && left.toLowerCase() === right.toLowerCase();
async function read(provider, target, fn, blockTag, args = []) { const data = view.encodeFunctionData(fn, args), result = await provider.call({ to: target, data }, blockTag); return view.decodeFunctionResult(fn, result)[0]; }

export async function verifyIntentStage3FinalState({ providers, verification, plan, manifest }) {
  if (verification?.status !== "SAFE_EXECUTIONS_VERIFIED_PENDING_FINAL_STATE" || verification.network?.chainId !== 97 || verification.transactionOccurred !== true || digestBody(verification, "verificationDigest") !== verification.verificationDigest) throw new Error("Invalid Stage-3 execution verification");
  if (plan?.status !== "READY_FOR_SEPARATE_EXPLICIT_4_OF_7_APPROVAL" || digestBody(plan, "proposalPlanDigest") !== plan.proposalPlanDigest || verification.proposalPlanDigest !== plan.proposalPlanDigest) throw new Error("Invalid Stage-3 proposal binding");
  if (manifest?.stage !== "stage3-governance-bindings" || manifest.network?.chainId !== 97 || !Array.isArray(manifest.attesters) || manifest.attesters.length < Number(manifest.policy?.attesterQuorum || 0)) throw new Error("Invalid Stage-3 manifest");
  if (!Array.isArray(providers) || providers.length < 2) throw new Error("Use 2+ BSC testnet RPCs");
  const a = Object.fromEntries(Object.entries(manifest.addresses).map(([key, value]) => [key, ethers.getAddress(value)])), roles = manifest.roles;
  const targets = [plan.governanceSafe, a.LQCIntentHub, a.LQCQuoteManager, a.LQCSolverRegistry, a.LQCExecutionVerifier, a.LQCInternalSolver];
  const heads = await Promise.all(providers.map(async provider => { const network = await provider.getNetwork(); if (Number(network.chainId) !== 97) throw new Error("Stage-3 final-state RPC chain mismatch"); return provider.getBlockNumber(); }));
  const blockNumber = Math.min(...heads);
  const observations = await Promise.all(providers.map(async provider => {
    const block = await provider.getBlock(blockNumber); if (!block?.hash) throw new Error("Stage-3 final-state block missing");
    const codes = await Promise.all(targets.map(target => provider.getCode(target, blockNumber))); if (codes.some(code => code === "0x")) throw new Error("Stage-3 final-state runtime missing");
    return {
      blockNumber, blockHash: block.hash.toLowerCase(), runtimeDigests: codes.map(code => ethers.sha256(code)),
      safeNonce: (await read(provider, plan.governanceSafe, "nonce", blockNumber)).toString(),
      hub: { quoteManager: await read(provider, a.LQCIntentHub, "quoteManager", blockNumber), solverRegistry: await read(provider, a.LQCIntentHub, "solverRegistry", blockNumber), internalSolver: await read(provider, a.LQCIntentHub, "internalSolver", blockNumber), pendingInternalSolver: await read(provider, a.LQCIntentHub, "pendingInternalSolver", blockNumber), paused: await read(provider, a.LQCIntentHub, "paused", blockNumber) },
      quote: { solverRegistry: await read(provider, a.LQCQuoteManager, "solverRegistry", blockNumber), paused: await read(provider, a.LQCQuoteManager, "paused", blockNumber) },
      registry: { exposureManager: await read(provider, a.LQCSolverRegistry, "exposureManager", blockNumber), executionVerifier: await read(provider, a.LQCSolverRegistry, "executionVerifier", blockNumber), resolver: await read(provider, a.LQCSolverRegistry, "resolver", blockNumber), slashRecipient: await read(provider, a.LQCSolverRegistry, "slashRecipient", blockNumber), paused: await read(provider, a.LQCSolverRegistry, "paused", blockNumber) },
      verifier: { paused: await read(provider, a.LQCExecutionVerifier, "paused", blockNumber), attesters: await Promise.all(manifest.attesters.map(attester => read(provider, a.LQCExecutionVerifier, "attesterEnabled", blockNumber, [attester]))) },
    };
  }));
  const first = observations[0]; for (const observation of observations.slice(1)) if (canonicalDigest(observation) !== canonicalDigest(first)) throw new Error("Stage-3 final-state RPC disagreement");
  const expectedNonce = (BigInt(plan.endingNonce) + 1n).toString();
  if (first.safeNonce !== expectedNonce) throw new Error("Stage-3 final Safe nonce mismatch");
  if (!same(first.hub.quoteManager, a.LQCQuoteManager) || !same(first.hub.solverRegistry, a.LQCSolverRegistry) || !same(first.hub.internalSolver, a.LQCInternalSolver) || !same(first.hub.pendingInternalSolver, ethers.ZeroAddress)) throw new Error("Stage-3 Hub final binding mismatch");
  if (!same(first.quote.solverRegistry, a.LQCSolverRegistry) || !same(first.registry.exposureManager, a.LQCIntentHub) || !same(first.registry.executionVerifier, a.LQCExecutionVerifier) || !same(first.registry.resolver, roles.riskSafe) || !same(first.registry.slashRecipient, roles.treasurySafe)) throw new Error("Stage-3 Registry final binding mismatch");
  if ([first.hub.paused, first.quote.paused, first.registry.paused, first.verifier.paused].some(Boolean) || first.verifier.attesters.some(enabled => enabled !== true)) throw new Error("Stage-3 activation final state mismatch");
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE3_FINAL_STATE", status: "VERIFIED_STAGE3_GOVERNANCE_BINDINGS", network: { name: "BSC Testnet", chainId: 97 }, proposalPlanDigest: plan.proposalPlanDigest, executionVerificationDigest: verification.verificationDigest, blockNumber, blockHash: first.blockHash, rpcCount: providers.length, safeNonce: first.safeNonce, addresses: a, attesters: manifest.attesters.map(ethers.getAddress), runtimeDigests: first.runtimeDigests, transactionOccurred: true, safety: "Governance bindings are verified. This does not authorize cross-chain settlement, permissionless Solvers, or mainnet activation." };
  return { ...body, finalStateDigest: canonicalDigest(body) };
}

async function main() {
  const urls = String(process.env.BSC_TESTNET_RPC_URLS || "").split(",").map(value => value.trim()).filter(Boolean), [verificationFile, planFile, manifestFile, outputFile] = process.argv.slice(2);
  if (urls.length < 2 || !outputFile) throw new Error("Set 2+ BSC_TESTNET_RPC_URLS and pass <verification.json> <plan.json> <manifest.json> <output.json>");
  const load = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = await verifyIntentStage3FinalState({ providers: urls.map(url => new ethers.JsonRpcProvider(url, 97, { staticNetwork: true })), verification: load(verificationFile), plan: load(planFile), manifest: load(manifestFile) });
  fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" }); console.log(`Wrote ${path.resolve(outputFile)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
