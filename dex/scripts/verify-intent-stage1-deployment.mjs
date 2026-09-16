import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";

function validateInputs({ review, manifest, preflight, transactionHashes }) {
  if (review?.status !== "REVIEW_REQUIRED" || review.network?.chainId !== 97 || review.transactionOccurred !== false) throw new Error("Invalid Stage-1 review");
  const { reviewDigest, ...reviewBody } = review;
  if (canonicalDigest(reviewBody) !== reviewDigest) throw new Error("Stage-1 review digest mismatch");
  if (manifest?.stage !== "stage1-core-deploy" || manifest.network?.chainId !== 97 || manifest.orderedActions?.length !== 4) throw new Error("Invalid Stage-1 manifest");
  if (preflight?.status !== "PREFLIGHT_VERIFIED_FOR_REVIEW" || preflight.network?.chainId !== 97 || preflight.transactionOccurred !== false || preflight.reviewDigest !== reviewDigest) throw new Error("Invalid Stage-1 preflight");
  if (!ethers.isAddress(preflight.deployer) || preflight.deployments?.length !== 4) throw new Error("Invalid Stage-1 deployer context");
  if (!Array.isArray(transactionHashes) || transactionHashes.length !== 4 || new Set(transactionHashes.map(value => value.toLowerCase())).size !== 4 || transactionHashes.some(value => !ethers.isHexString(value, 32))) throw new Error("Provide four unique deployment transaction hashes");
  for (let index = 0; index < 4; index += 1) {
    const action = manifest.orderedActions[index], deployment = preflight.deployments[index];
    if (deployment.id !== action.id || deployment.action !== action.action || deployment.initCodeDigest !== sha256(action.data)) throw new Error("Stage-1 preflight manifest mismatch");
    if (ethers.getCreateAddress({ from: preflight.deployer, nonce: BigInt(preflight.deployerNonce) + BigInt(index) }).toLowerCase() !== deployment.predictedAddress.toLowerCase()) throw new Error("Stage-1 predicted address mismatch");
  }
}

export async function verifyIntentStage1DeploymentAcrossRpcs({ providers, review, manifest, preflight, transactionHashes, minConfirmations = 3 }) {
  validateInputs({ review, manifest, preflight, transactionHashes });
  if (!Array.isArray(providers) || providers.length < 2 || !Number.isInteger(minConfirmations) || minConfirmations < 3) throw new Error("Use 2+ BSC testnet RPCs and at least 3 confirmations");
  const heads = await Promise.all(providers.map(async provider => {
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== 97) throw new Error("Stage-1 RPC chain mismatch");
    return provider.getBlockNumber();
  }));
  const observations = await Promise.all(providers.map(async (provider, rpcIndex) => Promise.all(transactionHashes.map(async (transactionHash, index) => {
    const [transaction, receipt] = await Promise.all([provider.getTransaction(transactionHash), provider.getTransactionReceipt(transactionHash)]);
    if (!transaction || !receipt || receipt.status !== 1) throw new Error("Stage-1 deployment transaction is missing or failed");
    if (transaction.from.toLowerCase() !== preflight.deployer.toLowerCase() || transaction.to !== null || BigInt(transaction.value) !== 0n || transaction.nonce !== Number(BigInt(preflight.deployerNonce) + BigInt(index))) throw new Error("Stage-1 deployment transaction envelope mismatch");
    if (sha256(transaction.data) !== sha256(manifest.orderedActions[index].data)) throw new Error("Stage-1 deployment init code mismatch");
    if (!receipt.contractAddress || receipt.contractAddress.toLowerCase() !== preflight.deployments[index].predictedAddress.toLowerCase()) throw new Error("Stage-1 deployed address mismatch");
    const block = await provider.getBlock(receipt.blockNumber);
    if (!block?.hash || block.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) throw new Error("Stage-1 canonical block mismatch");
    const confirmations = heads[rpcIndex] - receipt.blockNumber + 1;
    if (confirmations < minConfirmations) throw new Error("Stage-1 deployment finality is insufficient");
    const code = await provider.getCode(receipt.contractAddress, receipt.blockNumber);
    if (code === "0x") throw new Error("Stage-1 deployed runtime is missing");
    return { transactionHash: transactionHash.toLowerCase(), transactionIndex: receipt.index, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash.toLowerCase(), contractAddress: ethers.getAddress(receipt.contractAddress), gasUsed: String(receipt.gasUsed), effectiveGasPrice: String(receipt.gasPrice), runtimeCodeDigest: sha256(code), confirmations };
  }))));
  const first = observations[0];
  for (const rpc of observations.slice(1)) for (let index = 0; index < first.length; index += 1) {
    const comparable = value => ({ transactionHash: value.transactionHash, transactionIndex: value.transactionIndex, blockNumber: value.blockNumber, blockHash: value.blockHash, contractAddress: value.contractAddress, gasUsed: value.gasUsed, effectiveGasPrice: value.effectiveGasPrice, runtimeCodeDigest: value.runtimeCodeDigest });
    if (canonicalDigest(comparable(rpc[index])) !== canonicalDigest(comparable(first[index]))) throw new Error("Stage-1 deployment RPC disagreement");
  }
  const deployments = first.map((value, index) => ({ id: manifest.orderedActions[index].id, action: manifest.orderedActions[index].action, initCodeDigest: sha256(manifest.orderedActions[index].data), ...value, confirmations: Math.min(...observations.map(rpc => rpc[index].confirmations)) }));
  const body = { schemaVersion: 1, recordType: "LQC_INTENT_STAGE1_DEPLOYMENT_VERIFICATION", status: "VERIFIED_STAGE1_DEPLOYMENT", network: { name: "BSC Testnet", chainId: 97 }, reviewDigest: review.reviewDigest, sealDigest: review.sealDigest, preflightBlockNumber: preflight.blockNumber, preflightBlockHash: preflight.blockHash, deployer: ethers.getAddress(preflight.deployer), startingNonce: preflight.deployerNonce, rpcCount: providers.length, minConfirmations, deployments, transactionOccurred: true, safety: "Verification only. This record does not sign, submit, approve, transfer, configure, or activate contracts." };
  return { ...body, verificationDigest: canonicalDigest(body) };
}

async function main() {
  const urls = String(process.env.BSC_TESTNET_RPC_URLS || "").split(",").map(value => value.trim()).filter(Boolean), reviewFile = process.env.INTENT_STAGE1_REVIEW_FILE, manifestFile = process.env.INTENT_STAGE1_MANIFEST_FILE, preflightFile = process.env.INTENT_STAGE1_PREFLIGHT_FILE, hashes = String(process.env.INTENT_STAGE1_DEPLOY_TX_HASHES || "").split(",").map(value => value.trim()).filter(Boolean);
  if (urls.length < 2 || !reviewFile || !manifestFile || !preflightFile || hashes.length !== 4) throw new Error("Set 2+ BSC_TESTNET_RPC_URLS, review/manifest/preflight files, and four deployment transaction hashes");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = await verifyIntentStage1DeploymentAcrossRpcs({ providers: urls.map(url => new ethers.JsonRpcProvider(url, 97, { staticNetwork: true })), review: read(reviewFile), manifest: read(manifestFile), preflight: read(preflightFile), transactionHashes: hashes });
  const output = path.resolve(import.meta.dirname, "../deployments/intent-stage1-deployment-verification-bsc-testnet-97.json");
  fs.writeFileSync(output, `${JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2)}\n`);
  console.log(`Wrote ${output}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
