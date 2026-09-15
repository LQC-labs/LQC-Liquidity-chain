import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

const readJson = relative => JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, relative), "utf8"));
const proofArtifact = readJson("../artifacts/contracts/router-v2/LQCBestExecutionProof.sol/LQCBestExecutionProof.json");
const gatewayArtifact = readJson("../artifacts/contracts/router-v2/LQCProofBoundExecutionGateway.sol/LQCProofBoundExecutionGateway.json");
const executionStack = readJson("../deployments/router2-execution-stack-stage3-bsc-testnet-97.json");
const transactionHashPattern = /^0x[0-9a-fA-F]{64}$/;

const deploymentData = async (contractArtifact, args = []) =>
  (await new ethers.ContractFactory(contractArtifact.abi, contractArtifact.bytecode).getDeployTransaction(...args)).data;

export async function buildProofBoundGatewayDeployment(proofVerifierAddress = null) {
  const executionRouter = executionStack?.executions?.executionRouter?.address;
  if (!ethers.isAddress(executionRouter)) throw new Error("A verified Execution Router deployment is required.");
  if (executionStack.network?.chainId !== 97 || executionStack.executions.executionRouter.status !== "success") {
    throw new Error("The Execution Router must have successful BSC Testnet evidence.");
  }
  if (proofVerifierAddress !== null && !ethers.isAddress(proofVerifierAddress)) {
    throw new Error("proofVerifierAddress must be valid.");
  }

  const orderedActions = [{
    id: 1,
    action: "deploy-best-execution-proof",
    to: null,
    value: "0",
    data: await deploymentData(proofArtifact),
  }];
  if (proofVerifierAddress) {
    orderedActions.push({
      id: 2,
      action: "deploy-proof-bound-execution-gateway",
      to: null,
      value: "0",
      constructorArguments: [ethers.getAddress(proofVerifierAddress), ethers.getAddress(executionRouter)],
      data: await deploymentData(gatewayArtifact, [proofVerifierAddress, executionRouter]),
    });
  }

  return {
    schemaVersion: 1,
    network: { name: "BSC Testnet", chainId: 97 },
    phase: "Router 2.0 on-chain proof-bound gateway deployment",
    dependencies: { executionRouter: ethers.getAddress(executionRouter), proofVerifier: proofVerifierAddress ? ethers.getAddress(proofVerifierAddress) : null },
    bytecodeHashes: {
      bestExecutionProof: ethers.keccak256(proofArtifact.bytecode),
      proofBoundGateway: ethers.keccak256(gatewayArtifact.bytecode),
    },
    runtimeBytecodeHashes: {
      bestExecutionProof: ethers.keccak256(proofArtifact.deployedBytecode),
      proofBoundGateway: ethers.keccak256(gatewayArtifact.deployedBytecode),
    },
    gatewayTemplate: {
      bytecode: gatewayArtifact.bytecode,
      constructorTypes: ["address", "address"],
      constructorOrder: ["proofVerifier", "executionRouter"],
    },
    orderedActions,
    safety: "Preparation only. No private key, signature, transaction, approval, token movement, or swap is used.",
  };
}

export function recordProofVerifierDeployment(bundle, address, transactionHash) {
  if (!ethers.isAddress(address)) throw new Error("A valid deployed proof verifier address is required.");
  if (!transactionHashPattern.test(transactionHash)) throw new Error("A valid proof verifier transaction hash is required.");
  if (bundle.orderedActions[1]?.action !== "deploy-proof-bound-execution-gateway") {
    throw new Error("Rebuild the bundle with the deployed proof verifier address first.");
  }
  if (ethers.getAddress(address) !== bundle.dependencies.proofVerifier) {
    throw new Error("The recorded proof verifier must match the Gateway constructor dependency.");
  }
  return { ...bundle, executions: { proofVerifier: { address: ethers.getAddress(address), transactionHash, status: "success" } } };
}

export function recordProofBoundGatewayDeployment(bundle, address, transactionHash) {
  if (!ethers.isAddress(address)) throw new Error("A valid deployed proof-bound Gateway address is required.");
  if (!transactionHashPattern.test(transactionHash)) throw new Error("A valid Gateway transaction hash is required.");
  if (!bundle.executions?.proofVerifier || bundle.orderedActions[1]?.action !== "deploy-proof-bound-execution-gateway") {
    throw new Error("A recorded proof verifier deployment is required first.");
  }
  return {
    ...bundle,
    executions: {
      ...bundle.executions,
      proofBoundGateway: {
        address: ethers.getAddress(address), transactionHash, status: "success",
        proofVerifier: bundle.dependencies.proofVerifier, executionRouter: bundle.dependencies.executionRouter,
      },
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const proofAddress = process.env.PROOF_VERIFIER_ADDRESS || null;
  const proofTx = process.env.PROOF_VERIFIER_TX || null;
  const gatewayAddress = process.env.PROOF_GATEWAY_ADDRESS || null;
  const gatewayTx = process.env.PROOF_GATEWAY_TX || null;
  let bundle = await buildProofBoundGatewayDeployment(proofAddress);
  if (proofAddress || proofTx) {
    if (!proofAddress || !proofTx) throw new Error("Set both PROOF_VERIFIER_ADDRESS and PROOF_VERIFIER_TX.");
    bundle = recordProofVerifierDeployment(bundle, proofAddress, proofTx);
  }
  if (gatewayAddress || gatewayTx) {
    if (!gatewayAddress || !gatewayTx) throw new Error("Set both PROOF_GATEWAY_ADDRESS and PROOF_GATEWAY_TX.");
    bundle = recordProofBoundGatewayDeployment(bundle, gatewayAddress, gatewayTx);
  }
  const stage = gatewayAddress ? "stage3" : proofAddress ? "stage2" : "stage1";
  const output = path.resolve(import.meta.dirname, `../deployments/router2-proof-bound-gateway-${stage}-bsc-testnet-97.json`);
  fs.writeFileSync(output, `${JSON.stringify(bundle, null, 2)}\n`);
  console.log(`Wrote ${output}`);
}
