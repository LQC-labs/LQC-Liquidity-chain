import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { PANCAKE_BSC_TESTNET, assertBscTestnetChain } from "./validate-bsc-testnet.mjs";

const DEFAULT_WBNB = "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd";
const roleNames = ["FACTORY_OWNER", "RISK_ADMIN", "GUARDIAN_ADDRESS", "TREASURY_ADDRESS"];
const defaultRpcUrls = ["https://bsc-testnet.drpc.org", "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
  "https://data-seed-prebsc-2-s1.binance.org:8545", "https://data-seed-prebsc-1-s2.binance.org:8545"];

export function createReadinessProvider(env) {
  const urls = [...new Set([env.BSC_TESTNET_RPC_URL, ...defaultRpcUrls].filter(Boolean))];
  const providers = urls.map(url => {
    const request = new ethers.FetchRequest(url); request.timeout = Number(env.RPC_TIMEOUT_MS || "15000");
    return new ethers.JsonRpcProvider(request, 97, { staticNetwork: true });
  });
  const run = async (method, ...args) => {
    let lastError;
    for (const provider of providers) {
      try { return await provider[method](...args); }
      catch (error) { lastError = error; }
    }
    throw lastError || new Error(`No RPC provider could complete ${method}`);
  };
  return {
    getNetwork: () => run("getNetwork"), getBalance: address => run("getBalance", address),
    getCode: address => run("getCode", address), call: transaction => run("call", transaction),
    resolveName: name => ethers.isAddress(name) ? Promise.resolve(ethers.getAddress(name)) : run("resolveName", name)
  };
}

export async function inspectTestnetReadiness(env, provider = null) {
  provider ||= createReadinessProvider(env);
  const checks = [], add = (name, pass, detail) => checks.push({ name, pass, detail });
  const network = await provider.getNetwork();
  try { assertBscTestnetChain(network.chainId); add("chain", true, "BSC Testnet chain 97"); }
  catch (error) { add("chain", false, error.message); }

  const deployer = env.DEPLOYER_ADDRESS;
  if (!ethers.isAddress(deployer)) add("deployer", false, "DEPLOYER_ADDRESS is missing or invalid");
  else {
    const balance = await provider.getBalance(deployer), required = ethers.parseEther(env.REQUIRED_TBNB || "1");
    add("deployer", balance >= required, `${ethers.formatEther(balance)} tBNB available; ${ethers.formatEther(required)} required`);
  }

  const contracts = {
    WBNB_ADDRESS: env.WBNB_ADDRESS || DEFAULT_WBNB,
    TEST_LQC_ADDRESS: env.TEST_LQC_ADDRESS,
    PANCAKE_V2_ROUTER_ADDRESS: PANCAKE_BSC_TESTNET.v2Router,
    PANCAKE_V3_ROUTER_ADDRESS: PANCAKE_BSC_TESTNET.v3Router,
    PANCAKE_V3_QUOTER_ADDRESS: PANCAKE_BSC_TESTNET.v3Quoter,
    PANCAKE_V3_FACTORY_ADDRESS: PANCAKE_BSC_TESTNET.v3Factory
  };
  for (const [name, address] of Object.entries(contracts)) {
    if (!ethers.isAddress(address)) { add(name, false, "missing or invalid address"); continue; }
    add(name, await provider.getCode(address) !== "0x", address);
  }

  const roles = roleNames.map(name => [name, env[name]]);
  for (const [name, address] of roles) add(name, ethers.isAddress(address), ethers.isAddress(address) ? address : "not configured");
  const configuredRoles = roles.filter(([, address]) => ethers.isAddress(address)).map(([, address]) => ethers.getAddress(address));
  if (configuredRoles.length === roleNames.length) add("roleSeparation", new Set(configuredRoles).size === configuredRoles.length,
    new Set(configuredRoles).size === configuredRoles.length ? "four distinct role addresses" : "role addresses must be distinct");
  else add("roleSeparation", false, "configure all four role addresses first");

  const configuredV3Fee = Number(env.PANCAKE_V3_FEE || "2500");
  const validPilotFee = Number.isInteger(configuredV3Fee) && configuredV3Fee === 2500;
  add("pancakeV3Fee", validPilotFee,
    validPilotFee ? "2500 (0.25%) pilot fee is pinned" : "PANCAKE_V3_FEE must be exactly 2500 for the testnet pilot");
  let pool = ethers.ZeroAddress;
  if (validPilotFee && ethers.isAddress(contracts.TEST_LQC_ADDRESS) && ethers.isAddress(contracts.WBNB_ADDRESS)) {
    const factory = new ethers.Contract(PANCAKE_BSC_TESTNET.v3Factory,
      ["function getPool(address,address,uint24) view returns(address)"], provider);
    pool = await factory.getPool(contracts.TEST_LQC_ADDRESS, contracts.WBNB_ADDRESS, configuredV3Fee);
  }
  add("pancakeV3Pool", pool !== ethers.ZeroAddress, pool === ethers.ZeroAddress ? "tLQC/WBNB 0.25% pool not created" : pool);
  return { status: checks.every(check => check.pass) ? "ready" : "blocked", chainId: Number(network.chainId), checks };
}

async function main() {
  if (!process.env.BSC_TESTNET_RPC_URL) throw new Error("BSC_TESTNET_RPC_URL is required");
  const result = await inspectTestnetReadiness(process.env);
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "ready") process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
