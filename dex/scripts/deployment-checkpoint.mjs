import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const normalize = value => typeof value === "bigint" ? value.toString() :
  Array.isArray(value) ? value.map(normalize) :
  value && typeof value === "object" ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)])) : value;

export function deploymentConfigHash(source, args, bytecode) {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ source, args: normalize(args), bytecodeHash: ethers.keccak256(bytecode) })));
}

export function loadDeploymentCheckpoint(file, chainId, deployer) {
  if (!fs.existsSync(file)) return { version: 1, chainId: Number(chainId), deployer: ethers.getAddress(deployer), contracts: {} };
  const checkpoint = JSON.parse(fs.readFileSync(file, "utf8"));
  if (checkpoint.version !== 1 || checkpoint.chainId !== Number(chainId) ||
      ethers.getAddress(checkpoint.deployer) !== ethers.getAddress(deployer) ||
      !checkpoint.contracts || typeof checkpoint.contracts !== "object") {
    throw new Error("Deployment checkpoint does not match this chain or deployer.");
  }
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
