import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { validateBscTestnet } from "./validate-bsc-testnet.mjs";

const BALANCE_ABI = ["function balanceOf(address) view returns(uint256)"];
const OWNABLE_ABI = ["function owner() view returns(address)", "function pendingOwner() view returns(address)"];

export function buildMonitoringReport({ checkedAt, block, maxBlockAgeSeconds, validation, validationError,
  custody, ownership }) {
  const checks = [];
  const add = (id, status, detail) => checks.push({ id, status, detail });
  const age = Math.max(0, Math.floor(new Date(checkedAt).getTime() / 1000) - Number(block.timestamp));
  add("chain.block_freshness", age <= maxBlockAgeSeconds ? "PASS" : "CRITICAL",
    `latest block ${block.number} is ${age}s old (limit ${maxBlockAgeSeconds}s)`);
  add("deployment.configuration", validationError ? "CRITICAL" : "PASS",
    validationError || `${validation.lqc.contractCount} core contracts and ${validation.lqc.dexCount} DEX adapters verified`);
  if (validation) add("protocol.swap_status", validation.lqc.swapsPaused ? "WARNING" : "PASS",
    validation.lqc.swapsPaused ? "swaps are paused" : "swaps are enabled");
  for (const item of custody) add(`custody.${item.contract}.${item.asset}`,
    BigInt(item.balance) === 0n ? "PASS" : "CRITICAL", `${item.balance} base units held`);
  for (const item of ownership) add(`ownership.${item.contract}.pending`,
    item.pendingOwner === ethers.ZeroAddress ? "PASS" : "WARNING",
    item.pendingOwner === ethers.ZeroAddress ? "no pending ownership transfer" : `pending owner ${item.pendingOwner}`);
  const counts = Object.fromEntries(["PASS", "WARNING", "CRITICAL"].map(status =>
    [status.toLowerCase(), checks.filter(check => check.status === status).length]));
  return { schemaVersion: 1, checkedAt, network: { chainId: 97, latestBlock: Number(block.number), blockAgeSeconds: age },
    status: counts.critical ? "CRITICAL" : counts.warning ? "WARNING" : "HEALTHY", counts, checks };
}

export async function monitorBscTestnet({ provider, deployment, checkedAt = new Date().toISOString(), maxBlockAgeSeconds = 180 }) {
  const network = await provider.getNetwork();
  if (BigInt(network.chainId) !== 97n) throw new Error(`Refusing monitoring on chain ${network.chainId}; expected BSC testnet 97.`);
  const latest = await provider.getBlock("latest");
  if (!latest) throw new Error("Latest block is unavailable.");
  let validation = null, validationError = null;
  try { validation = await validateBscTestnet({ provider, deployment }); }
  catch (error) { validationError = error.message; }

  const monitored = ["executionRouter", "nativeRouter", "autoRouter"]
    .filter(name => ethers.isAddress(deployment?.contracts?.[name]?.address));
  const tokens = ["lqc", "mockUsdt", "wbnb"].filter(name => ethers.isAddress(deployment?.contracts?.[name]?.address));
  const custody = [];
  for (const contract of monitored) {
    const holder = deployment.contracts[contract].address;
    custody.push({ contract, asset: "BNB", balance: (await provider.getBalance(holder)).toString() });
    for (const token of tokens) {
      const erc20 = new ethers.Contract(deployment.contracts[token].address, BALANCE_ABI, provider);
      custody.push({ contract, asset: token, balance: (await erc20.balanceOf(holder)).toString() });
    }
  }
  const ownership = [];
  for (const contract of ["dexRegistry", "riskRegistry", "gasCostOracle"]) {
    const address = deployment?.contracts?.[contract]?.address;
    if (!ethers.isAddress(address)) continue;
    const owned = new ethers.Contract(address, OWNABLE_ABI, provider);
    ownership.push({ contract, owner: await owned.owner(), pendingOwner: await owned.pendingOwner() });
  }
  return buildMonitoringReport({ checkedAt, block: latest, maxBlockAgeSeconds, validation, validationError, custody, ownership });
}

async function main() {
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL;
  if (!rpcUrl) throw new Error("Set BSC_TESTNET_RPC_URL. Never commit RPC credentials or private keys.");
  const root = path.resolve(import.meta.dirname, "..");
  const deploymentPath = path.resolve(process.env.DEPLOYMENT_FILE || path.join(root, "deployments/bsc-testnet-97.json"));
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const maxBlockAgeSeconds = Number(process.env.MONITOR_MAX_BLOCK_AGE_SECONDS || 180);
  if (!Number.isInteger(maxBlockAgeSeconds) || maxBlockAgeSeconds < 30 || maxBlockAgeSeconds > 3600) {
    throw new Error("MONITOR_MAX_BLOCK_AGE_SECONDS must be an integer from 30 to 3600.");
  }
  const report = await monitorBscTestnet({ provider: new ethers.JsonRpcProvider(rpcUrl), deployment, maxBlockAgeSeconds });
  console.log(JSON.stringify({ deploymentPath, ...report }, null, 2));
  if (report.status === "CRITICAL") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
