import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { PANCAKE_BSC_TESTNET, assertBscTestnetChain } from "./validate-bsc-testnet.mjs";

const positive = (name, value) => {
  let parsed;
  try { parsed = ethers.parseUnits(String(value), 18); } catch { throw new Error(`${name} must be a valid non-negative 18-decimal amount.`); }
  if (parsed <= 0n) throw new Error(`${name} must be positive.`);
  return parsed;
};

export function validateTestnetDeploymentConfig(env) {
  if (!env.BSC_TESTNET_RPC_URL) throw new Error("BSC_TESTNET_RPC_URL is required.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(env.DEPLOYER_PRIVATE_KEY || "")) {
    throw new Error("DEPLOYER_PRIVATE_KEY must be a 32-byte hex key supplied only at runtime.");
  }
  assertBscTestnetChain(BigInt(env.EXPECTED_CHAIN_ID || "97"));
  if (!ethers.isAddress(env.WBNB_ADDRESS)) throw new Error("WBNB_ADDRESS must be a valid address.");
  if (!ethers.isAddress(env.FACTORY_OWNER)) {
    throw new Error("FACTORY_OWNER is required and must be the reviewed testnet governance or multisig address.");
  }
  if (!ethers.isAddress(env.RISK_ADMIN)) {
    throw new Error("RISK_ADMIN is required and must be the reviewed testnet risk multisig address.");
  }
  const walletAddress = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY).address;
  const owner = ethers.getAddress(env.FACTORY_OWNER);
  const riskAdmin = ethers.getAddress(env.RISK_ADMIN);
  if (owner === walletAddress && env.ALLOW_DEPLOYER_AS_OWNER !== "true") {
    throw new Error("FACTORY_OWNER must differ from the deployer unless ALLOW_DEPLOYER_AS_OWNER=true is explicitly set for a temporary testnet bootstrap.");
  }
  if (riskAdmin === walletAddress && env.ALLOW_DEPLOYER_AS_RISK_ADMIN !== "true") {
    throw new Error("RISK_ADMIN must differ from the deployer unless ALLOW_DEPLOYER_AS_RISK_ADMIN=true is explicitly set for a temporary testnet bootstrap.");
  }
  if (riskAdmin === owner && env.ALLOW_SHARED_RISK_ADMIN !== "true") {
    throw new Error("RISK_ADMIN must differ from FACTORY_OWNER to preserve role separation.");
  }
  const delay = BigInt(env.TIMELOCK_DELAY || "3600");
  if (delay < 3600n || delay > 604800n) throw new Error("TIMELOCK_DELAY must be between 3600 and 604800 seconds.");

  const limits = [
    ["TEST_LQC", env.TEST_LQC_MAX_TX || "10000", env.TEST_LQC_MAX_DAY || "100000"],
    ["TEST_USDT", env.TEST_USDT_MAX_TX || "10000", env.TEST_USDT_MAX_DAY || "100000"],
    ["TEST_WBNB", env.TEST_WBNB_MAX_TX || "10", env.TEST_WBNB_MAX_DAY || "100"]
  ];
  for (const [name, perTxRaw, perDayRaw] of limits) {
    const perTx = positive(`${name}_MAX_TX`, perTxRaw);
    const perDay = positive(`${name}_MAX_DAY`, perDayRaw);
    if (perDay < perTx) throw new Error(`${name}_MAX_DAY must be greater than or equal to ${name}_MAX_TX.`);
  }

  const lqcSupply = positive("TEST_LQC_SUPPLY", env.TEST_LQC_SUPPLY || "1000000");
  const usdtSupply = positive("TEST_USDT_SUPPLY", env.TEST_USDT_SUPPLY || "1000000");
  const lqcLiquidity = positive("LQC_USDT_LIQUIDITY_LQC", env.LQC_USDT_LIQUIDITY_LQC || "100000") +
    positive("LQC_BNB_LIQUIDITY_LQC", env.LQC_BNB_LIQUIDITY_LQC || "100000");
  const usdtLiquidity = positive("LQC_USDT_LIQUIDITY_USDT", env.LQC_USDT_LIQUIDITY_USDT || "100000");
  const bnbLiquidity = positive("LQC_BNB_LIQUIDITY_BNB", env.LQC_BNB_LIQUIDITY_BNB || "10");
  const gasReserve = positive("MIN_DEPLOYER_TBNB_RESERVE", env.MIN_DEPLOYER_TBNB_RESERVE || "0.5");
  if (lqcLiquidity > lqcSupply) throw new Error("Configured LQC liquidity exceeds the test-token supply.");
  if (usdtLiquidity > usdtSupply) throw new Error("Configured USDT liquidity exceeds the test-token supply.");

  const v2 = env.PANCAKE_V2_ROUTER_ADDRESS || "";
  if (v2 && (!ethers.isAddress(v2) || ethers.getAddress(v2) !== PANCAKE_BSC_TESTNET.v2Router)) {
    throw new Error("PANCAKE_V2_ROUTER_ADDRESS is not the pinned BSC testnet router.");
  }
  const v3Router = env.PANCAKE_V3_ROUTER_ADDRESS || "";
  const v3Quoter = env.PANCAKE_V3_QUOTER_ADDRESS || "";
  if (Boolean(v3Router) !== Boolean(v3Quoter)) throw new Error("Set both PancakeSwap V3 router and quoter or neither.");
  if (v3Router && (!ethers.isAddress(v3Router) || !ethers.isAddress(v3Quoter) ||
      ethers.getAddress(v3Router) !== PANCAKE_BSC_TESTNET.v3Router ||
      ethers.getAddress(v3Quoter) !== PANCAKE_BSC_TESTNET.v3Quoter)) {
    throw new Error("PancakeSwap V3 addresses do not match the pinned BSC testnet endpoints.");
  }
  return { walletAddress, owner, riskAdmin, delay, bnbLiquidity, gasReserve };
}

export async function runTestnetPreflight(env, provider = new ethers.JsonRpcProvider(env.BSC_TESTNET_RPC_URL)) {
  const config = validateTestnetDeploymentConfig(env);
  const network = await provider.getNetwork();
  assertBscTestnetChain(network.chainId);
  const balance = await provider.getBalance(config.walletAddress);
  if (balance < config.bnbLiquidity + config.gasReserve) {
    throw new Error("Deployer tBNB balance is below initial BNB liquidity plus the required deployment-gas reserve.");
  }
  const ownerCode = await provider.getCode(config.owner);
  if (ownerCode === "0x" && env.ALLOW_EOA_OWNER !== "true") {
    throw new Error("FACTORY_OWNER has no contract bytecode; use a deployed multisig or explicitly set ALLOW_EOA_OWNER=true for temporary testnet use.");
  }
  const riskAdminCode = await provider.getCode(config.riskAdmin);
  if (riskAdminCode === "0x" && env.ALLOW_EOA_RISK_ADMIN !== "true") {
    throw new Error("RISK_ADMIN has no contract bytecode; use a deployed risk multisig or explicitly set ALLOW_EOA_RISK_ADMIN=true for temporary testnet use.");
  }
  const named = { governanceOwner: config.owner, riskAdmin: config.riskAdmin, wbnb: env.WBNB_ADDRESS };
  if (env.PANCAKE_V2_ROUTER_ADDRESS) named.pancakeV2Router = env.PANCAKE_V2_ROUTER_ADDRESS;
  if (env.PANCAKE_V3_ROUTER_ADDRESS) {
    named.pancakeV3Router = env.PANCAKE_V3_ROUTER_ADDRESS;
    named.pancakeV3Quoter = env.PANCAKE_V3_QUOTER_ADDRESS;
  }
  for (const [name, address] of Object.entries(named)) {
    if (name !== "governanceOwner" && name !== "riskAdmin" && await provider.getCode(address) === "0x") {
      throw new Error(`${name} has no contract bytecode on BSC testnet.`);
    }
  }
  return { chainId: Number(network.chainId), owner: config.owner, riskAdmin: config.riskAdmin, checkedContracts: Object.keys(named) };
}

async function main() {
  const result = await runTestnetPreflight(process.env);
  console.log(JSON.stringify({ status: "ready", ...result }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
