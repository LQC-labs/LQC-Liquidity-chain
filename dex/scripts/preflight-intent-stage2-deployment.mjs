import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest, sha256 } from "./build-intent-reproducibility-seal.mjs";

function validateReview(review, manifest) {
  if (review?.status !== "REVIEW_REQUIRED" || review.packageType !== "LQC_INTENT_STAGE2_INTERNAL_SOLVER_REVIEW" || review.network?.chainId !== 97 || review.transactionOccurred !== false || manifest?.stage !== "stage2-solver-deploy" || manifest.network?.chainId !== 97 || manifest.orderedActions?.length !== 1) throw new Error("Invalid Stage-2 review context");
  const { reviewDigest, ...body } = review;
  if (canonicalDigest(body) !== reviewDigest) throw new Error("Stage-2 review digest mismatch");
  const action = manifest.orderedActions[0];
  const summary = { id: action.id, actor: action.actor, action: action.action, to: action.to, value: action.value, initCodeDigest: sha256(action.data), initCodeBytes: (action.data.length - 2) / 2 };
  if (canonicalDigest(summary) !== canonicalDigest(review.action)) throw new Error("Stage-2 manifest changed after review");
}

export async function preflightIntentStage2AcrossRpcs({ providers, review, manifest, deployer }) {
  validateReview(review, manifest);
  if (!ethers.isAddress(deployer) || deployer === ethers.ZeroAddress || !Array.isArray(providers) || providers.length < 2) throw new Error("Use a valid deployer and 2+ BSC testnet RPCs");
  const action = manifest.orderedActions[0];
  const heads = await Promise.all(providers.map(async provider => { const network = await provider.getNetwork(); if (Number(network.chainId) !== 97) throw new Error("Stage-2 RPC chain mismatch"); return provider.getBlockNumber(); }));
  const blockNumber = Math.min(...heads);
  const observations = await Promise.all(providers.map(async provider => {
    const block = await provider.getBlock(blockNumber);
    if (!block?.hash || !block.baseFeePerGas || BigInt(block.baseFeePerGas) <= 0n) throw new Error("Stage-2 canonical block or base fee missing");
    const [nonce, balance] = await Promise.all([provider.getTransactionCount(deployer, blockNumber), provider.getBalance(deployer, blockNumber)]);
    const predictedAddress = ethers.getCreateAddress({ from: deployer, nonce });
    const [code, gas] = await Promise.all([provider.getCode(predictedAddress, blockNumber), provider.estimateGas({ from: deployer, data: action.data, value: 0 })]);
    if (code !== "0x") throw new Error("Predicted Stage-2 deployment address already has code");
    return { blockNumber, blockHash: block.hash.toLowerCase(), baseFeePerGas: String(block.baseFeePerGas), nonce: String(nonce), balance: String(balance), predictedAddress, gas: String(gas) };
  }));
  const first = observations[0];
  for (const value of observations.slice(1)) {
    if (value.blockHash !== first.blockHash || value.baseFeePerGas !== first.baseFeePerGas || value.nonce !== first.nonce || value.balance !== first.balance || value.predictedAddress.toLowerCase() !== first.predictedAddress.toLowerCase()) throw new Error("Stage-2 RPC state disagreement");
    const a = BigInt(first.gas), b = BigInt(value.gas), high = a > b ? a : b, low = a > b ? b : a;
    if ((high - low) * 100n > high * 5n) throw new Error("Stage-2 gas estimate disagreement");
  }
  const conservativeGas = observations.reduce((max, value) => BigInt(value.gas) > max ? BigInt(value.gas) : max, 0n);
  const requiredGasBudget = conservativeGas * BigInt(first.baseFeePerGas) * 120n / 100n;
  if (BigInt(first.balance) < requiredGasBudget) throw new Error("Stage-2 deployer has insufficient testnet gas balance");
  const body = { status: "PREFLIGHT_VERIFIED_FOR_INTERNAL_SOLVER_REVIEW", network: { name: "BSC Testnet", chainId: 97 }, reviewDigest: review.reviewDigest, readinessDigest: review.readinessDigest, deployer: ethers.getAddress(deployer), blockNumber, blockHash: first.blockHash, baseFeePerGas: first.baseFeePerGas, deployerNonce: first.nonce, deployerBalance: first.balance, requiredGasBudget: requiredGasBudget.toString(), rpcCount: providers.length, deployment: { action: action.action, predictedAddress: first.predictedAddress, initCodeDigest: sha256(action.data), conservativeGas: conservativeGas.toString() }, transactionOccurred: false, safety: "Read-only Stage-2 preflight. No deployment, signature, Hub binding, token approval, or transaction is performed." };
  return { ...body, preflightDigest: canonicalDigest(body) };
}

async function main() {
  const urls = String(process.env.BSC_TESTNET_RPC_URLS || "").split(",").map(value => value.trim()).filter(Boolean), reviewFile = process.env.INTENT_STAGE2_REVIEW_FILE, manifestFile = process.env.INTENT_STAGE2_MANIFEST_FILE, deployer = process.env.INTENT_STAGE2_DEPLOYER;
  if (urls.length < 2 || !reviewFile || !manifestFile || !deployer) throw new Error("Set 2+ BSC_TESTNET_RPC_URLS, INTENT_STAGE2_REVIEW_FILE, INTENT_STAGE2_MANIFEST_FILE and INTENT_STAGE2_DEPLOYER");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = await preflightIntentStage2AcrossRpcs({ providers: urls.map(url => new ethers.JsonRpcProvider(url, 97, { staticNetwork: true })), review: read(reviewFile), manifest: read(manifestFile), deployer });
  const output = path.resolve(import.meta.dirname, "../deployments/intent-stage2-deployment-preflight-bsc-testnet-97.json");
  fs.writeFileSync(output, `${JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2)}\n`);
  console.log(`Wrote ${output}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
