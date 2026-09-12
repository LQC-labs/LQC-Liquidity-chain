import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { ethers } from "ethers";
import { PANCAKE_BSC_TESTNET, assertBscTestnetChain, assertPancakeV3PoolsExist } from "./validate-bsc-testnet.mjs";

const SAFE_INTERFACE = new ethers.Interface([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)"
]);

const positive = (name, value) => {
  let parsed;
  try { parsed = ethers.parseUnits(String(value), 18); } catch { throw new Error(`${name} must be a valid non-negative 18-decimal amount.`); }
  if (parsed <= 0n) throw new Error(`${name} must be positive.`);
  return parsed;
};
const nonNegative = (name, value) => {
  let parsed;
  try { parsed = ethers.parseUnits(String(value), 18); }
  catch { throw new Error(`${name} must be a valid non-negative 18-decimal amount.`); }
  return parsed;
};

const boundedInteger = (name, value, minimum, maximum) => {
  let parsed;
  try { parsed = BigInt(value); } catch { throw new Error(`${name} must be an integer.`); }
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
};

export async function assertSafeMultisig(provider, address, label, minimumOwners, minimumThreshold) {
  let owners, threshold;
  try {
    const ownersResult = await provider.call({ to: address, data: SAFE_INTERFACE.encodeFunctionData("getOwners") });
    const thresholdResult = await provider.call({ to: address, data: SAFE_INTERFACE.encodeFunctionData("getThreshold") });
    [owners] = SAFE_INTERFACE.decodeFunctionResult("getOwners", ownersResult);
    [threshold] = SAFE_INTERFACE.decodeFunctionResult("getThreshold", thresholdResult);
  } catch {
    throw new Error(`${label} must expose the Safe getOwners/getThreshold interface.`);
  }
  const normalized = owners.map(owner => ethers.getAddress(owner));
  if (normalized.some(owner => owner === ethers.ZeroAddress) || new Set(normalized).size !== normalized.length) {
    throw new Error(`${label} contains a zero or duplicate signer.`);
  }
  if (BigInt(normalized.length) < minimumOwners || threshold < minimumThreshold || threshold > BigInt(normalized.length)) {
    throw new Error(`${label} does not satisfy the required ${minimumThreshold}-of-${minimumOwners} minimum Safe policy.`);
  }
  return { owners: normalized, threshold };
}

export function assertReviewedSourceCommit(sourceCommit, currentCommit, dirty = false) {
  if (!/^[0-9a-fA-F]{40}$/.test(sourceCommit || "")) {
    throw new Error("SOURCE_COMMIT must be the full 40-character reviewed Git commit SHA.");
  }
  if (!/^[0-9a-fA-F]{40}$/.test(currentCommit || "") || sourceCommit.toLowerCase() !== currentCommit.toLowerCase()) {
    throw new Error("SOURCE_COMMIT does not match the currently checked-out Git commit.");
  }
  if (dirty) throw new Error("Refusing deployment from a dirty Git worktree; commit and review every source change first.");
  return sourceCommit.toLowerCase();
}

export function readGitSourceState(cwd = path.resolve(import.meta.dirname, "../..")) {
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
  const status = execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], { cwd, encoding: "utf8" });
  return { commit, dirty: status.trim().length > 0 };
}

export function validateTestnetDeploymentConfig(env) {
  if (!env.BSC_TESTNET_RPC_URL) throw new Error("BSC_TESTNET_RPC_URL is required.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(env.DEPLOYER_PRIVATE_KEY || "")) {
    throw new Error("DEPLOYER_PRIVATE_KEY must be a 32-byte hex key supplied only at runtime.");
  }
  if (!/^[0-9a-fA-F]{40}$/.test(env.SOURCE_COMMIT || "")) {
    throw new Error("SOURCE_COMMIT must be the full 40-character reviewed Git commit SHA.");
  }
  assertBscTestnetChain(BigInt(env.EXPECTED_CHAIN_ID || "97"));
  if (!ethers.isAddress(env.WBNB_ADDRESS)) throw new Error("WBNB_ADDRESS must be a valid address.");
  if (!ethers.isAddress(env.FACTORY_OWNER)) {
    throw new Error("FACTORY_OWNER is required and must be the reviewed testnet governance or multisig address.");
  }
  if (!ethers.isAddress(env.RISK_ADMIN)) {
    throw new Error("RISK_ADMIN is required and must be the reviewed testnet risk multisig address.");
  }
  if (!ethers.isAddress(env.GUARDIAN_ADDRESS)) {
    throw new Error("GUARDIAN_ADDRESS is required and must be the reviewed emergency multisig address.");
  }
  if (!ethers.isAddress(env.TREASURY_ADDRESS)) {
    throw new Error("TREASURY_ADDRESS is required and must be the reviewed treasury multisig address.");
  }
  const walletAddress = new ethers.Wallet(env.DEPLOYER_PRIVATE_KEY).address;
  const owner = ethers.getAddress(env.FACTORY_OWNER);
  const riskAdmin = ethers.getAddress(env.RISK_ADMIN);
  const guardian = ethers.getAddress(env.GUARDIAN_ADDRESS);
  const treasury = ethers.getAddress(env.TREASURY_ADDRESS);
  const separatedRoles = env.ALLOW_SHARED_RISK_ADMIN === "true" && riskAdmin === owner
    ? [owner, guardian, treasury]
    : [owner, riskAdmin, guardian, treasury];
  if (new Set(separatedRoles).size !== separatedRoles.length) {
    throw new Error("Governance, risk, guardian, and treasury role separation is required; all addresses must be separated.");
  }
  if ((guardian === walletAddress || treasury === walletAddress) && env.ALLOW_DEPLOYER_OPERATIONAL_ROLE !== "true") {
    throw new Error("Deployer must not control guardian or treasury roles.");
  }
  if (owner === walletAddress && env.ALLOW_DEPLOYER_AS_OWNER !== "true") {
    throw new Error("FACTORY_OWNER must differ from the deployer unless ALLOW_DEPLOYER_AS_OWNER=true is explicitly set for a temporary testnet bootstrap.");
  }
  if (riskAdmin === walletAddress && env.ALLOW_DEPLOYER_AS_RISK_ADMIN !== "true") {
    throw new Error("RISK_ADMIN must differ from the deployer unless ALLOW_DEPLOYER_AS_RISK_ADMIN=true is explicitly set for a temporary testnet bootstrap.");
  }
  if (riskAdmin === owner && env.ALLOW_SHARED_RISK_ADMIN !== "true") {
    throw new Error("RISK_ADMIN must differ from FACTORY_OWNER to preserve role separation.");
  }
  const governanceMinimumOwners = boundedInteger("GOVERNANCE_MIN_OWNERS", env.GOVERNANCE_MIN_OWNERS || "7", 3n, 20n);
  const governanceMinimumThreshold = boundedInteger("GOVERNANCE_MIN_THRESHOLD", env.GOVERNANCE_MIN_THRESHOLD || "4", 2n, governanceMinimumOwners);
  const riskMinimumOwners = boundedInteger("RISK_MIN_OWNERS", env.RISK_MIN_OWNERS || "5", 3n, 20n);
  const riskMinimumThreshold = boundedInteger("RISK_MIN_THRESHOLD", env.RISK_MIN_THRESHOLD || "3", 2n, riskMinimumOwners);
  const guardianMinimumOwners = boundedInteger("GUARDIAN_MIN_OWNERS", env.GUARDIAN_MIN_OWNERS || "5", 3n, 20n);
  const guardianMinimumThreshold = boundedInteger("GUARDIAN_MIN_THRESHOLD", env.GUARDIAN_MIN_THRESHOLD || "3", 2n, guardianMinimumOwners);
  const treasuryMinimumOwners = boundedInteger("TREASURY_MIN_OWNERS", env.TREASURY_MIN_OWNERS || "5", 3n, 20n);
  const treasuryMinimumThreshold = boundedInteger("TREASURY_MIN_THRESHOLD", env.TREASURY_MIN_THRESHOLD || "3", 2n, treasuryMinimumOwners);
  const delay = BigInt(env.TIMELOCK_DELAY || "3600");
  if (delay < 3600n || delay > 604800n) throw new Error("TIMELOCK_DELAY must be between 3600 and 604800 seconds.");

  const vaultDepositCap = positive("TEST_VAULT_DEPOSIT_CAP", env.TEST_VAULT_DEPOSIT_CAP || "100000");
  const vaultStrategyCap = nonNegative("TEST_VAULT_STRATEGY_CAP", env.TEST_VAULT_STRATEGY_CAP || "0");
  let vaultMaxLossBps;
  try { vaultMaxLossBps = BigInt(env.TEST_VAULT_MAX_LOSS_BPS || "100"); }
  catch { throw new Error("TEST_VAULT_MAX_LOSS_BPS must be an integer from 0 to 2000."); }
  if (vaultStrategyCap > vaultDepositCap) {
    throw new Error("TEST_VAULT_STRATEGY_CAP cannot exceed TEST_VAULT_DEPOSIT_CAP.");
  }
  if (vaultMaxLossBps < 0n || vaultMaxLossBps > 2000n) {
    throw new Error("TEST_VAULT_MAX_LOSS_BPS must be between 0 and 2000.");
  }

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
  if (vaultDepositCap > usdtSupply) throw new Error("TEST_VAULT_DEPOSIT_CAP cannot exceed the mock USDT supply.");
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
  const maxV3Hops = Number(env.PANCAKE_V3_MAX_HOPS || "3");
  if (!Number.isInteger(maxV3Hops) || maxV3Hops < 1 || maxV3Hops > 3) {
    throw new Error("PANCAKE_V3_MAX_HOPS must be an integer from 1 to 3.");
  }
  const canonicalV3FeeTiers = new Set([100, 500, 2500, 10000]);
  let allowedV3FeeTiers;
  try { allowedV3FeeTiers = JSON.parse(env.PANCAKE_V3_ALLOWED_FEE_TIERS || "[100,500,2500,10000]"); }
  catch { throw new Error("PANCAKE_V3_ALLOWED_FEE_TIERS must be valid JSON."); }
  if (!Array.isArray(allowedV3FeeTiers) || allowedV3FeeTiers.length === 0 ||
      new Set(allowedV3FeeTiers.map(Number)).size !== allowedV3FeeTiers.length ||
      allowedV3FeeTiers.some(fee => !Number.isInteger(Number(fee)) || !canonicalV3FeeTiers.has(Number(fee)))) {
    throw new Error("PANCAKE_V3_ALLOWED_FEE_TIERS must be a unique, non-empty subset of 100, 500, 2500, and 10000.");
  }
  let v3Pools = [];
  try { v3Pools = JSON.parse(env.PANCAKE_V3_ALLOWED_POOLS || "[]"); }
  catch { throw new Error("PANCAKE_V3_ALLOWED_POOLS must be valid JSON."); }
  if (!Array.isArray(v3Pools) || (v3Router && v3Pools.length === 0)) {
    throw new Error("PancakeSwap V3 requires at least one reviewed allowed pool.");
  }
  return { walletAddress, owner, riskAdmin, guardian, treasury, sourceCommit: env.SOURCE_COMMIT.toLowerCase(), delay, bnbLiquidity, gasReserve,
    vaultDepositCap, vaultStrategyCap, vaultMaxLossBps, v3Pools,
    governanceMinimumOwners, governanceMinimumThreshold, riskMinimumOwners, riskMinimumThreshold,
    guardianMinimumOwners, guardianMinimumThreshold, treasuryMinimumOwners, treasuryMinimumThreshold };
}

export async function runTestnetPreflight(env, provider = new ethers.JsonRpcProvider(env.BSC_TESTNET_RPC_URL), gitState = null) {
  const config = validateTestnetDeploymentConfig(env);
  if (gitState) assertReviewedSourceCommit(config.sourceCommit, gitState.commit, gitState.dirty);
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
  const guardianCode = await provider.getCode(config.guardian);
  const treasuryCode = await provider.getCode(config.treasury);
  if (guardianCode === "0x" || treasuryCode === "0x") {
    throw new Error("GUARDIAN_ADDRESS and TREASURY_ADDRESS must be deployed multisigs.");
  }
  let governanceSafe = null;
  let riskSafe = null;
  let guardianSafe = null;
  let treasurySafe = null;
  if (ownerCode !== "0x") {
    governanceSafe = await assertSafeMultisig(provider, config.owner, "FACTORY_OWNER",
      config.governanceMinimumOwners, config.governanceMinimumThreshold);
  }
  if (riskAdminCode !== "0x") {
    riskSafe = await assertSafeMultisig(provider, config.riskAdmin, "RISK_ADMIN",
      config.riskMinimumOwners, config.riskMinimumThreshold);
  }
  guardianSafe = await assertSafeMultisig(provider, config.guardian, "GUARDIAN_ADDRESS",
    config.guardianMinimumOwners, config.guardianMinimumThreshold);
  treasurySafe = await assertSafeMultisig(provider, config.treasury, "TREASURY_ADDRESS",
    config.treasuryMinimumOwners, config.treasuryMinimumThreshold);
  const named = { governanceOwner: config.owner, riskAdmin: config.riskAdmin, guardian: config.guardian,
    treasury: config.treasury, wbnb: env.WBNB_ADDRESS };
  if (env.PANCAKE_V2_ROUTER_ADDRESS) named.pancakeV2Router = env.PANCAKE_V2_ROUTER_ADDRESS;
  if (env.PANCAKE_V3_ROUTER_ADDRESS) {
    named.pancakeV3Router = env.PANCAKE_V3_ROUTER_ADDRESS;
    named.pancakeV3Quoter = env.PANCAKE_V3_QUOTER_ADDRESS;
  }
  for (const [name, address] of Object.entries(named)) {
    if (!["governanceOwner", "riskAdmin", "guardian", "treasury"].includes(name) && await provider.getCode(address) === "0x") {
      throw new Error(`${name} has no contract bytecode on BSC testnet.`);
    }
  }
  if (env.PANCAKE_V3_ROUTER_ADDRESS) await assertPancakeV3PoolsExist(provider, config.v3Pools);
  return { chainId: Number(network.chainId), sourceCommit: config.sourceCommit, owner: config.owner, riskAdmin: config.riskAdmin,
    guardian: config.guardian, treasury: config.treasury, governanceSafe, riskSafe, guardianSafe, treasurySafe,
    checkedContracts: Object.keys(named) };
}

async function main() {
  const result = await runTestnetPreflight(process.env, undefined, readGitSourceState());
  console.log(JSON.stringify({ status: "ready", ...result }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
