import { ethers } from "ethers";
import { PANCAKE_BSC_TESTNET, assertBscTestnetChain, assertContractCode } from "./validate-bsc-testnet.mjs";

const {
  BSC_TESTNET_RPC_URL, DEPLOYER_PRIVATE_KEY, FACTORY_OWNER = "", WBNB_ADDRESS,
  PANCAKE_V2_ROUTER_ADDRESS = "", PANCAKE_V3_QUOTER_ADDRESS = "",
  PANCAKE_V3_ROUTER_ADDRESS = "", PANCAKE_V3_ALLOWED_POOLS = "[]",
  LQC_BNB_LIQUIDITY_BNB = "10", DEPLOYMENT_GAS_RESERVE_BNB = "0.2"
} = process.env;

if (!BSC_TESTNET_RPC_URL) throw new Error("BSC_TESTNET_RPC_URL is required.");
if (!DEPLOYER_PRIVATE_KEY) throw new Error("DEPLOYER_PRIVATE_KEY is required.");
if (!ethers.isAddress(WBNB_ADDRESS)) throw new Error("WBNB_ADDRESS must be a valid address.");

let wallet;
try { wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY); }
catch { throw new Error("DEPLOYER_PRIVATE_KEY is not a valid private key."); }
if (FACTORY_OWNER && !ethers.isAddress(FACTORY_OWNER)) throw new Error("FACTORY_OWNER must be a valid address.");

const optionalAddresses = { PANCAKE_V2_ROUTER_ADDRESS, PANCAKE_V3_QUOTER_ADDRESS, PANCAKE_V3_ROUTER_ADDRESS };
for (const [name, address] of Object.entries(optionalAddresses)) {
  if (address && !ethers.isAddress(address)) throw new Error(`${name} must be a valid address.`);
}
if (Boolean(PANCAKE_V3_QUOTER_ADDRESS) !== Boolean(PANCAKE_V3_ROUTER_ADDRESS)) {
  throw new Error("PancakeSwap V3 requires both quoter and router addresses.");
}

let pools;
try { pools = JSON.parse(PANCAKE_V3_ALLOWED_POOLS); }
catch { throw new Error("PANCAKE_V3_ALLOWED_POOLS must be valid JSON."); }
if (!Array.isArray(pools)) throw new Error("PANCAKE_V3_ALLOWED_POOLS must be a JSON array.");
if (PANCAKE_V3_ROUTER_ADDRESS && pools.length === 0) {
  throw new Error("PancakeSwap V3 deployment requires at least one reviewed allowed pool.");
}

const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC_URL);
const network = await provider.getNetwork();
assertBscTestnetChain(network.chainId);
const externalContracts = { wbnb: WBNB_ADDRESS };
if (PANCAKE_V2_ROUTER_ADDRESS) externalContracts.pancakeV2Router = PANCAKE_V2_ROUTER_ADDRESS;
if (PANCAKE_V3_QUOTER_ADDRESS) externalContracts.pancakeV3Quoter = PANCAKE_V3_QUOTER_ADDRESS;
if (PANCAKE_V3_ROUTER_ADDRESS) externalContracts.pancakeV3Router = PANCAKE_V3_ROUTER_ADDRESS;
await assertContractCode(provider, externalContracts);

const reviewed = {
  PANCAKE_V2_ROUTER_ADDRESS: PANCAKE_BSC_TESTNET.v2Router,
  PANCAKE_V3_QUOTER_ADDRESS: PANCAKE_BSC_TESTNET.v3Quoter,
  PANCAKE_V3_ROUTER_ADDRESS: PANCAKE_BSC_TESTNET.v3Router
};
for (const [name, expected] of Object.entries(reviewed)) {
  const actual = optionalAddresses[name];
  if (actual && ethers.getAddress(actual) !== ethers.getAddress(expected)) {
    throw new Error(`${name} differs from the reviewed BSC testnet endpoint.`);
  }
}

const balance = await provider.getBalance(wallet.address);
const required = ethers.parseEther(LQC_BNB_LIQUIDITY_BNB) + ethers.parseEther(DEPLOYMENT_GAS_RESERVE_BNB);
if (balance < required) {
  throw new Error(`Insufficient tBNB: ${ethers.formatEther(balance)} available, ${ethers.formatEther(required)} required.`);
}
console.log(JSON.stringify({ ok: true, network: "BSC Testnet", chainId: Number(network.chainId),
  deployer: wallet.address, owner: FACTORY_OWNER || wallet.address,
  balanceTbnb: ethers.formatEther(balance), requiredTbnb: ethers.formatEther(required),
  checkedContracts: Object.keys(externalContracts), reviewedV3Pools: pools.length }, null, 2));
