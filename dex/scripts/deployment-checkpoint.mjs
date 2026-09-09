import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const normalize = value => typeof value === "bigint" ? value.toString() :
  Array.isArray(value) ? value.map(normalize) :
  value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)])) : value;

export function deploymentConfigHash(source, args, bytecode) {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ source, args: normalize(args), bytecodeHash: ethers.keccak256(bytecode) })));
}

export function operationConfigHash(key, config) {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ key, config: normalize(config) })));
}

export function loadDeploymentCheckpoint(file, chainId, deployer) {
  if (!fs.existsSync(file)) return { version: 1, chainId: Number(chainId), deployer: ethers.getAddress(deployer), contracts: {}, operations: {} };
  const checkpoint = JSON.parse(fs.readFileSync(file, "utf8"));
  if (checkpoint.version !== 1 || checkpoint.chainId !== Number(chainId) ||
      ethers.getAddress(checkpoint.deployer) !== ethers.getAddress(deployer) ||
      !checkpoint.contracts || typeof checkpoint.contracts !== "object") {
    throw new Error("Deployment checkpoint does not match this chain or deployer.");
  }
  checkpoint.operations ||= {};
  return checkpoint;
}

export function saveDeploymentCheckpoint(file, checkpoint) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export async function checkpointedDeploy({ key, source, args, artifact, wallet, provider, checkpoint, checkpointFile, deployContract }) {
  const configHash = deploymentConfigHash(source, args, artifact.bytecode);
  const saved = checkpoint.contracts[key];
  if (saved) {
    if (saved.source !== source || saved.configHash !== configHash || !ethers.isAddress(saved.address)) {
      throw new Error(`Checkpoint mismatch for ${key}; use a new checkpoint instead of reusing incompatible deployment state.`);
    }
    if (await provider.getCode(saved.address) === "0x") throw new Error(`Checkpoint contract ${key} has no on-chain bytecode.`);
    return { contract: new ethers.Contract(saved.address, artifact.abi, wallet), txHash: saved.txHash, reused: true };
  }
  const contract = await deployContract();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const txHash = contract.deploymentTransaction()?.hash || null;
  checkpoint.contracts[key] = { source, address, txHash, configHash, savedAt: new Date().toISOString() };
  saveDeploymentCheckpoint(checkpointFile, checkpoint);
  return { contract, txHash, reused: false };
}

export async function checkpointedTransaction({ key, config = [], checkpoint, checkpointFile, provider, sendTransaction }) {
  checkpoint.operations ||= {};
  const saved = checkpoint.operations[key];
  const configHash = operationConfigHash(key, config);
  if (saved && saved.configHash !== configHash) {
    throw new Error(`Checkpoint operation ${key} does not match the current configuration.`);
  }
  if (saved?.status === "confirmed") return { txHash: saved.txHash, reused: true };
  if (saved?.status === "pending") {
    const receipt = await provider.getTransactionReceipt(saved.txHash);
    if (!receipt) throw new Error(`Checkpoint operation ${key} is still pending or unavailable.`);
    if (Number(receipt.status) !== 1) throw new Error(`Checkpoint operation ${key} reverted on-chain.`);
    checkpoint.operations[key] = { ...saved, status: "confirmed", confirmedAt: new Date().toISOString() };
    saveDeploymentCheckpoint(checkpointFile, checkpoint);
    return { txHash: saved.txHash, reused: true };
  }
  const transaction = await sendTransaction();
  checkpoint.operations[key] = { status: "pending", txHash: transaction.hash, configHash, sentAt: new Date().toISOString() };
  saveDeploymentCheckpoint(checkpointFile, checkpoint);
  const receipt = await transaction.wait();
  if (!receipt || Number(receipt.status) !== 1) throw new Error(`Operation ${key} did not confirm successfully.`);
  checkpoint.operations[key] = { ...checkpoint.operations[key], status: "confirmed", confirmedAt: new Date().toISOString() };
  saveDeploymentCheckpoint(checkpointFile, checkpoint);
  return { txHash: transaction.hash, reused: false };
}
