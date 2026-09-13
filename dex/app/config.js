window.LQC_FLOW_CONFIG = Object.freeze({
  deploymentMode: "minimal-testnet-smoke",
  chainId: 97,
  chainIdHex: "0x61",
  chainName: "BSC Testnet",
  rpcUrls: [
    "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
    "https://data-seed-prebsc-2-s1.binance.org:8545",
    "https://data-seed-prebsc-1-s2.binance.org:8545"
  ],
  blockExplorerUrls: ["https://testnet.bscscan.com"],
  nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  minimalRouterGasUnits: 180000,
  routerAddress: "0xA3E1fbe94055e7A8971b3994C7025B3c16273a24",
  quoteRouterAddress: null,
  executionRouterAddress: null,
  nativeRouterAddress: null,
  splitOptimizerAddress: null,
  autoRouterAddress: null,
  gasCostOracleAddress: null,
  dexes: [],
  tokens: [
    { symbol: "BNB", name: "BNB", address: "native", decimals: 18 },
    { symbol: "WBNB", name: "Wrapped BNB", address: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd", decimals: 18 },
    { symbol: "LQC", name: "LQC Test Token", address: "0x84a30A66cFCbb15453C83204B7e6eC436a0718Fc", decimals: 18 }
  ]
});
