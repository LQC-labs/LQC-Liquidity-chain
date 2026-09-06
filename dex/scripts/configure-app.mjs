import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const { ROUTER_ADDRESS = "", ROUTER_V2_ADDRESS = "", PANCAKE_ADAPTER_ADDRESS = "", WBNB_ADDRESS, LQC_ADDRESS,
  MARKET_POOL_ADDRESS = "", MARKET_NETWORK = "bsc", MARKET_TOKEN_SIDE = "base" } = process.env;
for (const [name, value] of Object.entries({ WBNB_ADDRESS, LQC_ADDRESS })) {
  if (!ethers.isAddress(value)) throw new Error(`${name} must be a valid deployed contract address.`);
}
for (const [name, value] of Object.entries({ ROUTER_ADDRESS, ROUTER_V2_ADDRESS, PANCAKE_ADAPTER_ADDRESS })) {
  if (value && !ethers.isAddress(value)) throw new Error(`${name} must be empty or a valid deployed contract address.`);
}
if (!ROUTER_ADDRESS && !ROUTER_V2_ADDRESS) throw new Error("Set ROUTER_ADDRESS or ROUTER_V2_ADDRESS.");
if (ROUTER_V2_ADDRESS && !PANCAKE_ADAPTER_ADDRESS) throw new Error("PANCAKE_ADAPTER_ADDRESS is required with ROUTER_V2_ADDRESS.");
if (MARKET_POOL_ADDRESS && !ethers.isAddress(MARKET_POOL_ADDRESS)) throw new Error("MARKET_POOL_ADDRESS must be empty or a valid pool address.");
if (!/^[a-z0-9_-]+$/i.test(MARKET_NETWORK)) throw new Error("MARKET_NETWORK contains invalid characters.");
if (!["base", "quote"].includes(MARKET_TOKEN_SIDE)) throw new Error("MARKET_TOKEN_SIDE must be base or quote.");

const config = `window.LQC_FLOW_CONFIG = Object.freeze(${JSON.stringify({
  chainId: 97,
  chainIdHex: "0x61",
  chainName: "BSC Testnet",
  rpcUrls: ["https://data-seed-prebsc-1-s1.bnbchain.org:8545"],
  blockExplorerUrls: ["https://testnet.bscscan.com"],
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  routerAddress: ROUTER_ADDRESS,
  routerV2Address: ROUTER_V2_ADDRESS,
  marketData: { provider: "geckoterminal", network: MARKET_NETWORK, poolAddress: MARKET_POOL_ADDRESS, tokenSide: MARKET_TOKEN_SIDE },
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
