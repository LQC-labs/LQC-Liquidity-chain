import fs from "node:fs";
import { ethers } from "ethers";

const config = JSON.parse(fs.readFileSync(new URL("../config/bsc-testnet.json", import.meta.url), "utf8"));
const {
  BSC_TESTNET_RPC_URL = config.rpcUrl,
  DEPLOYER_PRIVATE_KEY,
  ROUTER_V2_ADDRESS,
  ROUTER_TIMELOCK_ADDRESS,
  PANCAKE_V2_ROUTER_ADDRESS = config.contracts.pancakeV2Router,
  EXPECTED_CHAIN_ID = String(config.chainId)
} = process.env;

if (!DEPLOYER_PRIVATE_KEY || !ROUTER_V2_ADDRESS) {
  throw new Error("Set DEPLOYER_PRIVATE_KEY and ROUTER_V2_ADDRESS in the environment.");
}
if (!ethers.isAddress(ROUTER_V2_ADDRESS) || !ethers.isAddress(PANCAKE_V2_ROUTER_ADDRESS)) {
  throw new Error("ROUTER_V2_ADDRESS and PANCAKE_V2_ROUTER_ADDRESS must be valid addresses.");
}

const provider = new ethers.JsonRpcProvider(BSC_TESTNET_RPC_URL);
const wallet = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
const network = await provider.getNetwork();
if (network.chainId !== BigInt(EXPECTED_CHAIN_ID) || network.chainId !== BigInt(config.chainId)) {
  throw new Error(`Refusing deployment on chain ${network.chainId}; BSC testnet chain ${config.chainId} is required.`);
}

const routerV2 = new ethers.Contract(ROUTER_V2_ADDRESS, [
  "function owner() view returns (address)",
  "function WBNB() view returns (address)",
  "function setAdapter(address adapter,bool enabled)"
], wallet);
const pancakeRouter = new ethers.Contract(PANCAKE_V2_ROUTER_ADDRESS, [
  "function WETH() view returns (address)",
  "function factory() view returns (address)"
], provider);
const [owner, routerWBNB, pancakeWBNB, pancakeFactory] = await Promise.all([
  routerV2.owner(), routerV2.WBNB(), pancakeRouter.WETH(), pancakeRouter.factory()
]);
if (routerWBNB.toLowerCase() !== config.contracts.wbnb.toLowerCase()) {
  throw new Error(`Router V2 WBNB mismatch: ${routerWBNB}`);
}
if (pancakeWBNB.toLowerCase() !== routerWBNB.toLowerCase()) {
  throw new Error(`Pancake Router WBNB mismatch: ${pancakeWBNB}`);
}
if (pancakeFactory.toLowerCase() !== config.contracts.pancakeV2Factory.toLowerCase()) {
  throw new Error(`Pancake Router factory mismatch: ${pancakeFactory}`);
}

const artifact = JSON.parse(fs.readFileSync(
  new URL("../artifacts/contracts/adapters/UniswapV2DEXAdapter.sol/UniswapV2DEXAdapter.json", import.meta.url)
));
const adapter = await new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet).deploy(
  ROUTER_V2_ADDRESS, PANCAKE_V2_ROUTER_ADDRESS
);
await adapter.waitForDeployment();
const adapterAddress = await adapter.getAddress();

let enabled = false;
let scheduled = false;
let operationId = null;
if (owner.toLowerCase() === wallet.address.toLowerCase()) {
  await (await routerV2.setAdapter(adapterAddress, true)).wait();
  enabled = true;
} else if (ROUTER_TIMELOCK_ADDRESS && owner.toLowerCase() === ROUTER_TIMELOCK_ADDRESS.toLowerCase()) {
  if (!ethers.isAddress(ROUTER_TIMELOCK_ADDRESS)) throw new Error("ROUTER_TIMELOCK_ADDRESS must be a valid address.");
  const timelock = new ethers.Contract(ROUTER_TIMELOCK_ADDRESS, [
    "function admin() view returns (address)",
    "function minDelay() view returns (uint256)",
    "function hashOperation(address target,uint256 value,bytes data,bytes32 salt) view returns (bytes32)",
    "function schedule(address target,uint256 value,bytes data,bytes32 salt) returns (bytes32)"
  ], wallet);
  const data = routerV2.interface.encodeFunctionData("setAdapter", [adapterAddress, true]);
  const operationSalt = ethers.keccak256(ethers.solidityPacked(
    ["string", "address", "address"], ["LQC_ENABLE_ADAPTER", ROUTER_V2_ADDRESS, adapterAddress]
  ));
  operationId = await timelock.hashOperation(ROUTER_V2_ADDRESS, 0, data, operationSalt);
  if ((await timelock.admin()).toLowerCase() === wallet.address.toLowerCase()) {
    await (await timelock.schedule(ROUTER_V2_ADDRESS, 0, data, operationSalt)).wait();
    scheduled = true;
  }
}

console.log(JSON.stringify({
  chainId: network.chainId.toString(),
  deployer: wallet.address,
  routerV2: ROUTER_V2_ADDRESS,
  pancakeV2Router: PANCAKE_V2_ROUTER_ADDRESS,
  pancakeAdapter: adapterAddress,
  adapterEnabled: enabled,
  timelockScheduled: scheduled,
  timelockOperationId: operationId,
  nextAction: enabled ? null : scheduled
    ? `Execute timelock operation ${operationId} after the configured delay`
    : `Timelock or multisig owner ${owner} must approve setAdapter(${adapterAddress}, true)`
}, null, 2));
