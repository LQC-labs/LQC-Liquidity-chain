import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

export function buildLendingStage3DeploymentReview({ manifest, preflight }) {
  const { manifestDigest, ...manifestBody } = manifest;
  const { preflightDigest, ...preflightBody } = preflight;
  const action = manifest.orderedActions?.[0];
  const deployment = preflight.deployment;

  if (
    manifest?.status !== "REVIEW_REQUIRED"
    || manifest.network?.chainId !== 97
    || manifest.stage !== "stage3-lending-core-deploy"
    || manifest.transactionOccurred !== false
    || canonicalDigest(manifestBody) !== manifestDigest
    || manifest.orderedActions?.length !== 1
    || action?.contract !== "LQCLendingCore"
  ) throw new Error("Invalid Lending Stage-3 manifest");

  if (
    preflight?.status !== "PREFLIGHT_VERIFIED_FOR_REVIEW"
    || preflight.network?.chainId !== 97
    || preflight.transactionOccurred !== false
    || canonicalDigest(preflightBody) !== preflightDigest
    || preflight.manifestDigest !== manifestDigest
    || preflight.stage2VerificationDigest !== manifest.stage2VerificationDigest
    || preflight.rpcCount < 2
    || deployment?.contract !== action.contract
  ) throw new Error("Invalid Lending Stage-3 review evidence");

  const nonce = BigInt(preflight.deployerNonce);
  const predictedAddress = ethers.getCreateAddress({ from: preflight.deployer, nonce });
  const approvedGasLimit = (BigInt(deployment.estimatedGas) * 120n) / 100n;
  const maximumGasBudgetWei = approvedGasLimit * BigInt(preflight.conservativeGasPrice);
  if (
    ethers.getAddress(deployment.predictedAddress) !== predictedAddress
    || deployment.initCodeDigest !== action.initCodeDigest
    || BigInt(deployment.approvedGasLimit) !== approvedGasLimit
    || BigInt(preflight.requiredGasBudget) !== maximumGasBudgetWei
    || BigInt(preflight.deployerBalance) < maximumGasBudgetWei
  ) throw new Error("Lending Stage-3 deployment or budget mismatch");

  const body = {
    schemaVersion: 1,
    recordType: "LQC_LENDING_STAGE3_DEPLOYMENT_REVIEW",
    status: "AWAITING_EXPLICIT_DEPLOYMENT_APPROVAL",
    network: manifest.network,
    manifestDigest,
    configPreflightDigest: manifest.configPreflightDigest,
    stage2VerificationDigest: manifest.stage2VerificationDigest,
    preflightDigest,
    observedBlocks: preflight.rpcHeads,
    deployer: ethers.getAddress(preflight.deployer),
    dependencies: manifest.dependencies,
    deployment: {
      order: 1,
      contract: action.contract,
      nonce: nonce.toString(),
      predictedAddress,
      expectedBindings: {
        owner: manifest.roles.governanceSafe,
        registry: manifest.dependencies.marketRegistry,
        interestIndex: manifest.dependencies.interestIndex,
        liquidationEngine: ethers.ZeroAddress,
      },
      initCodeDigest: action.initCodeDigest,
      initCodeBytes: action.initCodeBytes,
      estimatedGas: deployment.estimatedGas,
      approvedGasLimit: deployment.approvedGasLimit,
      transactionValue: "0",
    },
    budget: {
      deployerBalanceWei: preflight.deployerBalance,
      conservativeGasPriceWei: preflight.conservativeGasPrice,
      maximumGasBudgetWei: preflight.requiredGasBudget,
      maximumGasBudgetTbnb: ethers.formatEther(preflight.requiredGasBudget),
    },
    approvalScope: "Exactly one zero-value LQCLendingCore CREATE transaction. Any changed nonce, address, init code, gas, dependency binding or RPC state requires a new review.",
    transactionOccurred: false,
    safety: "Human review only. No wallet, key, signature, deployment, binding, market activation, token movement or transaction broadcast.",
  };
  return { ...body, reviewDigest: canonicalDigest(body) };
}

async function main() {
  const [manifestFile, preflightFile, outputFile] = process.argv.slice(2);
  if (!manifestFile || !preflightFile) throw new Error("Usage: node build-lending-stage3-deployment-review.mjs <manifest> <preflight> [output]");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = buildLendingStage3DeploymentReview({ manifest: read(manifestFile), preflight: read(preflightFile) });
  if (outputFile) fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  else console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
