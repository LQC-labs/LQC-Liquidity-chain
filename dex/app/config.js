window.LQC_FLOW_CONFIG = Object.freeze({
  chainId: 97,
  chainIdHex: "0x61",
  chainName: "BSC Testnet",
  rpcUrls: ["https://data-seed-prebsc-1-s1.bnbchain.org:8545"],
  blockExplorerUrls: ["https://testnet.bscscan.com"],
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  routerAddress: "",
  routerV2Address: "",
  adapters: [
    { id: "pancake-v2", name: "PancakeSwap V2", address: "" }
  ],
  tokens: [
    { symbol: "BNB", name: "BNB", address: "native", decimals: 18 },
    { symbol: "WBNB", name: "Wrapped BNB", address: "", decimals: 18 },
    { symbol: "LQC", name: "LQC Token", address: "", decimals: 18 }
  ]
});
