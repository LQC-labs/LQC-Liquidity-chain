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

const transactionHashPattern = /^0x[0-9a-fA-F]{64}$/;

async function requireCanonicalReceipt(key, saved, provider) {
  if (!transactionHashPattern.test(saved.txHash || "")) {
    throw new Error(`Checkpoint operation ${key} has an invalid transaction hash.`);
  }
  const receipt = await provider.getTransactionReceipt(saved.txHash);
  if (!receipt) throw new Error(`Checkpoint operation ${key} is not confirmed on the current canonical chain.`);
  if (Number(receipt.status) !== 1) throw new Error(`Checkpoint operation ${key} reverted on-chain.`);
  const receiptHash = receipt.hash || receipt.transactionHash;
  if (receiptHash && receiptHash.toLowerCase() !== saved.txHash.toLowerCase()) {
    throw new Error(`Checkpoint operation ${key} returned a mismatched transaction receipt.`);
  }
  if (saved.blockHash && receipt.blockHash?.toLowerCase() !== saved.blockHash.toLowerCase()) {
    throw new Error(`Checkpoint operation ${key} moved to a different block after a chain reorganization.`);
  }
  if (saved.blockNumber !== undefined && Number(receipt.blockNumber) !== Number(saved.blockNumber)) {
    throw new Error(`Checkpoint operation ${key} moved to a different block after a chain reorganization.`);
  }
  return receipt;
}

const receiptEvidence = receipt => ({
  ...(receipt.blockHash ? { blockHash: receipt.blockHash } : {}),
  ...(receipt.blockNumber !== undefined ? { blockNumber: Number(receipt.blockNumber) } : {})
});

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
  if (saved?.status === "confirmed") {
    const receipt = await requireCanonicalReceipt(key, saved, provider);
    const evidence = receiptEvidence(receipt);
    if ((!saved.blockHash && evidence.blockHash) || (saved.blockNumber === undefined && evidence.blockNumber !== undefined)) {
      checkpoint.operations[key] = { ...saved, ...evidence };
      saveDeploymentCheckpoint(checkpointFile, checkpoint);
    }
    return { txHash: saved.txHash, reused: true };
  }
  if (saved?.status === "pending") {
    let receipt;
    try { receipt = await requireCanonicalReceipt(key, saved, provider); }
    catch (error) {
      if (/not confirmed/.test(error.message)) throw new Error(`Checkpoint operation ${key} is still pending or unavailable.`);
      throw error;
    }
    checkpoint.operations[key] = { ...saved, status: "confirmed", ...receiptEvidence(receipt), confirmedAt: new Date().toISOString() };
    saveDeploymentCheckpoint(checkpointFile, checkpoint);
    return { txHash: saved.txHash, reused: true };
  }
  const transaction = await sendTransaction();
  checkpoint.operations[key] = { status: "pending", txHash: transaction.hash, configHash, sentAt: new Date().toISOString() };
  saveDeploymentCheckpoint(checkpointFile, checkpoint);
  const receipt = await transaction.wait();
  if (!receipt || Number(receipt.status) !== 1) throw new Error(`Operation ${key} did not confirm successfully.`);
  checkpoint.operations[key] = { ...checkpoint.operations[key], status: "confirmed", ...receiptEvidence(receipt), confirmedAt: new Date().toISOString() };
  saveDeploymentCheckpoint(checkpointFile, checkpoint);
  return { txHash: transaction.hash, reused: false };
}
