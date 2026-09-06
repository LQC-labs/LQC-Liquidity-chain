import fs from "node:fs";
import { ethers } from "ethers";

const {
  BSC_TESTNET_RPC_URL,
  DEPLOYER_PRIVATE_KEY,
  FACTORY_OWNER,
  WBNB_ADDRESS,
  PANCAKE_V2_ROUTER_ADDRESS,
  EXPECTED_CHAIN_ID = "97"
} = process.env;
if (!BSC_TESTNET_RPC_URL || !DEPLOYER_PRIVATE_KEY || !WBNB_ADDRESS) {
  throw new Error("Set BSC_TESTNET_RPC_URL, DEPLOYER_PRIVATE_KEY, and WBNB_ADDRESS in the environment.");
}

const load = (source) => {
  const contractName = source.split("/").at(-1);
  return JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${source}.sol/${contractName}.json`, import.meta.url)));
};
const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC_URL);
const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
const owner = FACTORY_OWNER || wallet.address;
const network = await provider.getNetwork();
if (network.chainId !== BigInt(EXPECTED_CHAIN_ID)) {
  throw new Error(`Refusing deployment: connected chain ${network.chainId}, expected ${EXPECTED_CHAIN_ID}.`);
}

const factoryArtifact = load("LQCFlowFactory");
const factory = await new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, wallet).deploy(owner);
await factory.waitForDeployment();

const routerArtifact = load("LQCFlowRouter");
const router = await new ethers.ContractFactory(routerArtifact.abi, routerArtifact.bytecode, wallet).deploy(
  await factory.getAddress(), WBNB_ADDRESS
);
await router.waitForDeployment();

const registryArtifact = load("router-v2/LQCDexRegistry");
const registry = await new ethers.ContractFactory(registryArtifact.abi, registryArtifact.bytecode, wallet).deploy(wallet.address);
await registry.waitForDeployment();

const quoteRouterArtifact = load("router-v2/LQCQuoteRouter");
const quoteRouter = await new ethers.ContractFactory(quoteRouterArtifact.abi, quoteRouterArtifact.bytecode, wallet).deploy(await registry.getAddress());
await quoteRouter.waitForDeployment();

const flowAdapterArtifact = load("router-v2/adapters/LQCFlowAdapter");
const flowAdapter = await new ethers.ContractFactory(flowAdapterArtifact.abi, flowAdapterArtifact.bytecode, wallet).deploy(await router.getAddress());
await flowAdapter.waitForDeployment();

const flowDexId = ethers.id("LQC_FLOW");
await (await registry.addDex(flowDexId, await flowAdapter.getAddress(), "LQC Flow", 100)).wait();

let pancakeAdapterAddress = null;
let pancakeDexId = null;
if (PANCAKE_V2_ROUTER_ADDRESS) {
  if (!ethers.isAddress(PANCAKE_V2_ROUTER_ADDRESS)) throw new Error("PANCAKE_V2_ROUTER_ADDRESS must be valid.");
  const pancakeAdapterArtifact = load("router-v2/adapters/PancakeV2Adapter");
  const pancakeAdapter = await new ethers.ContractFactory(
    pancakeAdapterArtifact.abi,
    pancakeAdapterArtifact.bytecode,
    wallet
  ).deploy(PANCAKE_V2_ROUTER_ADDRESS);
  await pancakeAdapter.waitForDeployment();
  pancakeAdapterAddress = await pancakeAdapter.getAddress();
  pancakeDexId = ethers.id("PANCAKE_V2");
  await (await registry.addDex(pancakeDexId, pancakeAdapterAddress, "PancakeSwap V2", 90)).wait();
}
if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
  await (await registry.beginOwnershipTransfer(owner)).wait();
}

console.log(JSON.stringify({
  chainId: network.chainId.toString(),
  deployer: wallet.address,
  factoryOwner: owner,
  wbnb: WBNB_ADDRESS,
  factory: await factory.getAddress(),
  router: await router.getAddress(),
  dexRegistry: await registry.getAddress(),
  dexRegistryOwner: wallet.address,
  dexRegistryPendingOwner: owner.toLowerCase() === wallet.address.toLowerCase() ? null : owner,
  quoteRouter: await quoteRouter.getAddress(),
  flowAdapter: await flowAdapter.getAddress(),
  flowDexId,
  pancakeV2Router: PANCAKE_V2_ROUTER_ADDRESS || null,
  pancakeAdapter: pancakeAdapterAddress,
  pancakeDexId
}, null, 2));
