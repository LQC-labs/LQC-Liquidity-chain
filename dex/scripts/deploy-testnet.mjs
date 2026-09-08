import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { checkpointedDeploy, checkpointedTransaction, loadDeploymentCheckpoint } from "./deployment-checkpoint.mjs";

const {
  BSC_TESTNET_RPC_URL,
  DEPLOYER_PRIVATE_KEY,
  WBNB_ADDRESS,
  FACTORY_OWNER,
  PANCAKE_V2_ROUTER_ADDRESS = "",
  PANCAKE_V3_QUOTER_ADDRESS = "",
  PANCAKE_V3_ROUTER_ADDRESS = "",
  PANCAKE_V3_ALLOWED_FEE_TIERS = "[100,500,2500,10000]",
  PANCAKE_V3_ALLOWED_POOLS = "[]",
  PANCAKE_V3_MAX_HOPS = "2",
  TIMELOCK_DELAY = "3600",
  TEST_LQC_MAX_TX = "10000",
  TEST_LQC_MAX_DAY = "100000",
  TEST_USDT_MAX_TX = "10000",
  TEST_USDT_MAX_DAY = "100000",
  TEST_WBNB_MAX_TX = "10",
  TEST_WBNB_MAX_DAY = "100",
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
const checkpointFile = path.resolve(process.env.DEPLOYMENT_CHECKPOINT_FILE ||
  path.join(root, `deployments/bsc-testnet-${network.chainId}.checkpoint.local.json`));
const checkpoint = loadDeploymentCheckpoint(checkpointFile, network.chainId, wallet.address);
const deploymentTxByAddress = new Map();
const deploy = async (source, args = []) => {
  const artifact = load(source);
  const result = await checkpointedDeploy({
    key: source, source, args, artifact, wallet, provider, checkpoint, checkpointFile,
    deployContract: () => new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet).deploy(...args)
  });
  deploymentTxByAddress.set((await result.contract.getAddress()).toLowerCase(), result.txHash);
  console.error(`${result.reused ? "Reused" : "Deployed"} ${source} at ${await result.contract.getAddress()}.`);
  return result.contract;
};
const txHash = (contract) => deploymentTxByAddress.get(contract.target.toLowerCase()) || contract.deploymentTransaction()?.hash || null;
const transact = async (key, config, sendTransaction) => {
  const result = await checkpointedTransaction({ key, config, checkpoint, checkpointFile, provider, sendTransaction });
  console.error(`${result.reused ? "Reused" : "Confirmed"} operation ${key} (${result.txHash}).`);
};

const lqc = await deploy("testnet/LQCTestToken", ["LQC Test Token", "LQC", 18, wallet.address]);
const usdt = await deploy("testnet/LQCTestToken", ["Mock USDT", "USDT", 18, wallet.address]);
const factory = await deploy("LQCFlowFactory", [owner]);
const router = await deploy("LQCFlowRouter", [await factory.getAddress(), WBNB_ADDRESS]);
const registry = await deploy("router-v2/LQCDexRegistry", [wallet.address]);
const timelock = await deploy("router-v2/LQCTimelockController", [owner, BigInt(TIMELOCK_DELAY)]);
const riskRegistry = await deploy("router-v2/LQCRiskRegistry", [wallet.address, owner]);
const emergencyController = await deploy("router-v2/LQCEmergencyController", [
  owner, await registry.getAddress(), await riskRegistry.getAddress()
]);
await transact("registry.setPauseAdmin", [emergencyController.target], () => registry.setPauseAdmin(emergencyController.target));
await transact("riskRegistry.setPauseAdmin", [emergencyController.target], () => riskRegistry.setPauseAdmin(emergencyController.target));
const quoteRouter = await deploy("router-v2/LQCQuoteRouter", [await registry.getAddress()]);
const executionRouter = await deploy("router-v2/LQCExecutionRouter", [
  await registry.getAddress(), await riskRegistry.getAddress()
]);
const nativeRouter = await deploy("router-v2/LQCNativeRouter", [WBNB_ADDRESS, await executionRouter.getAddress()]);
await transact("riskRegistry.setExecutor", [executionRouter.target], () => riskRegistry.setExecutor(executionRouter.target));
const splitOptimizer = await deploy("router-v2/LQCSplitOptimizer", [await registry.getAddress()]);
const autoRouter = await deploy("router-v2/LQCAutoRouter", [
  await splitOptimizer.getAddress(), await executionRouter.getAddress()
]);
const gasCostOracle = await deploy("router-v2/LQCGasCostOracle", [wallet.address, WBNB_ADDRESS]);
const flowAdapter = await deploy("router-v2/adapters/LQCFlowAdapter", [await router.getAddress()]);

const flowDexId = ethers.id("LQC_FLOW");
await transact("registry.addDex.LQC_FLOW", [flowDexId, flowAdapter.target, "LQC Flow", 100], () => registry.addDex(flowDexId, flowAdapter.target, "LQC Flow", 100));
const dexes = [{ id: flowDexId, name: "LQC Flow", kind: "v2", adapter: await flowAdapter.getAddress(), feeBps: 30, gasUnits: 220000 }];
let pancakeAdapter = null;
if (PANCAKE_V2_ROUTER_ADDRESS) {
  if (!ethers.isAddress(PANCAKE_V2_ROUTER_ADDRESS)) throw new Error("PANCAKE_V2_ROUTER_ADDRESS must be valid.");
  pancakeAdapter = await deploy("router-v2/adapters/PancakeV2Adapter", [PANCAKE_V2_ROUTER_ADDRESS]);
  const pancakeDexId = ethers.id("PANCAKE_V2");
  await transact("registry.addDex.PANCAKE_V2", [pancakeDexId, pancakeAdapter.target, 90], () => registry.addDex(pancakeDexId, pancakeAdapter.target, "PancakeSwap V2", 90));
  dexes.push({ id: pancakeDexId, name: "PancakeSwap V2", kind: "v2", adapter: await pancakeAdapter.getAddress(), feeBps: 25, gasUnits: 230000 });
}
let pancakeV3Adapter = null;
if (PANCAKE_V3_QUOTER_ADDRESS || PANCAKE_V3_ROUTER_ADDRESS) {
  if (!ethers.isAddress(PANCAKE_V3_QUOTER_ADDRESS) || !ethers.isAddress(PANCAKE_V3_ROUTER_ADDRESS)) {
    throw new Error("Set both valid PANCAKE_V3_QUOTER_ADDRESS and PANCAKE_V3_ROUTER_ADDRESS values.");
  }
  const maxV3Hops = Number(PANCAKE_V3_MAX_HOPS);
  if (!Number.isInteger(maxV3Hops) || maxV3Hops < 1 || maxV3Hops > 3) {
    throw new Error("PANCAKE_V3_MAX_HOPS must be an integer from 1 to 3.");
  }
  const canonicalV3FeeTiers = new Set([100, 500, 2500, 10000]);
  const allowedV3FeeTiers = JSON.parse(PANCAKE_V3_ALLOWED_FEE_TIERS);
  if (!Array.isArray(allowedV3FeeTiers) || allowedV3FeeTiers.length === 0 ||
      new Set(allowedV3FeeTiers.map(Number)).size !== allowedV3FeeTiers.length ||
      allowedV3FeeTiers.some(fee => !canonicalV3FeeTiers.has(Number(fee)))) {
    throw new Error("PANCAKE_V3_ALLOWED_FEE_TIERS must be a unique, non-empty subset of 100, 500, 2500, and 10000.");
  }
  pancakeV3Adapter = await deploy("router-v2/adapters/PancakeV3ExecutionAdapter", [
    PANCAKE_V3_QUOTER_ADDRESS, PANCAKE_V3_ROUTER_ADDRESS, wallet.address, maxV3Hops
  ]);
  for (const fee of allowedV3FeeTiers.map(Number)) {
    await transact(`pancakeV3.feeTier.${fee}`, [fee, true], () => pancakeV3Adapter.setFeeTierAllowed(fee, true));
  }
  const approvedV3Pools = JSON.parse(PANCAKE_V3_ALLOWED_POOLS);
  if (!Array.isArray(approvedV3Pools) || approvedV3Pools.length === 0) {
    throw new Error("PANCAKE_V3_ALLOWED_POOLS must contain at least one reviewed pool.");
  }
  for (const pool of approvedV3Pools) {
    if (!ethers.isAddress(pool.tokenA) || !ethers.isAddress(pool.tokenB) ||
        !allowedV3FeeTiers.map(Number).includes(Number(pool.fee))) {
      throw new Error("Each PancakeSwap V3 pool needs valid tokenA, tokenB, and reviewed fee tier.");
    }
    await transact(`pancakeV3.pool.${pool.tokenA.toLowerCase()}.${pool.tokenB.toLowerCase()}.${Number(pool.fee)}`,
      [pool.tokenA, pool.tokenB, Number(pool.fee), true],
      () => pancakeV3Adapter.setPoolAllowed(pool.tokenA, pool.tokenB, Number(pool.fee), true));
  }
  const pancakeV3DexId = ethers.id("PANCAKE_V3");
  await transact("registry.addDex.PANCAKE_V3", [pancakeV3DexId, pancakeV3Adapter.target, 95], () => registry.addDex(pancakeV3DexId, pancakeV3Adapter.target, "PancakeSwap V3", 95));
  dexes.push({
    id: pancakeV3DexId, name: "PancakeSwap V3", kind: "v3",
    adapter: await pancakeV3Adapter.getAddress(), feeTiers: allowedV3FeeTiers.map(Number),
    pools: approvedV3Pools, maxHops: maxV3Hops, gasUnits: 260000
  });
}
const lqcAddressForLimits = await lqc.getAddress();
const usdtAddressForLimits = await usdt.getAddress();
const limits = [
  [lqcAddressForLimits, TEST_LQC_MAX_TX, TEST_LQC_MAX_DAY],
  [usdtAddressForLimits, TEST_USDT_MAX_TX, TEST_USDT_MAX_DAY],
  [WBNB_ADDRESS, TEST_WBNB_MAX_TX, TEST_WBNB_MAX_DAY]
];
for (const [token, perTx, perDay] of limits) {
  await transact(`risk.tokenLimits.${token.toLowerCase()}`, [token, perTx, perDay], () => riskRegistry.setTokenLimits(
    token, true, ethers.parseUnits(perTx, 18), ethers.parseUnits(perDay, 18)
  ));
  for (const dex of dexes) {
    await transact(`risk.dexCap.${dex.id}.${token.toLowerCase()}`, [dex.id, token, perTx],
      () => riskRegistry.setDexTokenCap(dex.id, token, ethers.parseUnits(perTx, 18)));
  }
}
await transact("registry.beginOwnershipTransfer", [timelock.target], () => registry.beginOwnershipTransfer(timelock.target));
await transact("registry.acceptOwnership", [registry.target], () => timelock.acceptRegistryOwnership(registry.target));
await transact("riskRegistry.beginOwnershipTransfer", [timelock.target], () => riskRegistry.beginOwnershipTransfer(timelock.target));
await transact("riskRegistry.acceptOwnership", [riskRegistry.target], () => timelock.acceptRegistryOwnership(riskRegistry.target));
await transact("gasCostOracle.beginOwnershipTransfer", [timelock.target], () => gasCostOracle.beginOwnershipTransfer(timelock.target));
await transact("gasCostOracle.acceptOwnership", [gasCostOracle.target], () => timelock.acceptRegistryOwnership(gasCostOracle.target));
if (pancakeV3Adapter) {
  await transact("pancakeV3.beginOwnershipTransfer", [timelock.target], () => pancakeV3Adapter.beginOwnershipTransfer(timelock.target));
  await transact("pancakeV3.acceptOwnership", [pancakeV3Adapter.target], () => timelock.acceptRegistryOwnership(pancakeV3Adapter.target));
}

const lqcSupply = ethers.parseUnits(TEST_LQC_SUPPLY, 18);
const usdtSupply = ethers.parseUnits(TEST_USDT_SUPPLY, 18);
await transact("token.lqc.mint", [wallet.address, lqcSupply], () => lqc.mint(wallet.address, lqcSupply));
await transact("token.usdt.mint", [wallet.address, usdtSupply], () => usdt.mint(wallet.address, usdtSupply));
const routerAddress = await router.getAddress();
const lqcUsdtLiquidity = ethers.parseUnits(LQC_USDT_LIQUIDITY_LQC, 18);
const usdtLiquidity = ethers.parseUnits(LQC_USDT_LIQUIDITY_USDT, 18);
const lqcBnbLiquidity = ethers.parseUnits(LQC_BNB_LIQUIDITY_LQC, 18);
await transact("token.lqc.approveLiquidity", [routerAddress, lqcUsdtLiquidity + lqcBnbLiquidity],
  () => lqc.approve(routerAddress, lqcUsdtLiquidity + lqcBnbLiquidity));
await transact("token.usdt.approveLiquidity", [routerAddress, usdtLiquidity], () => usdt.approve(routerAddress, usdtLiquidity));
const deadline = Math.floor(Date.now() / 1000) + 1800;
await transact("liquidity.lqcUsdt", [lqc.target, usdt.target, lqcUsdtLiquidity, usdtLiquidity, wallet.address], () => router.addLiquidity(
  lqc.target, usdt.target,
  lqcUsdtLiquidity, usdtLiquidity,
  0, 0, wallet.address, deadline
));
await transact("liquidity.lqcBnb", [lqc.target, lqcBnbLiquidity, LQC_BNB_LIQUIDITY_BNB, wallet.address], () => router.addLiquidityBNB(
  lqc.target, lqcBnbLiquidity, 0, 0, wallet.address, deadline,
  { value: ethers.parseEther(LQC_BNB_LIQUIDITY_BNB) }
));
if (await lqc.allowance(wallet.address, routerAddress) !== 0n ||
    await usdt.allowance(wallet.address, routerAddress) !== 0n) {
  throw new Error("Initial liquidity provisioning left an unexpected Router allowance.");
}

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
    currentOwner: await timelock.getAddress(),
    governanceProposer: owner,
    pauseAdmin: await emergencyController.getAddress(),
    timelockDelaySeconds: Number(TIMELOCK_DELAY)
  },
  contracts: {
    lqc: { address: lqcAddress, decimals: 18, deploymentTx: txHash(lqc) },
    mockUsdt: { address: usdtAddress, decimals: 18, deploymentTx: txHash(usdt) },
    wbnb: { address: WBNB_ADDRESS },
    factory: { address: await factory.getAddress(), deploymentTx: txHash(factory) },
    router: { address: await router.getAddress(), deploymentTx: txHash(router) },
    dexRegistry: { address: await registry.getAddress(), deploymentTx: txHash(registry) },
    timelock: { address: await timelock.getAddress(), deploymentTx: txHash(timelock) },
    emergencyController: { address: await emergencyController.getAddress(), deploymentTx: txHash(emergencyController) },
    riskRegistry: { address: await riskRegistry.getAddress(), deploymentTx: txHash(riskRegistry) },
    quoteRouter: { address: await quoteRouter.getAddress(), deploymentTx: txHash(quoteRouter) },
    executionRouter: { address: await executionRouter.getAddress(), deploymentTx: txHash(executionRouter) },
    nativeRouter: { address: await nativeRouter.getAddress(), deploymentTx: txHash(nativeRouter) },
    splitOptimizer: { address: await splitOptimizer.getAddress(), deploymentTx: txHash(splitOptimizer) },
    autoRouter: { address: await autoRouter.getAddress(), deploymentTx: txHash(autoRouter) },
    gasCostOracle: {
      address: await gasCostOracle.getAddress(), deploymentTx: txHash(gasCostOracle),
      owner: await gasCostOracle.owner(), feedsConfigured: false
    },
    flowAdapter: { address: await flowAdapter.getAddress(), deploymentTx: txHash(flowAdapter) },
    pancakeAdapter: pancakeAdapter ? { address: await pancakeAdapter.getAddress(), deploymentTx: txHash(pancakeAdapter) } : null,
    pancakeV3Adapter: pancakeV3Adapter ? { address: await pancakeV3Adapter.getAddress(), deploymentTx: txHash(pancakeV3Adapter) } : null
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
  executionRouterAddress: await executionRouter.getAddress(),
  nativeRouterAddress: await nativeRouter.getAddress(),
  splitOptimizerAddress: await splitOptimizer.getAddress(),
  autoRouterAddress: await autoRouter.getAddress(),
  gasCostOracleAddress: await gasCostOracle.getAddress(),
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
