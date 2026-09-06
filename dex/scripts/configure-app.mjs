import fs from "node:fs";
import path from "node:path";
import { ethers } from "ethers";

const { ROUTER_ADDRESS, QUOTE_ROUTER_ADDRESS, EXECUTION_ROUTER_ADDRESS, NATIVE_ROUTER_ADDRESS, WBNB_ADDRESS, LQC_ADDRESS, REGISTERED_DEXES = "[]" } = process.env;
for (const [name, value] of Object.entries({ ROUTER_ADDRESS, QUOTE_ROUTER_ADDRESS, EXECUTION_ROUTER_ADDRESS, NATIVE_ROUTER_ADDRESS, WBNB_ADDRESS, LQC_ADDRESS })) {
  if (!ethers.isAddress(value)) throw new Error(`${name} must be a valid deployed contract address.`);
}
const dexes = JSON.parse(REGISTERED_DEXES);
if (!Array.isArray(dexes) || dexes.some((dex) => typeof dex?.id !== "string" || typeof dex?.name !== "string")) {
  throw new Error('REGISTERED_DEXES must be JSON such as [{"id":"0x...","name":"LQC Flow"}].');
}

const config = `window.LQC_FLOW_CONFIG = Object.freeze(${JSON.stringify({
  chainId: 97,
  chainIdHex: "0x61",
  chainName: "BSC Testnet",
  rpcUrls: ["https://data-seed-prebsc-1-s1.bnbchain.org:8545"],
  blockExplorerUrls: ["https://testnet.bscscan.com"],
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  routerAddress: ROUTER_ADDRESS,
  quoteRouterAddress: QUOTE_ROUTER_ADDRESS,
  executionRouterAddress: EXECUTION_ROUTER_ADDRESS,
  nativeRouterAddress: NATIVE_ROUTER_ADDRESS,
  dexes,
  tokens: [
    { symbol: "BNB", name: "BNB", address: "native", decimals: 18 },
    { symbol: "WBNB", name: "Wrapped BNB", address: WBNB_ADDRESS, decimals: 18 },
    { symbol: "LQC", name: "LQC Token", address: LQC_ADDRESS, decimals: 18 }
  ]
}, null, 2)});\n`;

const output = path.resolve(import.meta.dirname, "../app/config.js");
fs.writeFileSync(output, config);
console.log(`Updated ${output}`);
