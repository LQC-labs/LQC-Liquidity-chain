import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

const emergencyInterface = new ethers.Interface([
  "event GuardianChanged(address indexed guardian,bool enabled)",
  "function guardians(address) view returns(bool)",
]);
const safeInterface = new ethers.Interface([
  "event ExecutionSuccess(bytes32 txHash,uint256 payment)",
]);

const same = (left, right) => ethers.getAddress(left) === ethers.getAddress(right);

export function validateGuardianActivationTransaction({ deployment, transaction, receipt, latestBlock, guardianEnabled, minimumConfirmations = 3 }) {
  if (Number(deployment?.network?.chainId) !== 97) throw new Error("Guardian activation evidence must target BSC testnet chain 97.");
  const governance = deployment?.owner, guardian = deployment?.guardian;
  const emergency = deployment?.contracts?.emergencyController?.address;
  for (const [name, address] of Object.entries({ governance, guardian, emergency })) {
    if (!ethers.isAddress(address) || address === ethers.ZeroAddress) throw new Error(`Guardian activation has an invalid ${name} address.`);
  }
  if (!Number.isInteger(minimumConfirmations) || minimumConfirmations < 1 || minimumConfirmations > 100) {
    throw new Error("Guardian activation confirmations must be between 1 and 100.");
  }
  if (!transaction || !receipt || !ethers.isHexString(transaction.hash, 32) ||
      transaction.hash.toLowerCase() !== receipt.hash?.toLowerCase()) throw new Error("Guardian activation transaction evidence is missing or inconsistent.");
  if (receipt.status !== 1) throw new Error("Guardian activation transaction did not succeed.");
  if (!ethers.isAddress(transaction.to) || !ethers.isAddress(receipt.to) ||
      !same(transaction.to, governance) || !same(receipt.to, governance)) {
    throw new Error("Guardian activation transaction was not executed through the recorded Governance Safe.");
  }
  if (!Number.isInteger(receipt.blockNumber) || !Number.isInteger(latestBlock) || latestBlock < receipt.blockNumber) {
    throw new Error("Guardian activation block evidence is invalid.");
  }
  const confirmations = latestBlock - receipt.blockNumber + 1;
  if (confirmations < minimumConfirmations) throw new Error("Guardian activation transaction lacks required confirmations.");

  let safeExecution = null, guardianChange = null;
  for (const log of receipt.logs || []) {
    if (!ethers.isAddress(log.address)) continue;
    try {
      if (same(log.address, governance)) safeExecution = safeInterface.parseLog(log);
      if (same(log.address, emergency)) guardianChange = emergencyInterface.parseLog(log);
    } catch { /* Ignore unrelated logs emitted by the same transaction. */ }
  }
  if (safeExecution?.name !== "ExecutionSuccess") throw new Error("Governance Safe success event is missing.");
  if (guardianChange?.name !== "GuardianChanged" || !same(guardianChange.args.guardian, guardian) || guardianChange.args.enabled !== true) {
    throw new Error("Reviewed Guardian activation event is missing or inconsistent.");
  }
  if (guardianEnabled !== true) throw new Error("Reviewed Guardian is not active after the transaction.");
  return {
    status: "VERIFIED",
    chainId: 97,
    transactionHash: transaction.hash,
    blockNumber: receipt.blockNumber,
    confirmations,
    governanceSafe: ethers.getAddress(governance),
    emergencyController: ethers.getAddress(emergency),
    guardian: ethers.getAddress(guardian),
    safeTransactionHash: safeExecution.args.txHash,
  };
}

export async function verifyGuardianActivationTransaction({ provider, deployment, transactionHash, minimumConfirmations = 3 }) {
  if (!ethers.isHexString(transactionHash, 32)) throw new Error("GUARDIAN_ACTIVATION_TX must be a transaction hash.");
  const network = await provider.getNetwork();
  if (network.chainId !== 97n) throw new Error(`Refusing Guardian verification on chain ${network.chainId}; expected 97.`);
  const [transaction, receipt, latestBlock] = await Promise.all([
    provider.getTransaction(transactionHash), provider.getTransactionReceipt(transactionHash), provider.getBlockNumber()
  ]);
  const emergency = new ethers.Contract(deployment.contracts.emergencyController.address, emergencyInterface, provider);
  const guardianEnabled = await emergency.guardians(deployment.guardian);
  return validateGuardianActivationTransaction({ deployment, transaction, receipt, latestBlock, guardianEnabled, minimumConfirmations });
}

async function main() {
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL;
  const transactionHash = process.env.GUARDIAN_ACTIVATION_TX;
  if (!rpcUrl || !transactionHash) throw new Error("Set BSC_TESTNET_RPC_URL and GUARDIAN_ACTIVATION_TX.");
  const root = path.resolve(import.meta.dirname, "..");
  const deploymentPath = path.resolve(process.env.DEPLOYMENT_FILE || path.join(root, "deployments/bsc-testnet-97.json"));
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const minimumConfirmations = Number(process.env.GUARDIAN_MIN_CONFIRMATIONS || "3");
  const result = await verifyGuardianActivationTransaction({
    provider: new ethers.JsonRpcProvider(rpcUrl), deployment, transactionHash, minimumConfirmations
  });
  process.stdout.write(`${JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
