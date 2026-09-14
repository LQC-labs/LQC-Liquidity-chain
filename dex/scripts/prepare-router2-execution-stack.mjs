import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { PANCAKE_V3_DEX_ID } from "./prepare-router2-quote-stack.mjs";
import { TEST_LQC, TEST_WBNB } from "./prepare-pancake-v3-pool.mjs";
import { SIGNER_1 } from "./prepare-pancake-v3-liquidity.mjs";

const readJson = relative => JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, relative), "utf8"));
const artifact = relative => readJson(`../artifacts/contracts/router-v2/${relative}`);
const quoteStack = readJson("../deployments/router2-quote-stack-config-bsc-testnet-97.json");
const riskSafe = readJson("../deployments/risk-safe-bsc-testnet-97.json");
const governanceSafe = readJson("../deployments/governance-safe-bsc-testnet-97.json");
const riskArtifact = artifact("LQCRiskRegistry.sol/LQCRiskRegistry.json");
const executionArtifact = artifact("LQCExecutionRouter.sol/LQCExecutionRouter.json");
const risk = new ethers.Interface(riskArtifact.abi);

export const PILOT_LIMITS = Object.freeze({
  tLQC: { maxPerTransaction: ethers.parseUnits("1000", 18), maxPerDay: ethers.parseUnits("10000", 18) },
  WBNB: { maxPerTransaction: ethers.parseUnits("0.01", 18), maxPerDay: ethers.parseUnits("0.1", 18) },
});

function deploymentData(contractArtifact, args) {
  return new ethers.ContractFactory(contractArtifact.abi, contractArtifact.bytecode).getDeployTransaction(...args);
}

export async function buildExecutionStack(riskRegistryAddress = null, executionRouterAddress = null) {
  const registryAddress = quoteStack?.executions?.registry?.address;
  if (!ethers.isAddress(registryAddress)) throw new Error("A verified DEX Registry address is required.");
  if (!ethers.isAddress(riskSafe.address) || riskSafe.threshold < 3 || riskSafe.owners.length < 5) {
    throw new Error("The recorded Risk Safe must satisfy the reviewed 3-of-5 policy.");
  }
  if (!ethers.isAddress(governanceSafe.address) || governanceSafe.threshold < 4 || governanceSafe.owners.length < 7) {
    throw new Error("The recorded Governance Safe must satisfy the reviewed 4-of-7 policy.");
  }
  if (riskRegistryAddress !== null && !ethers.isAddress(riskRegistryAddress)) throw new Error("riskRegistryAddress must be valid.");
  if (executionRouterAddress !== null && !ethers.isAddress(executionRouterAddress)) throw new Error("executionRouterAddress must be valid.");

  const riskDeploy = await deploymentData(riskArtifact, [SIGNER_1, riskSafe.address]);
  const orderedActions = [{ id: 1, action: "deploy-risk-registry", to: null, value: "0", data: riskDeploy.data }];
  if (riskRegistryAddress) {
    const executionDeploy = await deploymentData(executionArtifact, [registryAddress, riskRegistryAddress]);
    orderedActions.push({ id: 2, action: "deploy-execution-router", to: null, value: "0", data: executionDeploy.data });
  }
  if (riskRegistryAddress && executionRouterAddress) {
    orderedActions.push(
      { id: 3, action: "set-executor", to: riskRegistryAddress, value: "0", data: risk.encodeFunctionData("setExecutor", [executionRouterAddress]) },
      { id: 4, action: "allow-tlqc", to: riskRegistryAddress, value: "0", data: risk.encodeFunctionData("setTokenLimits", [TEST_LQC, true, PILOT_LIMITS.tLQC.maxPerTransaction, PILOT_LIMITS.tLQC.maxPerDay]) },
      { id: 5, action: "cap-pancake-v3-tlqc", to: riskRegistryAddress, value: "0", data: risk.encodeFunctionData("setDexTokenCap", [PANCAKE_V3_DEX_ID, TEST_LQC, PILOT_LIMITS.tLQC.maxPerTransaction]) },
      { id: 6, action: "allow-wbnb", to: riskRegistryAddress, value: "0", data: risk.encodeFunctionData("setTokenLimits", [TEST_WBNB, true, PILOT_LIMITS.WBNB.maxPerTransaction, PILOT_LIMITS.WBNB.maxPerDay]) },
      { id: 7, action: "cap-pancake-v3-wbnb", to: riskRegistryAddress, value: "0", data: risk.encodeFunctionData("setDexTokenCap", [PANCAKE_V3_DEX_ID, TEST_WBNB, PILOT_LIMITS.WBNB.maxPerTransaction]) },
      { id: 8, action: "begin-governance-transfer", to: riskRegistryAddress, value: "0", data: risk.encodeFunctionData("beginOwnershipTransfer", [governanceSafe.address]) },
    );
  }
  return {
    schemaVersion: 1,
    network: { name: "BSC Testnet", chainId: 97 },
    phase: "Router 2.0 capped execution foundation",
    signer: SIGNER_1,
    dependencies: { dexRegistry: registryAddress, riskSafe: riskSafe.address, governanceSafe: governanceSafe.address },
    pilotLimits: {
      tLQC: { maxPerTransaction: PILOT_LIMITS.tLQC.maxPerTransaction.toString(), maxPerDay: PILOT_LIMITS.tLQC.maxPerDay.toString() },
      WBNB: { maxPerTransaction: PILOT_LIMITS.WBNB.maxPerTransaction.toString(), maxPerDay: PILOT_LIMITS.WBNB.maxPerDay.toString() },
    },
    orderedActions,
    safety: "Preparation only. No transaction, approval, token movement, or swap is performed by this generator.",
  };
}

export function recordRiskRegistryDeployment(bundle, address, transactionHash) {
  if (!ethers.isAddress(address)) throw new Error("A valid deployed Risk Registry address is required.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) throw new Error("A valid Risk Registry transaction hash is required.");
  if (bundle.orderedActions[1]?.action !== "deploy-execution-router") throw new Error("Execution Router deployment data is required before recording Risk Registry evidence.");
  return {
    ...bundle,
    executions: {
      riskRegistry: {
        address,
        transactionHash,
        owner: SIGNER_1,
        riskAdmin: riskSafe.address,
        status: "success",
        evidenceSource: "successful TokenPocket receipt and on-page chain-97 role verification",
      },
    },
  };
}

export function recordExecutionRouterDeployment(bundle, address, transactionHash) {
  if (!ethers.isAddress(address)) throw new Error("A valid deployed Execution Router address is required.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) throw new Error("A valid Execution Router transaction hash is required.");
  if (!bundle.executions?.riskRegistry || bundle.orderedActions.length !== 8) throw new Error("Recorded Risk Registry and configuration data are required.");
  return {
    ...bundle,
    executions: {
      ...bundle.executions,
      executionRouter: {
        address,
        transactionHash,
        dexRegistry: bundle.dependencies.dexRegistry,
        riskRegistry: bundle.executions.riskRegistry.address,
        status: "success",
        evidenceSource: "successful TokenPocket receipt and on-page chain-97 binding verification",
      },
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const riskRegistryAddress = process.env.RISK_REGISTRY_ADDRESS || null;
  const transactionHash = process.env.RISK_REGISTRY_TX || null;
  const executionRouterAddress = process.env.EXECUTION_ROUTER_ADDRESS || null;
  const executionRouterTx = process.env.EXECUTION_ROUTER_TX || null;
  let bundle = await buildExecutionStack(riskRegistryAddress, executionRouterAddress);
  if (riskRegistryAddress || transactionHash) {
    if (!riskRegistryAddress || !transactionHash) throw new Error("Set both RISK_REGISTRY_ADDRESS and RISK_REGISTRY_TX.");
    bundle = recordRiskRegistryDeployment(bundle, riskRegistryAddress, transactionHash);
  }
  if (executionRouterAddress || executionRouterTx) {
    if (!executionRouterAddress || !executionRouterTx) throw new Error("Set both EXECUTION_ROUTER_ADDRESS and EXECUTION_ROUTER_TX.");
    bundle = recordExecutionRouterDeployment(bundle, executionRouterAddress, executionRouterTx);
  }
  const stage = executionRouterAddress ? "stage3" : riskRegistryAddress ? "stage2" : "stage1";
  const output = path.resolve(import.meta.dirname, `../deployments/router2-execution-stack-${stage}-bsc-testnet-97.json`);
  fs.writeFileSync(output, `${JSON.stringify(bundle, null, 2)}\n`);
  console.log(`Wrote ${output}`);
}
