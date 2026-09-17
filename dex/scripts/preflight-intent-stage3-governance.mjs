import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";
import { buildIntentStage3Readiness } from "./build-intent-stage3-readiness.mjs";
import { buildIntentStage3ReviewPackage } from "./build-intent-stage3-review-package.mjs";

const safeView = new ethers.Interface([
  "function nonce() view returns(uint256)",
  "function getThreshold() view returns(uint256)",
  "function getOwners() view returns(address[])",
]);

async function readSafe(provider, safe, fn, blockTag) {
  const data = safeView.encodeFunctionData(fn);
  const result = await provider.call({ to: safe, data }, blockTag);
  return safeView.decodeFunctionResult(fn, result)[0];
}

export async function preflightIntentStage3AcrossRpcs({ providers, deployment, manifest, review }) {
  if (!Array.isArray(providers) || providers.length < 2) throw new Error("Use 2+ BSC testnet RPCs");
  const readiness = await buildIntentStage3Readiness({ providers, deployment, manifest });
  const rebuiltReview = buildIntentStage3ReviewPackage({ readiness, manifest });
  if (review?.reviewDigest !== rebuiltReview.reviewDigest || canonicalDigest(review) !== canonicalDigest(rebuiltReview)) throw new Error("Stage-3 review package changed or is stale");

  const safe = ethers.getAddress(readiness.roles.governanceSafe);
  const observations = await Promise.all(providers.map(async provider => {
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== 97) throw new Error("Stage-3 preflight RPC chain mismatch");
    const block = await provider.getBlock(readiness.blockNumber);
    if (!block?.hash || block.hash.toLowerCase() !== readiness.blockHash.toLowerCase()) throw new Error("Stage-3 readiness block is not canonical");
    const [code, nonce, threshold, owners] = await Promise.all([
      provider.getCode(safe, readiness.blockNumber),
      readSafe(provider, safe, "nonce", readiness.blockNumber),
      readSafe(provider, safe, "getThreshold", readiness.blockNumber),
      readSafe(provider, safe, "getOwners", readiness.blockNumber),
    ]);
    if (code === "0x") throw new Error("Governance Safe runtime missing");
    const normalizedOwners = owners.map(ethers.getAddress).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return { blockNumber: readiness.blockNumber, blockHash: readiness.blockHash.toLowerCase(), safeRuntimeDigest: ethers.sha256(code), safeNonce: nonce.toString(), safeThreshold: threshold.toString(), safeOwners: normalizedOwners };
  }));
  const first = observations[0];
  for (const item of observations.slice(1)) if (canonicalDigest(item) !== canonicalDigest(first)) throw new Error("Stage-3 Safe RPC disagreement");
  if (first.safeOwners.length !== 7 || first.safeThreshold !== "4" || new Set(first.safeOwners.map(value => value.toLowerCase())).size !== 7) throw new Error("Governance Safe is not the reviewed 4-of-7 policy");

  const body = {
    schemaVersion: 1,
    recordType: "LQC_INTENT_STAGE3_GOVERNANCE_PREFLIGHT",
    status: "PREFLIGHT_VERIFIED_FOR_4_OF_7_REVIEW",
    network: { name: "BSC Testnet", chainId: 97 },
    reviewDigest: review.reviewDigest,
    readinessDigest: readiness.readinessDigest,
    blockNumber: readiness.blockNumber,
    blockHash: readiness.blockHash,
    rpcCount: providers.length,
    governanceSafe: safe,
    safeRuntimeDigest: first.safeRuntimeDigest,
    safeNonce: first.safeNonce,
    safeThreshold: first.safeThreshold,
    safeOwnerCount: first.safeOwners.length,
    safeOwners: first.safeOwners,
    actionCount: rebuiltReview.actions.length,
    actionCalldataDigests: rebuiltReview.actions.map(action => action.calldataDigest),
    transactionOccurred: false,
    safety: "Read-only Stage-3 preflight. No Safe proposal, signature, execution, binding, Solver activation, attester activation, approval, or transaction is performed.",
  };
  return { ...body, preflightDigest: canonicalDigest(body) };
}

async function main() {
  const urls = String(process.env.BSC_TESTNET_RPC_URLS || "").split(",").map(value => value.trim()).filter(Boolean);
  const deploymentFile = process.env.INTENT_STAGE2_DEPLOYMENT_VERIFICATION_FILE, manifestFile = process.env.INTENT_STAGE3_MANIFEST_FILE, reviewFile = process.env.INTENT_STAGE3_REVIEW_FILE;
  if (urls.length < 2 || !deploymentFile || !manifestFile || !reviewFile) throw new Error("Set 2+ BSC_TESTNET_RPC_URLS, INTENT_STAGE2_DEPLOYMENT_VERIFICATION_FILE, INTENT_STAGE3_MANIFEST_FILE and INTENT_STAGE3_REVIEW_FILE");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = await preflightIntentStage3AcrossRpcs({ providers: urls.map(url => new ethers.JsonRpcProvider(url, 97, { staticNetwork: true })), deployment: read(deploymentFile), manifest: read(manifestFile), review: read(reviewFile) });
  const output = path.resolve(import.meta.dirname, "../deployments/intent-stage3-governance-preflight-bsc-testnet-97.json");
  fs.writeFileSync(output, `${JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2)}\n`);
  console.log(`Wrote ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
