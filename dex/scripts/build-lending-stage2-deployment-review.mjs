import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { canonicalDigest } from "./build-intent-reproducibility-seal.mjs";

export function buildLendingStage2DeploymentReview({ manifest, preflight }) {
  const { manifestDigest, ...manifestBody } = manifest;
  const { preflightDigest, ...preflightBody } = preflight;
  if (manifest?.status !== "REVIEW_REQUIRED" || manifest.network?.chainId !== 97 || manifest.stage !== "stage2-registry-index-deploy" || manifest.transactionOccurred !== false || canonicalDigest(manifestBody) !== manifestDigest || manifest.orderedActions?.length !== 2) throw new Error("Invalid Lending Stage-2 manifest");
  if (preflight?.status !== "PREFLIGHT_VERIFIED_FOR_REVIEW" || preflight.network?.chainId !== 97 || preflight.transactionOccurred !== false || canonicalDigest(preflightBody) !== preflightDigest || preflight.manifestDigest !== manifestDigest || preflight.configPreflightDigest !== manifest.configPreflightDigest || preflight.stage1VerificationDigest !== manifest.stage1VerificationDigest || preflight.rpcCount < 2 || preflight.deployments?.length !== 2) throw new Error("Invalid Lending Stage-2 review evidence");

  const firstNonce = BigInt(preflight.deployerNonce);
  const deployments = manifest.orderedActions.map((action, index) => {
    const observed = preflight.deployments[index];
    const nonce = firstNonce + BigInt(index);
    const predictedAddress = ethers.getCreateAddress({ from: preflight.deployer, nonce });
    const approvedGasLimit = (BigInt(observed.conservativeGas) * 120n + 99n) / 100n;
    if (action.id !== observed.id || action.contract !== observed.contract || action.initCodeDigest !== observed.initCodeDigest || ethers.getAddress(observed.predictedAddress) !== predictedAddress || BigInt(observed.approvedGasLimit) !== approvedGasLimit) throw new Error("Lending Stage-2 deployment review mismatch");
    const expectedBindings = action.contract === "LQCLendingMarketRegistry"
      ? { owner: manifest.roles.governanceSafe, guardian: manifest.roles.guardianSafe, oracle: manifest.dependencies.oracleManager }
      : { owner: manifest.roles.governanceSafe, rateModel: manifest.dependencies.interestRateModel, core: ethers.ZeroAddress };
    return { order: index + 1, contract: action.contract, nonce: nonce.toString(), predictedAddress, expectedBindings, initCodeDigest: action.initCodeDigest, initCodeBytes: action.initCodeBytes, conservativeGas: observed.conservativeGas, approvedGasLimit: observed.approvedGasLimit, transactionValue: "0" };
  });

  const totalApprovedGasLimit = deployments.reduce((sum, item) => sum + BigInt(item.approvedGasLimit), 0n);
  const maximumGasBudgetWei = totalApprovedGasLimit * BigInt(preflight.conservativeGasPrice);
  if (totalApprovedGasLimit !== BigInt(preflight.totalApprovedGasLimit) || maximumGasBudgetWei !== BigInt(preflight.requiredGasBudget) || BigInt(preflight.deployerBalance) < maximumGasBudgetWei) throw new Error("Lending Stage-2 budget mismatch");

  const body = {
    schemaVersion: 1,
    recordType: "LQC_LENDING_STAGE2_DEPLOYMENT_REVIEW",
    status: "AWAITING_EXPLICIT_DEPLOYMENT_APPROVAL",
    network: manifest.network,
    manifestDigest,
    configPreflightDigest: manifest.configPreflightDigest,
    stage1VerificationDigest: manifest.stage1VerificationDigest,
    preflightDigest,
    canonicalBlock: { number: preflight.blockNumber, hash: preflight.blockHash },
    deployer: ethers.getAddress(preflight.deployer),
    dependencies: manifest.dependencies,
    deployments,
    budget: {
      deployerBalanceWei: preflight.deployerBalance,
      conservativeGasPriceWei: preflight.conservativeGasPrice,
      totalConservativeGas: preflight.totalConservativeGas,
      totalApprovedGasLimit: preflight.totalApprovedGasLimit,
      maximumGasBudgetWei: preflight.requiredGasBudget,
      maximumGasBudgetTbnb: ethers.formatEther(preflight.requiredGasBudget),
    },
    approvalScope: "Exactly two zero-value CREATE transactions in listed nonce order. Any changed block, nonce, address, init code, gas, dependency binding or RPC state requires a new review.",
    transactionOccurred: false,
    safety: "Human review only. No wallet, key, signature, deployment, token movement, configuration or transaction broadcast.",
  };
  return { ...body, reviewDigest: canonicalDigest(body) };
}

async function main() {
  const [manifestFile, preflightFile, outputFile] = process.argv.slice(2);
  if (!manifestFile || !preflightFile) throw new Error("Usage: node build-lending-stage2-deployment-review.mjs <manifest> <preflight> [output]");
  const read = file => JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
  const result = buildLendingStage2DeploymentReview({ manifest: read(manifestFile), preflight: read(preflightFile) });
  if (outputFile) fs.writeFileSync(path.resolve(outputFile), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
  else console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
