import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";

const CHAIN_ID = 97n;
const DEFAULT_RESERVE = "0.3";
const DEFAULT_MAX_SPEND = "1.0";

export function validateFuturesPreflightConfig(env) {
  if (!env.BSC_TESTNET_RPC_URL) throw new Error("BSC_TESTNET_RPC_URL is required.");
  if (!ethers.isAddress(env.FUTURES_DEPLOYER_ADDRESS || "")) {
    throw new Error("FUTURES_DEPLOYER_ADDRESS must be a valid BSC testnet address.");
  }
  if (!ethers.isAddress(env.FUTURES_OWNER_ADDRESS || "")) {
    throw new Error("FUTURES_OWNER_ADDRESS must be a valid governance address.");
  }
  const deployer = ethers.getAddress(env.FUTURES_DEPLOYER_ADDRESS);
  const owner = ethers.getAddress(env.FUTURES_OWNER_ADDRESS);
  if (deployer === owner && env.ALLOW_FUTURES_DEPLOYER_AS_OWNER !== "true") {
    throw new Error("Deployer and Futures owner must be separated unless temporary bootstrap is explicitly allowed.");
  }
  const reserve = ethers.parseEther(env.FUTURES_MIN_TBNB_RESERVE || DEFAULT_RESERVE);
  const maxSpend = ethers.parseEther(env.FUTURES_MAX_DEPLOYMENT_SPEND || DEFAULT_MAX_SPEND);
  if (reserve < ethers.parseEther("0.3")) throw new Error("Futures reserve cannot be below 0.3 tBNB.");
  if (maxSpend <= 0n || maxSpend > ethers.parseEther("1.0")) {
    throw new Error("Futures deployment spend cap must be greater than zero and at most 1.0 tBNB.");
  }
  if (env.DEPLOYER_PRIVATE_KEY) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(env.DEPLOYER_PRIVATE_KEY)) throw new Error("Invalid runtime deployer key.");
    if (new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY).address !== deployer) {
      throw new Error("Runtime deployer key does not match FUTURES_DEPLOYER_ADDRESS.");
    }
  }
  return { deployer, owner, reserve, maxSpend };
}

export function assertFuturesBudget(balance, estimatedCost, config) {
  if (estimatedCost > config.maxSpend) throw new Error("Estimated Futures deployment cost exceeds the 1.0 tBNB spend cap.");
  if (balance < estimatedCost + config.reserve) throw new Error("Deployer balance cannot cover deployment while preserving the 0.3 tBNB reserve.");
  return balance - estimatedCost;
}

const root = path.resolve(import.meta.dirname, "..");
function artifact(source, name) {
  return JSON.parse(fs.readFileSync(path.join(root, "artifacts/contracts", source, `${name}.json`)));
}

export async function runFuturesTestnetPreflight(env, provider = new ethers.JsonRpcProvider(env.BSC_TESTNET_RPC_URL)) {
  const config = validateFuturesPreflightConfig(env);
  const network = await provider.getNetwork();
  if (network.chainId !== CHAIN_ID) throw new Error("Refusing Futures deployment: expected BSC Testnet chain 97.");
  const balance = await provider.getBalance(config.deployer);
  const nonce = await provider.getTransactionCount(config.deployer, "pending");
  const registryAddress = ethers.getCreateAddress({ from: config.deployer, nonce });
  const vaultAddress = ethers.getCreateAddress({ from: config.deployer, nonce: nonce + 1 });
  const oracleAddress = ethers.getCreateAddress({ from: config.deployer, nonce: nonce + 2 });
  const engineAddress = ethers.getCreateAddress({ from: config.deployer, nonce: nonce + 3 });

  const specs = [
    ["registry", "futures/LQCFuturesMarketRegistry.sol", "LQCFuturesMarketRegistry", [config.owner]],
    ["vault", "futures/LQCFuturesVault.sol", "LQCFuturesVault", [config.owner]],
    ["oracle", "futures/mocks/MockLQCFuturesOracle.sol", "MockLQCFuturesOracle", []],
    ["engine", "futures/LQCPerpEngine.sol", "LQCPerpEngine", [registryAddress, vaultAddress]]
  ];
  const estimates = {};
  let deploymentGas = 0n;
  for (const [label, source, name, args] of specs) {
    const a = artifact(source, name);
    const tx = await new ethers.ContractFactory(a.abi, a.bytecode).getDeployTransaction(...args);
    const gas = await provider.estimateGas({ from: config.deployer, data: tx.data });
    estimates[label] = gas;
    deploymentGas += gas;
  }
  const configurationGas = 150000n; // Vault.setEngine plus safety margin.
  const fee = await provider.getFeeData();
  const gasPrice = fee.maxFeePerGas || fee.gasPrice;
  if (!gasPrice || gasPrice <= 0n) throw new Error("Could not resolve BSC testnet gas price.");
  const estimatedCost = (deploymentGas + configurationGas) * gasPrice;
  const remaining = assertFuturesBudget(balance, estimatedCost, config);
  return {
    status: "READY_NO_TRANSACTIONS_SENT", chainId: Number(network.chainId),
    deployer: config.deployer, owner: config.owner,
    balanceTbnb: ethers.formatEther(balance), estimatedCostTbnb: ethers.formatEther(estimatedCost),
    reserveTbnb: ethers.formatEther(config.reserve), estimatedRemainingTbnb: ethers.formatEther(remaining),
    predictedContracts: { registry: registryAddress, vault: vaultAddress, oracle: oracleAddress, engine: engineAddress },
    gas: { ...Object.fromEntries(Object.entries(estimates).map(([k,v]) => [k, v.toString()])), configuration: configurationGas.toString() }
  };
}

async function main() {
  const result = await runFuturesTestnetPreflight(process.env);
  console.log(JSON.stringify(result, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
