import fs from "node:fs";
import { ethers } from "ethers";

const { BSC_TESTNET_RPC_URL, DEPLOYER_PRIVATE_KEY, FACTORY_OWNER, WBNB_ADDRESS, EXPECTED_CHAIN_ID = "97" } = process.env;
if (!BSC_TESTNET_RPC_URL || !DEPLOYER_PRIVATE_KEY || !WBNB_ADDRESS) {
  throw new Error("Set BSC_TESTNET_RPC_URL, DEPLOYER_PRIVATE_KEY, and WBNB_ADDRESS in the environment.");
}

const load = (name) => JSON.parse(fs.readFileSync(new URL(`../artifacts/contracts/${name}.sol/${name}.json`, import.meta.url)));
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

const quoterArtifact = load("LQCFlowQuoter");
const quoter = await new ethers.ContractFactory(quoterArtifact.abi, quoterArtifact.bytecode, wallet).deploy(
  await router.getAddress()
);
await quoter.waitForDeployment();

const routerV2Artifact = load("LQCFlowRouterV2");
const routerV2 = await new ethers.ContractFactory(routerV2Artifact.abi, routerV2Artifact.bytecode, wallet).deploy(owner);
await routerV2.waitForDeployment();

console.log(JSON.stringify({
  chainId: network.chainId.toString(),
  deployer: wallet.address,
  factoryOwner: owner,
  wbnb: WBNB_ADDRESS,
  factory: await factory.getAddress(),
  router: await router.getAddress(),
  quoter: await quoter.getAddress(),
  routerV2: await routerV2.getAddress()
}, null, 2));
