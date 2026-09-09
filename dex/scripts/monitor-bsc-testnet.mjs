import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { validateBscTestnet } from "./validate-bsc-testnet.mjs";

const BALANCE_ABI = ["function balanceOf(address) view returns(uint256)"];
const OWNABLE_ABI = ["function owner() view returns(address)", "function pendingOwner() view returns(address)"];

export function buildMonitoringReport({ checkedAt, block, maxBlockAgeSeconds, validation, validationError,
  custody, ownership, vaultState = null }) {
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
  if (vaultState) {
    const accounted = BigInt(vaultState.accountedAssets), debt = BigInt(vaultState.strategyDebt);
    const cap = BigInt(vaultState.strategyCap), idle = BigInt(vaultState.idleBalance);
    const managed = BigInt(vaultState.adapterManagedAssets), adapterBalance = BigInt(vaultState.adapterBalance);
    const solventAccounting = debt <= accounted;
    add("vault.solvency", vaultState.insolvent || !solventAccounting ? "CRITICAL" : "PASS",
      vaultState.insolvent ? "vault reports insolvency" : solventAccounting ? "vault accounting is solvent" : "strategy debt exceeds accounted assets");
    add("vault.strategy_exposure", debt <= cap ? "PASS" : "CRITICAL", `${debt} strategy debt (cap ${cap})`);
    add("vault.idle_backing", solventAccounting && idle >= accounted - debt ? "PASS" : "CRITICAL",
      `${idle} idle base units backing ${solventAccounting ? accounted - debt : 0n} accounted idle units`);
    add("vault.adapter_backing", managed === debt && adapterBalance >= managed ? "PASS" : "CRITICAL",
      `${adapterBalance} adapter base units backing ${managed} managed units and ${debt} vault debt`);
    add("vault.deposit_status", vaultState.depositsPaused ? "WARNING" : "PASS",
      vaultState.depositsPaused ? "vault deposits are paused" : "vault deposits are enabled");
    add("vault.allocation_status", vaultState.allocationsPaused ? "WARNING" : "PASS",
      vaultState.allocationsPaused ? "vault allocations are paused" : "vault allocations are enabled");
  }
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
  for (const contract of ["dexRegistry", "riskRegistry", "gasCostOracle", "liquidityVault"]) {
    const address = deployment?.contracts?.[contract]?.address;
    if (!ethers.isAddress(address)) continue;
    const owned = new ethers.Contract(address, OWNABLE_ABI, provider);
    ownership.push({ contract, owner: await owned.owner(), pendingOwner: await owned.pendingOwner() });
  }
  let vaultState = null;
  const vaultAddress = deployment?.contracts?.liquidityVault?.address;
  const adapterAddress = deployment?.contracts?.idleStrategyAdapter?.address;
  const assetAddress = deployment?.contracts?.liquidityVault?.asset;
  if (ethers.isAddress(vaultAddress) && ethers.isAddress(adapterAddress) && ethers.isAddress(assetAddress)) {
    const vault = new ethers.Contract(vaultAddress, [
      "function accountedAssets() view returns(uint256)", "function strategyDebt() view returns(uint256)",
      "function strategyCap() view returns(uint256)", "function depositsPaused() view returns(bool)",
      "function allocationsPaused() view returns(bool)", "function isInsolvent() view returns(bool)"
    ], provider);
    const adapter = new ethers.Contract(adapterAddress, ["function totalManagedAssets() view returns(uint256)"], provider);
    const asset = new ethers.Contract(assetAddress, BALANCE_ABI, provider);
    const values = await Promise.all([
      vault.accountedAssets(), vault.strategyDebt(), vault.strategyCap(), vault.depositsPaused(),
      vault.allocationsPaused(), vault.isInsolvent(), adapter.totalManagedAssets(),
      asset.balanceOf(vaultAddress), asset.balanceOf(adapterAddress)
    ]);
    vaultState = { accountedAssets: values[0], strategyDebt: values[1], strategyCap: values[2],
      depositsPaused: values[3], allocationsPaused: values[4], insolvent: values[5],
      adapterManagedAssets: values[6], idleBalance: values[7], adapterBalance: values[8] };
  }
  return buildMonitoringReport({ checkedAt, block: latest, maxBlockAgeSeconds, validation, validationError,
    custody, ownership, vaultState });
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
