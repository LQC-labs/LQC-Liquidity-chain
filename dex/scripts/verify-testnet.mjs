import fs from "node:fs";
import { ethers } from "ethers";

const config = JSON.parse(fs.readFileSync(new URL("../config/bsc-testnet.json", import.meta.url), "utf8"));
const rpcUrl = process.env.BSC_TESTNET_RPC_URL || config.rpcUrl;
const addresses = {
  wbnb: process.env.WBNB_ADDRESS || config.contracts.wbnb,
  factory: process.env.PANCAKE_V2_FACTORY_ADDRESS || config.contracts.pancakeV2Factory,
  router: process.env.PANCAKE_V2_ROUTER_ADDRESS || config.contracts.pancakeV2Router
};

for (const [name, address] of Object.entries(addresses)) {
  if (!ethers.isAddress(address)) throw new Error(`${name} is not a valid address: ${address}`);
}

const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: false });
const network = await provider.getNetwork();
if (network.chainId !== BigInt(config.chainId)) {
  throw new Error(`Wrong network: expected chain ${config.chainId}, received ${network.chainId}.`);
}

for (const [name, address] of Object.entries(addresses)) {
  const code = await provider.getCode(address);
  if (code === "0x") throw new Error(`${name} has no deployed bytecode at ${address}.`);
}

const pancakeRouter = new ethers.Contract(addresses.router, [
  "function factory() view returns (address)",
  "function WETH() view returns (address)"
], provider);
const wbnb = new ethers.Contract(addresses.wbnb, [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
], provider);

const [reportedFactory, reportedWBNB, symbol, decimals, blockNumber] = await Promise.all([
  pancakeRouter.factory(), pancakeRouter.WETH(), wbnb.symbol(), wbnb.decimals(), provider.getBlockNumber()
]);
if (reportedFactory.toLowerCase() !== addresses.factory.toLowerCase()) {
  throw new Error(`Pancake Router factory mismatch: expected ${addresses.factory}, received ${reportedFactory}.`);
}
if (reportedWBNB.toLowerCase() !== addresses.wbnb.toLowerCase()) {
  throw new Error(`Pancake Router WBNB mismatch: expected ${addresses.wbnb}, received ${reportedWBNB}.`);
}
if (decimals !== 18n) throw new Error(`Unexpected WBNB decimals: ${decimals}.`);

console.log(JSON.stringify({
  ok: true,
  network: config.name,
  chainId: network.chainId.toString(),
  checkedAtBlock: blockNumber,
  wbnb: { address: addresses.wbnb, symbol, decimals: decimals.toString() },
  pancakeV2: { factory: addresses.factory, router: addresses.router }
}, null, 2));
