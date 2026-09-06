import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const {
  BSC_TESTNET_RPC_URL,
  DEPLOYER_PRIVATE_KEY,
  WBNB_ADDRESS,
  FACTORY_OWNER,
  PANCAKE_V2_ROUTER_ADDRESS = "",
  TEST_LQC_SUPPLY = "1000000",
  TEST_USDT_SUPPLY = "1000000",
  LQC_USDT_LIQUIDITY_LQC = "100000",
  LQC_USDT_LIQUIDITY_USDT = "100000",
  LQC_BNB_LIQUIDITY_LQC = "100000",
  LQC_BNB_LIQUIDITY_BNB = "10",
  EXPECTED_CHAIN_ID = "97"
} = process.env;

if (!BSC_TESTNET_RPC_URL || !DEPLOYER_PRIVATE_KEY || !ethers.isAddress(WBNB_ADDRESS)) {
  throw new Error("Set BSC_TESTNET_RPC_URL, DEPLOYER_PRIVATE_KEY, and a valid WBNB_ADDRESS.");
}

const root = path.resolve(import.meta.dirname, "..");
const load = (source) => {
  const contractName = source.split("/").at(-1);
  return JSON.parse(fs.readFileSync(path.join(root, `artifacts/contracts/${source}.sol/${contractName}.json`)));
};
const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC_URL);
const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
const network = await provider.getNetwork();
if (network.chainId !== BigInt(EXPECTED_CHAIN_ID)) {
  throw new Error(`Refusing deployment: connected chain ${network.chainId}, expected ${EXPECTED_CHAIN_ID}.`);
}
const owner = FACTORY_OWNER || wallet.address;
if (!ethers.isAddress(owner)) throw new Error("FACTORY_OWNER must be a valid address.");
const deploy = async (source, args = []) => {
  const artifact = load(source);
  const contract = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet).deploy(...args);
  await contract.waitForDeployment();
  return contract;
};
const txHash = (contract) => contract.deploymentTransaction()?.hash || null;

const lqc = await deploy("testnet/LQCTestToken", ["LQC Test Token", "LQC", 18, wallet.address]);
const usdt = await deploy("testnet/LQCTestToken", ["Mock USDT", "USDT", 18, wallet.address]);
const factory = await deploy("LQCFlowFactory", [owner]);
const router = await deploy("LQCFlowRouter", [await factory.getAddress(), WBNB_ADDRESS]);
const registry = await deploy("router-v2/LQCDexRegistry", [wallet.address]);
const quoteRouter = await deploy("router-v2/LQCQuoteRouter", [await registry.getAddress()]);
const flowAdapter = await deploy("router-v2/adapters/LQCFlowAdapter", [await router.getAddress()]);

const flowDexId = ethers.id("LQC_FLOW");
await (await registry.addDex(flowDexId, await flowAdapter.getAddress(), "LQC Flow", 100)).wait();
const dexes = [{ id: flowDexId, name: "LQC Flow" }];
let pancakeAdapter = null;
if (PANCAKE_V2_ROUTER_ADDRESS) {
  if (!ethers.isAddress(PANCAKE_V2_ROUTER_ADDRESS)) throw new Error("PANCAKE_V2_ROUTER_ADDRESS must be valid.");
  pancakeAdapter = await deploy("router-v2/adapters/PancakeV2Adapter", [PANCAKE_V2_ROUTER_ADDRESS]);
  const pancakeDexId = ethers.id("PANCAKE_V2");
  await (await registry.addDex(pancakeDexId, await pancakeAdapter.getAddress(), "PancakeSwap V2", 90)).wait();
  dexes.push({ id: pancakeDexId, name: "PancakeSwap V2" });
}
if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
  await (await registry.beginOwnershipTransfer(owner)).wait();
}

const lqcSupply = ethers.parseUnits(TEST_LQC_SUPPLY, 18);
const usdtSupply = ethers.parseUnits(TEST_USDT_SUPPLY, 18);
await (await lqc.mint(wallet.address, lqcSupply)).wait();
await (await usdt.mint(wallet.address, usdtSupply)).wait();
await (await lqc.approve(await router.getAddress(), ethers.MaxUint256)).wait();
await (await usdt.approve(await router.getAddress(), ethers.MaxUint256)).wait();
const deadline = Math.floor(Date.now() / 1000) + 1800;
await (await router.addLiquidity(
  await lqc.getAddress(), await usdt.getAddress(),
  ethers.parseUnits(LQC_USDT_LIQUIDITY_LQC, 18), ethers.parseUnits(LQC_USDT_LIQUIDITY_USDT, 18),
  0, 0, wallet.address, deadline
)).wait();
await (await router.addLiquidityBNB(
  await lqc.getAddress(), ethers.parseUnits(LQC_BNB_LIQUIDITY_LQC, 18), 0, 0, wallet.address, deadline,
  { value: ethers.parseEther(LQC_BNB_LIQUIDITY_BNB) }
)).wait();

const lqcAddress = await lqc.getAddress();
const usdtAddress = await usdt.getAddress();
const addresses = {
  lqcUsdt: await factory.getPair(lqcAddress, usdtAddress),
  lqcWbnb: await factory.getPair(lqcAddress, WBNB_ADDRESS)
};
const record = {
  generatedAt: new Date().toISOString(),
  network: { name: "BSC Testnet", chainId: Number(network.chainId), explorer: "https://testnet.bscscan.com" },
  deployer: wallet.address,
  owner,
  dexRegistryOwnership: {
    currentOwner: wallet.address,
    pendingOwner: owner.toLowerCase() === wallet.address.toLowerCase() ? null : owner,
    acceptanceRequired: owner.toLowerCase() !== wallet.address.toLowerCase()
  },
  contracts: {
    lqc: { address: lqcAddress, decimals: 18, deploymentTx: txHash(lqc) },
    mockUsdt: { address: usdtAddress, decimals: 18, deploymentTx: txHash(usdt) },
    wbnb: { address: WBNB_ADDRESS },
    factory: { address: await factory.getAddress(), deploymentTx: txHash(factory) },
    router: { address: await router.getAddress(), deploymentTx: txHash(router) },
    dexRegistry: { address: await registry.getAddress(), deploymentTx: txHash(registry) },
    quoteRouter: { address: await quoteRouter.getAddress(), deploymentTx: txHash(quoteRouter) },
    flowAdapter: { address: await flowAdapter.getAddress(), deploymentTx: txHash(flowAdapter) },
    pancakeAdapter: pancakeAdapter ? { address: await pancakeAdapter.getAddress(), deploymentTx: txHash(pancakeAdapter) } : null
  },
  pools: [
    { pair: "LQC/Mock USDT", address: addresses.lqcUsdt, lqc: LQC_USDT_LIQUIDITY_LQC, quote: LQC_USDT_LIQUIDITY_USDT },
    { pair: "LQC/WBNB", address: addresses.lqcWbnb, lqc: LQC_BNB_LIQUIDITY_LQC, quote: LQC_BNB_LIQUIDITY_BNB }
  ],
  dexes,
  verification: { explorerVerifiedSource: false, smokeSwapTx: null, notes: "Complete verification and capped smoke swap after deployment." }
};

fs.mkdirSync(path.join(root, "deployments"), { recursive: true });
const recordPath = path.join(root, "deployments", `bsc-testnet-${network.chainId}.json`);
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
const appConfig = `window.LQC_FLOW_CONFIG = Object.freeze(${JSON.stringify({
  chainId: 97,
  chainIdHex: "0x61",
  chainName: "BSC Testnet",
  rpcUrls: ["https://data-seed-prebsc-1-s1.bnbchain.org:8545"],
  blockExplorerUrls: ["https://testnet.bscscan.com"],
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  routerAddress: await router.getAddress(),
  quoteRouterAddress: await quoteRouter.getAddress(),
  dexes,
  tokens: [
    { symbol: "BNB", name: "BNB", address: "native", decimals: 18 },
    { symbol: "WBNB", name: "Wrapped BNB", address: WBNB_ADDRESS, decimals: 18 },
    { symbol: "LQC", name: "LQC Test Token", address: lqcAddress, decimals: 18 },
    { symbol: "USDT", name: "Mock USDT", address: usdtAddress, decimals: 18 }
  ]
}, null, 2)});\n`;
fs.writeFileSync(path.join(root, "app/config.js"), appConfig);
console.log(JSON.stringify(record, null, 2));
console.log(`Saved deployment record to ${recordPath} and configured app/config.js.`);
