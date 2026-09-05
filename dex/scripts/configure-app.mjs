import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const { ROUTER_ADDRESS = "", ROUTER_V2_ADDRESS = "", PANCAKE_ADAPTER_ADDRESS = "", WBNB_ADDRESS, LQC_ADDRESS } = process.env;
for (const [name, value] of Object.entries({ WBNB_ADDRESS, LQC_ADDRESS })) {
  if (!ethers.isAddress(value)) throw new Error(`${name} must be a valid deployed contract address.`);
}
for (const [name, value] of Object.entries({ ROUTER_ADDRESS, ROUTER_V2_ADDRESS, PANCAKE_ADAPTER_ADDRESS })) {
  if (value && !ethers.isAddress(value)) throw new Error(`${name} must be empty or a valid deployed contract address.`);
}
if (!ROUTER_ADDRESS && !ROUTER_V2_ADDRESS) throw new Error("Set ROUTER_ADDRESS or ROUTER_V2_ADDRESS.");
if (ROUTER_V2_ADDRESS && !PANCAKE_ADAPTER_ADDRESS) throw new Error("PANCAKE_ADAPTER_ADDRESS is required with ROUTER_V2_ADDRESS.");

const config = `window.LQC_FLOW_CONFIG = Object.freeze(${JSON.stringify({
  chainId: 97,
  chainIdHex: "0x61",
  chainName: "BSC Testnet",
  rpcUrls: ["https://data-seed-prebsc-1-s1.bnbchain.org:8545"],
  blockExplorerUrls: ["https://testnet.bscscan.com"],
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  routerAddress: ROUTER_ADDRESS,
  routerV2Address: ROUTER_V2_ADDRESS,
  adapters: [
    { id: "pancake-v2", name: "PancakeSwap V2", address: PANCAKE_ADAPTER_ADDRESS }
  ],
  tokens: [
    { symbol: "BNB", name: "BNB", address: "native", decimals: 18 },
    { symbol: "WBNB", name: "Wrapped BNB", address: WBNB_ADDRESS, decimals: 18 },
    { symbol: "LQC", name: "LQC Token", address: LQC_ADDRESS, decimals: 18 }
  ]
}, null, 2)});\n`;

const output = path.resolve(import.meta.dirname, "../app/config.js");
fs.writeFileSync(output, config);
console.log(`Updated ${output}`);
