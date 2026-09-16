import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";

const solverView = new ethers.Interface(["function intentHub() view returns(address)", "function executionRouter() view returns(address)", "function administrator() view returns(address)"]);
const digestBody = (record, field) => canonicalDigest(Object.fromEntries(Object.entries(record).filter(([key]) => key !== field && key !== "checkedAt")));

function validateInputs({ review, manifest, preflight, transactionHash }) {
  if (review?.status !== "REVIEW_REQUIRED" || review.packageType !== "LQC_INTENT_STAGE2_INTERNAL_SOLVER_REVIEW" || review.network?.chainId !== 97 || review.transactionOccurred !== false || digestBody(review, "reviewDigest") !== review.reviewDigest) throw new Error("Invalid Stage-2 review");
  if (manifest?.stage !== "stage2-solver-deploy" || manifest.network?.chainId !== 97 || manifest.orderedActions?.length !== 1) throw new Error("Invalid Stage-2 manifest");
  if (preflight?.status !== "PREFLIGHT_VERIFIED_FOR_INTERNAL_SOLVER_REVIEW" || preflight.network?.chainId !== 97 || preflight.transactionOccurred !== false || preflight.reviewDigest !== review.reviewDigest || preflight.readinessDigest !== review.readinessDigest || digestBody(preflight, "preflightDigest") !== preflight.preflightDigest) throw new Error("Invalid Stage-2 preflight");
  if (!ethers.isAddress(preflight.deployer) || !ethers.isHexString(transactionHash, 32)) throw new Error("Invalid Stage-2 deployment context");
  const action = manifest.orderedActions[0];
  if (preflight.deployment?.action !== action.action || preflight.deployment?.initCodeDigest !== sha256(action.data) || ethers.getCreateAddress({ from: preflight.deployer, nonce: BigInt(preflight.deployerNonce) }).toLowerCase() !== preflight.deployment.predictedAddress.toLowerCase()) throw new Error("Stage-2 preflight manifest mismatch");
  if (review.dependencies?.intentHub?.toLowerCase() !== manifest.addresses?.LQCIntentHub?.toLowerCase() || review.dependencies?.executionRouter?.toLowerCase() !== manifest.dependencies?.executionRouter?.toLowerCase() || review.dependencies?.governanceSafe?.toLowerCase() !== manifest.roles?.governanceSafe?.toLowerCase()) throw new Error("Stage-2 dependency binding mismatch");
}

async function readAddress(provider, contract, functionName, blockTag) {
  const result = await provider.call({ to: contract, data: solverView.encodeFunctionData(functionName) }, blockTag);
  return ethers.getAddress(solverView.decodeFunctionResult(functionName, result)[0]);
}

export async function verifyIntentStage2DeploymentAcrossRpcs({ providers, review, manifest, preflight, transactionHash, minConfirmations = 3 }) {
  validateInputs({ review, manifest, preflight, transactionHash });
  if (!Array.isArray(providers) || providers.length < 2 || !Number.isInteger(minConfirmations) || minConfirmations < 3) throw new Error("Use 2+ BSC testnet RPCs and at least 3 confirmations");
  const heads = await Promise.all(providers.map(async provider => { const network = await provider.getNetwork(); if (Number(network.chainId) !== 97) throw new Error("Stage-2 RPC chain mismatch"); return provider.getBlockNumber(); }));
  const observations = await Promise.all(providers.map(async (provider, rpcIndex) => {
    const [transaction, receipt] = await Promise.all([provider.getTransaction(transactionHash), provider.getTransactionReceipt(transactionHash)]);
    if (!transaction || !receipt || receipt.status !== 1) throw new Error("Stage-2 deployment transaction is missing or failed");
    const action = manifest.orderedActions[0];
    if (transaction.from.toLowerCase() !== preflight.deployer.toLowerCase() || transaction.to !== null || BigInt(transaction.value) !== 0n || transaction.nonce !== Number(BigInt(preflight.deployerNonce))) throw new Error("Stage-2 deployment transaction envelope mismatch");
    if (sha256(transaction.data) !== sha256(action.data)) throw new Error("Stage-2 deployment init code mismatch");
    if (!receipt.contractAddress || receipt.contractAddress.toLowerCase() !== preflight.deployment.predictedAddress.toLowerCase()) throw new Error("Stage-2 deployed address mismatch");
    const block = await provider.getBlock(receipt.blockNumber);
    if (!block?.hash || block.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) throw new Error("Stage-2 canonical block mismatch");
    const confirmations = heads[rpcIndex] - receipt.blockNumber + 1;
    if (confirmations < minConfirmations) throw new Error("Stage-2 deployment finality is insufficient");
    const code = await provider.getCode(receipt.contractAddress, receipt.blockNumber);
    if (code === "0x") throw new Error("Stage-2 deployed runtime is missing");
    const [intentHub, executionRouter, administrator] = await Promise.all([readAddress(provider, receipt.contractAddress, "intentHub", receipt.blockNumber), readAddress(provider, receipt.contractAddress, "executionRouter", receipt.blockNumber), readAddress(provider, receipt.contractAddress, "administrator", receipt.blockNumber)]);
    if (intentHub.toLowerCase() !== review.dependencies.intentHub.toLowerCase() || executionRouter.toLowerCase() !== review.dependencies.executionRouter.toLowerCase() || administrator.toLowerCase() !== review.dependencies.governanceSafe.toLowerCase()) throw new Error("Stage-2 immutable binding mismatch");
    return { transactionHash: transactionHash.toLowerCase(), transactionIndex: receipt.index, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash.toLowerCase(), contractAddress: ethers.getAddress(receipt.contractAddress), gasUsed: String(receipt.gasUsed), effectiveGasPrice: String(receipt.gasPrice), runtimeCodeDigest: sha256(code), intentHub, executionRouter, administrator, confirmations };
  }));
  const comparable = value => ({ ...value, confirmations: undefined });
  for (const value of observations.slice(1)) if (canonicalDigest(comparable(value)) !== canonicalDigest(comparable(observations[0]))) throw new Error("Stage-2 deployment RPC disagreement");
  const first = observations[0];
  const deployment = { ...first, confirmations: Math.min(...observations.map(value => value.confirmations)), action: manifest.orderedActions[0].action, initCodeDigest: sha256(manifest.orderedActions[0].data) };
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE2_DEPLOYMENT_VERIFICATION", status: "VERIFIED_STAGE2_INTERNAL_SOLVER_DEPLOYMENT", network: { name: "BSC Testnet", chainId: 97 }, reviewDigest: review.reviewDigest, readinessDigest: review.readinessDigest, preflightDigest: preflight.preflightDigest, preflightBlockNumber: preflight.blockNumber, preflightBlockHash: preflight.blockHash, deployer: ethers.getAddress(preflight.deployer), deployerNonce: preflight.deployerNonce, rpcCount: providers.length, minConfirmations, deployment, transactionOccurred: true, safety: "Verification only. This record does not sign, submit, bind the Hub, approve tokens, or activate the Internal Solver." };
  return { ...body, verificationDigest: canonicalDigest(body) };
}

async function main() {
  const urls = String(process.env.BSC_TESTNET_RPC_URLS || "").split(",").map(value => value.trim()).filter(Boolean), reviewFile = process.env.INTENT_STAGE2_REVIEW_FILE, manifestFile = process.env.INTENT_STAGE2_MANIFEST_FILE, preflightFile = process.env.INTENT_STAGE2_PREFLIGHT_FILE, transactionHash = process.env.INTENT_STAGE2_DEPLOY_TX_HASH;
  if (urls.length < 2 || !reviewFile || !manifestFile || !preflightFile || !transactionHash) throw new Error("Set 2+ BSC_TESTNET_RPC_URLS, Stage-2 review/manifest/preflight files, and deployment transaction hash");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = await verifyIntentStage2DeploymentAcrossRpcs({ providers: urls.map(url => new ethers.JsonRpcProvider(url, 97, { staticNetwork: true })), review: read(reviewFile), manifest: read(manifestFile), preflight: read(preflightFile), transactionHash });
  const output = path.resolve(import.meta.dirname, "../deployments/intent-stage2-deployment-verification-bsc-testnet-97.json");
  fs.writeFileSync(output, `${JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2)}\n`);
  console.log(`Wrote ${output}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
