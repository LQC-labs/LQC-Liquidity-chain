import { ethers } from "ethers";

const requiredContracts = ["router", "quoteRouter", "executionRouter", "nativeRouter", "splitOptimizer", "autoRouter", "gasCostOracle", "wBNB", "lqc"];
const contractAddress = (deployment, name) => deployment?.contracts?.[name]?.address;
const same = (a, b) => ethers.getAddress(a) === ethers.getAddress(b);
const MAX_REVIEWED_TOKENS = 500;

function validateReviewedToken(token, index) {
  if (!token || typeof token !== "object") throw new Error(`Reviewed token ${index} is invalid.`);
  const symbol = String(token.symbol || "").trim();
  const name = String(token.name || "").trim();
  const decimals = Number(token.decimals);
  if (!/^[A-Za-z0-9._-]{1,16}$/.test(symbol)) throw new Error(`Reviewed token ${index} has an invalid symbol.`);
  if (name.length < 1 || name.length > 64) throw new Error(`Reviewed token ${index} has an invalid name.`);
  if (!ethers.isAddress(token.address)) throw new Error(`Reviewed token ${index} has an invalid address.`);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error(`Reviewed token ${index} has invalid decimals.`);
  if (token.riskApproved !== true) throw new Error(`Reviewed token ${index} is not risk-approved.`);
  return { symbol, name, address: ethers.getAddress(token.address), decimals, reviewed: true };
}

export function buildAppConfig(deployment) {
  if (Number(deployment?.network?.chainId) !== 97) throw new Error("UI deployment must target BSC testnet chain 97.");
  const mapped = { router: contractAddress(deployment, "router"), quoteRouter: contractAddress(deployment, "quoteRouter"),
    executionRouter: contractAddress(deployment, "executionRouter"), nativeRouter: contractAddress(deployment, "nativeRouter"),
    splitOptimizer: contractAddress(deployment, "splitOptimizer"), autoRouter: contractAddress(deployment, "autoRouter"),
    gasCostOracle: contractAddress(deployment, "gasCostOracle"), wBNB: contractAddress(deployment, "wbnb"), lqc: contractAddress(deployment, "lqc") };
  for (const name of requiredContracts) if (!ethers.isAddress(mapped[name])) throw new Error(`Deployment record is missing a valid ${name} address.`);
  if (!Array.isArray(deployment.dexes) || deployment.dexes.length === 0) throw new Error("Deployment record has no DEXes.");
  const seen = new Set();
  const dexes = deployment.dexes.map((dex, index) => {
    if (!ethers.isHexString(dex?.id, 32) || !ethers.isAddress(dex?.adapter) || typeof dex?.name !== "string") throw new Error(`Deployment DEX ${index} is invalid.`);
    const key = dex.id.toLowerCase();
    if (seen.has(key)) throw new Error(`Deployment DEX ${index} duplicates an id.`);
    seen.add(key); return dex;
  });
  const tokens = [
    { symbol: "BNB", name: "BNB", address: "native", decimals: 18 },
    { symbol: "WBNB", name: "Wrapped BNB", address: mapped.wBNB, decimals: Number(deployment.contracts.wbnb.decimals ?? 18) },
    { symbol: "LQC", name: "LQC Test Token", address: mapped.lqc, decimals: Number(deployment.contracts.lqc.decimals ?? 18) }
  ];
  if (deployment.contracts.mockUsdt?.address) {
    if (!ethers.isAddress(deployment.contracts.mockUsdt.address)) throw new Error("Deployment record has an invalid mockUsdt address.");
    tokens.push({ symbol: "USDT", name: "Mock USDT", address: deployment.contracts.mockUsdt.address, decimals: Number(deployment.contracts.mockUsdt.decimals ?? 18) });
  }
  const reviewedTokens = deployment.reviewedTokens ?? [];
  if (!Array.isArray(reviewedTokens) || reviewedTokens.length > MAX_REVIEWED_TOKENS) {
    throw new Error(`Deployment reviewedTokens must be an array of at most ${MAX_REVIEWED_TOKENS} entries.`);
  }
  tokens.push(...reviewedTokens.map(validateReviewedToken));
  const seenTokenAddresses = new Set(), seenSymbols = new Set();
  for (const [index, token] of tokens.entries()) {
    const addressKey = token.address === "native" ? "native" : ethers.getAddress(token.address).toLowerCase();
    const symbolKey = token.symbol.toLowerCase();
    if (seenTokenAddresses.has(addressKey)) throw new Error(`UI token ${index} duplicates an address.`);
    if (seenSymbols.has(symbolKey)) throw new Error(`UI token ${index} duplicates a symbol.`);
    seenTokenAddresses.add(addressKey); seenSymbols.add(symbolKey);
  }
  const fingerprintPayload = { chainId: 97, contracts: mapped, dexes: dexes.map(({ id, adapter }) => ({ id, adapter })),
    tokens: tokens.filter(token => token.address !== "native").map(({ symbol, name, address, decimals, reviewed = false }) =>
      ({ symbol, name, address, decimals, reviewed })) };
  return { chainId: 97, chainIdHex: "0x61", chainName: "BSC Testnet",
    rpcUrls: ["https://data-seed-prebsc-1-s1.bnbchain.org:8545"], blockExplorerUrls: ["https://testnet.bscscan.com"],
    nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 }, routerAddress: mapped.router,
    quoteRouterAddress: mapped.quoteRouter, executionRouterAddress: mapped.executionRouter, nativeRouterAddress: mapped.nativeRouter,
    splitOptimizerAddress: mapped.splitOptimizer, autoRouterAddress: mapped.autoRouter, gasCostOracleAddress: mapped.gasCostOracle,
    dexes, tokens, deploymentFingerprint: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(fingerprintPayload))) };
}

export function assertOverridesMatchDeployment(config, env) {
  const checks = { ROUTER_ADDRESS: config.routerAddress, QUOTE_ROUTER_ADDRESS: config.quoteRouterAddress,
    EXECUTION_ROUTER_ADDRESS: config.executionRouterAddress, NATIVE_ROUTER_ADDRESS: config.nativeRouterAddress,
    SPLIT_OPTIMIZER_ADDRESS: config.splitOptimizerAddress, AUTO_ROUTER_ADDRESS: config.autoRouterAddress,
    GAS_COST_ORACLE_ADDRESS: config.gasCostOracleAddress, WBNB_ADDRESS: config.tokens.find(token => token.symbol === "WBNB").address,
    LQC_ADDRESS: config.tokens.find(token => token.symbol === "LQC").address };
  for (const [name, expected] of Object.entries(checks)) {
    if (env[name] && (!ethers.isAddress(env[name]) || !same(env[name], expected))) throw new Error(`${name} does not match the deployment record.`);
  }
}
