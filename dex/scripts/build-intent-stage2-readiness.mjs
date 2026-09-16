import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

const view = new ethers.Interface([
  "function owner() view returns(address)", "function settler() view returns(address)", "function guardian() view returns(address)", "function sourceEscrow() view returns(address)",
  "function controller() view returns(address)", "function bondToken() view returns(address)", "function minimumBond() view returns(uint256)", "function challengeBond() view returns(uint256)",
  "function resolver() view returns(address)", "function slashRecipient() view returns(address)", "function quorum() view returns(uint256)", "function maxGasOverrunBps() view returns(uint256)",
  "function maxPriceImpactBps() view returns(uint256)", "function maxMarketDeviationBps() view returns(uint256)", "function paused() view returns(bool)",
  "function solverRegistry() view returns(address)", "function quoteManager() view returns(address)", "function internalSolver() view returns(address)", "function exposureManager() view returns(address)",
  "function executionVerifier() view returns(address)"
]);

async function read(provider, address, functionName, blockTag) {
  const data = view.encodeFunctionData(functionName);
  const result = await provider.call({ to: address, data }, blockTag);
  return view.decodeFunctionResult(functionName, result)[0];
}
const address = value => ethers.getAddress(value);
const text = value => typeof value === "bigint" ? value.toString() : value;

function validateEvidence(review, deployment) {
  if (review?.status !== "REVIEW_REQUIRED" || review.network?.chainId !== 97 || !review.reviewDigest) throw new Error("Invalid Stage-1 review");
  const { reviewDigest, ...body } = review;
  if (canonicalDigest(body) !== reviewDigest) throw new Error("Stage-1 review digest mismatch");
  if (deployment?.status !== "VERIFIED_STAGE1_DEPLOYMENT" || deployment.network?.chainId !== 97 || deployment.reviewDigest !== reviewDigest || deployment.sealDigest !== review.sealDigest || deployment.deployments?.length !== 4) throw new Error("Invalid Stage-1 deployment verification");
  const { verificationDigest, ...deploymentBody } = deployment;
  if (canonicalDigest(deploymentBody) !== verificationDigest) throw new Error("Stage-1 deployment verification digest mismatch");
  const expected = ["deploy-intent-hub", "deploy-quote-manager", "deploy-solver-registry", "deploy-execution-verifier"];
  if (deployment.deployments.some((item, index) => item.action !== expected[index] || !ethers.isAddress(item.contractAddress))) throw new Error("Stage-1 deployment order mismatch");
}

export async function buildIntentStage2Readiness({ providers, review, deployment }) {
  validateEvidence(review, deployment);
  if (!Array.isArray(providers) || providers.length < 2) throw new Error("Use 2+ BSC testnet RPCs");
  const [hub, quoteManager, solverRegistry, executionVerifier] = deployment.deployments.map(item => address(item.contractAddress));
  const heads = await Promise.all(providers.map(async provider => { const network = await provider.getNetwork(); if (Number(network.chainId) !== 97) throw new Error("Stage-2 readiness RPC chain mismatch"); return provider.getBlockNumber(); }));
  const blockNumber = Math.min(...heads);
  const observations = await Promise.all(providers.map(async provider => {
    const block = await provider.getBlock(blockNumber); if (!block?.hash) throw new Error("Stage-2 readiness canonical block missing");
    const codes = await Promise.all([hub, quoteManager, solverRegistry, executionVerifier].map(item => provider.getCode(item, blockNumber)));
    if (codes.some(code => code === "0x")) throw new Error("Stage-1 runtime missing");
    const hubState = { owner: address(await read(provider, hub, "owner", blockNumber)), settler: address(await read(provider, hub, "settler", blockNumber)), guardian: address(await read(provider, hub, "guardian", blockNumber)), sourceEscrow: address(await read(provider, hub, "sourceEscrow", blockNumber)), quoteManager: address(await read(provider, hub, "quoteManager", blockNumber)), solverRegistry: address(await read(provider, hub, "solverRegistry", blockNumber)), internalSolver: address(await read(provider, hub, "internalSolver", blockNumber)), paused: await read(provider, hub, "paused", blockNumber) };
    const escrowCode = await provider.getCode(hubState.sourceEscrow, blockNumber); if (escrowCode === "0x") throw new Error("SourceEscrow runtime missing");
    const quoteState = { owner: address(await read(provider, quoteManager, "owner", blockNumber)), guardian: address(await read(provider, quoteManager, "guardian", blockNumber)), solverRegistry: address(await read(provider, quoteManager, "solverRegistry", blockNumber)), paused: await read(provider, quoteManager, "paused", blockNumber) };
    const registryState = { owner: address(await read(provider, solverRegistry, "owner", blockNumber)), guardian: address(await read(provider, solverRegistry, "guardian", blockNumber)), bondToken: address(await read(provider, solverRegistry, "bondToken", blockNumber)), minimumBond: text(await read(provider, solverRegistry, "minimumBond", blockNumber)), challengeBond: text(await read(provider, solverRegistry, "challengeBond", blockNumber)), resolver: address(await read(provider, solverRegistry, "resolver", blockNumber)), slashRecipient: address(await read(provider, solverRegistry, "slashRecipient", blockNumber)), exposureManager: address(await read(provider, solverRegistry, "exposureManager", blockNumber)), executionVerifier: address(await read(provider, solverRegistry, "executionVerifier", blockNumber)), paused: await read(provider, solverRegistry, "paused", blockNumber) };
    const verifierState = { owner: address(await read(provider, executionVerifier, "owner", blockNumber)), guardian: address(await read(provider, executionVerifier, "guardian", blockNumber)), quorum: text(await read(provider, executionVerifier, "quorum", blockNumber)), maxGasOverrunBps: text(await read(provider, executionVerifier, "maxGasOverrunBps", blockNumber)), maxPriceImpactBps: text(await read(provider, executionVerifier, "maxPriceImpactBps", blockNumber)), maxMarketDeviationBps: text(await read(provider, executionVerifier, "maxMarketDeviationBps", blockNumber)), paused: await read(provider, executionVerifier, "paused", blockNumber) };
    const escrowController = address(await read(provider, hubState.sourceEscrow, "controller", blockNumber));
    return { blockNumber, blockHash: block.hash.toLowerCase(), runtimeDigests: codes.map(code => ethers.sha256(code)), sourceEscrowRuntimeDigest: ethers.sha256(escrowCode), escrowController, hub: hubState, quoteManager: quoteState, solverRegistry: registryState, executionVerifier: verifierState };
  }));
  const first = observations[0]; for (const item of observations.slice(1)) if (canonicalDigest(item) !== canonicalDigest(first)) throw new Error("Stage-2 readiness RPC disagreement");
  const zero = ethers.ZeroAddress.toLowerCase(), same = (a, b) => a.toLowerCase() === b.toLowerCase(), roles = review.roles, policy = review.policy;
  if (!roles || !policy || !same(first.hub.owner, roles.governanceSafe) || !same(first.hub.settler, roles.riskSafe) || !same(first.hub.guardian, roles.guardianSafe) || !same(first.quoteManager.owner, roles.governanceSafe) || !same(first.quoteManager.guardian, roles.guardianSafe) || !same(first.solverRegistry.owner, roles.governanceSafe) || !same(first.solverRegistry.guardian, roles.guardianSafe) || !same(first.executionVerifier.owner, roles.governanceSafe) || !same(first.executionVerifier.guardian, roles.guardianSafe)) throw new Error("Stage-1 role binding mismatch");
  if (!same(first.escrowController, hub) || !same(first.solverRegistry.bondToken, review.bondToken) || first.solverRegistry.minimumBond !== String(policy.minimumBond) || first.solverRegistry.challengeBond !== (BigInt(policy.minimumBond) / 100n).toString() || first.executionVerifier.quorum !== String(policy.attesterQuorum) || first.executionVerifier.maxGasOverrunBps !== String(policy.maxGasOverrunBps) || first.executionVerifier.maxPriceImpactBps !== String(policy.maxPriceImpactBps) || first.executionVerifier.maxMarketDeviationBps !== String(policy.maxMarketDeviationBps)) throw new Error("Stage-1 policy binding mismatch");
  if ([first.hub.quoteManager, first.hub.solverRegistry, first.hub.internalSolver, first.quoteManager.solverRegistry, first.solverRegistry.exposureManager, first.solverRegistry.executionVerifier].some(value => value.toLowerCase() !== zero) || !same(first.solverRegistry.resolver, roles.governanceSafe) || !same(first.solverRegistry.slashRecipient, roles.governanceSafe) || first.hub.paused || first.quoteManager.paused || first.solverRegistry.paused || first.executionVerifier.paused) throw new Error("Stage-1 contracts are not in pristine pre-binding state");
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE2_READINESS", status: "READY_FOR_INTERNAL_SOLVER_DEPLOYMENT_REVIEW", network: { name: "BSC Testnet", chainId: 97 }, reviewDigest: review.reviewDigest, deploymentVerificationDigest: deployment.verificationDigest, blockNumber, blockHash: first.blockHash, rpcCount: providers.length, addresses: { LQCIntentHub: hub, LQCQuoteManager: quoteManager, LQCSolverRegistry: solverRegistry, LQCExecutionVerifier: executionVerifier, LQCSourceEscrow: first.hub.sourceEscrow }, runtimeDigests: first.runtimeDigests, sourceEscrowRuntimeDigest: first.sourceEscrowRuntimeDigest, roles, bondToken: review.bondToken, policy, transactionOccurred: false, safety: "Read-only Stage-2 gate. No deployment, signature, approval, binding, Solver activation, token movement, or transaction is performed." };
  return { ...body, readinessDigest: canonicalDigest(body) };
}

async function main() {
  const urls = String(process.env.BSC_TESTNET_RPC_URLS || "").split(",").map(value => value.trim()).filter(Boolean), reviewFile = process.env.INTENT_STAGE1_REVIEW_FILE, deploymentFile = process.env.INTENT_STAGE1_DEPLOYMENT_VERIFICATION_FILE;
  if (urls.length < 2 || !reviewFile || !deploymentFile) throw new Error("Set 2+ BSC_TESTNET_RPC_URLS, INTENT_STAGE1_REVIEW_FILE and INTENT_STAGE1_DEPLOYMENT_VERIFICATION_FILE");
  const readJson = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = await buildIntentStage2Readiness({ providers: urls.map(url => new ethers.JsonRpcProvider(url, 97, { staticNetwork: true })), review: readJson(reviewFile), deployment: readJson(deploymentFile) });
  const output = path.resolve(import.meta.dirname, "../deployments/intent-stage2-readiness-bsc-testnet-97.json"); fs.writeFileSync(output, `${JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2)}\n`); console.log(`Wrote ${output}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
