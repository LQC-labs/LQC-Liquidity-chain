import { ethers } from "ethers";

const requiredContracts = ["router", "quoteRouter", "executionRouter", "nativeRouter", "splitOptimizer", "autoRouter", "gasCostOracle", "wBNB", "lqc"];
const contractAddress = (deployment, name) => deployment?.contracts?.[name]?.address;
const same = (a, b) => ethers.getAddress(a) === ethers.getAddress(b);
const MAX_REVIEWED_TOKENS = 500;

function validateReviewedToken(token, index, dexIds) {
  if (!token || typeof token !== "object") throw new Error(`Reviewed token ${index} is invalid.`);
  const symbol = String(token.symbol || "").trim();
  const name = String(token.name || "").trim();
  const decimals = Number(token.decimals);
  if (!/^[A-Za-z0-9._-]{1,16}$/.test(symbol)) throw new Error(`Reviewed token ${index} has an invalid symbol.`);
  if (name.length < 1 || name.length > 64) throw new Error(`Reviewed token ${index} has an invalid name.`);
  if (!ethers.isAddress(token.address)) throw new Error(`Reviewed token ${index} has an invalid address.`);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error(`Reviewed token ${index} has invalid decimals.`);
  if (token.riskApproved !== true) throw new Error(`Reviewed token ${index} is not risk-approved.`);
  if (!Array.isArray(token.routeDexIds) || token.routeDexIds.length === 0) throw new Error(`Reviewed token ${index} has no approved DEX routes.`);
  const routeDexIds = token.routeDexIds.map(value => String(value).toLowerCase());
  if (new Set(routeDexIds).size !== routeDexIds.length || routeDexIds.some(value => !dexIds.has(value))) {
    throw new Error(`Reviewed token ${index} references an invalid or duplicate DEX route.`);
  }
  return { symbol, name, address: ethers.getAddress(token.address), decimals, reviewed: true, routeDexIds };
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
  tokens.push(...reviewedTokens.map((token, index) => validateReviewedToken(token, index, seen)));
  const seenTokenAddresses = new Set(), seenSymbols = new Set();
  for (const [index, token] of tokens.entries()) {
    const addressKey = token.address === "native" ? "native" : ethers.getAddress(token.address).toLowerCase();
    const symbolKey = token.symbol.toLowerCase();
    if (seenTokenAddresses.has(addressKey)) throw new Error(`UI token ${index} duplicates an address.`);
    if (seenSymbols.has(symbolKey)) throw new Error(`UI token ${index} duplicates a symbol.`);
    seenTokenAddresses.add(addressKey); seenSymbols.add(symbolKey);
  }
  const reviewedPairsInput = deployment.reviewedPairs ?? [];
  if (!Array.isArray(reviewedPairsInput) || reviewedPairsInput.length > MAX_REVIEWED_TOKENS * 4) {
    throw new Error("Deployment reviewedPairs is invalid or exceeds the configured limit.");
  }
  const knownTokenAddresses = new Set(tokens.filter(token => token.address !== "native")
    .map(token => ethers.getAddress(token.address).toLowerCase()));
  const reviewedByAddress = new Map(tokens.filter(token => token.reviewed)
    .map(token => [ethers.getAddress(token.address).toLowerCase(), token]));
  const seenPairs = new Set();
  const reviewedPairs = reviewedPairsInput.map((pair, index) => {
    if (!ethers.isAddress(pair?.tokenA) || !ethers.isAddress(pair?.tokenB)) throw new Error(`Reviewed pair ${index} has invalid token addresses.`);
    const tokenA = ethers.getAddress(pair.tokenA), tokenB = ethers.getAddress(pair.tokenB);
    const endpoints = [tokenA.toLowerCase(), tokenB.toLowerCase()].sort();
    if (endpoints[0] === endpoints[1] || endpoints.some(value => !knownTokenAddresses.has(value))) {
      throw new Error(`Reviewed pair ${index} has unknown or identical tokens.`);
    }
    if (!reviewedByAddress.has(endpoints[0]) && !reviewedByAddress.has(endpoints[1])) {
      throw new Error(`Reviewed pair ${index} must include a reviewed token.`);
    }
    const pairKey = endpoints.join(":");
    if (seenPairs.has(pairKey)) throw new Error(`Reviewed pair ${index} duplicates a token pair.`);
    seenPairs.add(pairKey);
    if (!Array.isArray(pair.dexIds) || pair.dexIds.length === 0) throw new Error(`Reviewed pair ${index} has no approved DEX routes.`);
    const dexIds = pair.dexIds.map(value => String(value).toLowerCase());
    if (new Set(dexIds).size !== dexIds.length || dexIds.some(value => !seen.has(value))) {
      throw new Error(`Reviewed pair ${index} references an invalid or duplicate DEX route.`);
    }
    for (const endpoint of endpoints) {
      const token = reviewedByAddress.get(endpoint);
      if (token && dexIds.some(dexId => !token.routeDexIds.includes(dexId))) {
        throw new Error(`Reviewed pair ${index} exceeds its token DEX approval.`);
      }
    }
    return { tokenA, tokenB, dexIds };
  });
  for (const address of reviewedByAddress.keys()) {
    if (!reviewedPairs.some(pair => pair.tokenA.toLowerCase() === address || pair.tokenB.toLowerCase() === address)) {
      throw new Error(`Reviewed token ${address} has no approved token pair.`);
    }
  }
  const candleDataUrl = String(deployment.ui?.candleDataUrl || "").trim();
  const candleSignerAddress=String(deployment.ui?.candleSignerAddress||"").trim();
  const candleFinalityBlocks=Number(deployment.ui?.candleFinalityBlocks??12);
  const rpcUrls=deployment.ui?.rpcUrls??deployment.network?.rpcUrls??["https://data-seed-prebsc-1-s1.bnbchain.org:8545"];
  if(!Array.isArray(rpcUrls)||rpcUrls.length<1||rpcUrls.length>5||new Set(rpcUrls).size!==rpcUrls.length)throw new Error("Deployment rpcUrls must contain 1 to 5 unique endpoints.");
  for(const value of rpcUrls){let parsed;try{parsed=new URL(value)}catch{throw new Error("Deployment rpcUrls contains an invalid endpoint.")}if(parsed.protocol!=="https:"&&parsed.hostname!=="localhost")throw new Error("Deployment rpcUrls must use HTTPS.")}
  if(!Number.isSafeInteger(candleFinalityBlocks)||candleFinalityBlocks<2||candleFinalityBlocks>200)throw new Error("Deployment candleFinalityBlocks must be between 2 and 200.");
  if (candleDataUrl) {
    let parsed; try { parsed = new URL(candleDataUrl); } catch { throw new Error("Deployment candleDataUrl is invalid."); }
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") throw new Error("Deployment candleDataUrl must use HTTPS.");
    if(!ethers.isAddress(candleSignerAddress))throw new Error("Deployment candleSignerAddress is required for signed candle data.");
  }else if(candleSignerAddress)throw new Error("Deployment candleSignerAddress requires candleDataUrl.");
  const fingerprintPayload = { chainId: 97, contracts: mapped, rpcUrls, candleDataUrl, candleSignerAddress:candleSignerAddress?ethers.getAddress(candleSignerAddress):"", candleFinalityBlocks, dexes: dexes.map(({ id, adapter }) => ({ id, adapter })),
    tokens: tokens.filter(token => token.address !== "native").map(({ symbol, name, address, decimals, reviewed = false, routeDexIds = [] }) =>
      ({ symbol, name, address, decimals, reviewed, routeDexIds })), reviewedPairs };
  return { chainId: 97, chainIdHex: "0x61", chainName: "BSC Testnet",
    rpcUrls, blockExplorerUrls: ["https://testnet.bscscan.com"],
    nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 }, routerAddress: mapped.router,
    quoteRouterAddress: mapped.quoteRouter, executionRouterAddress: mapped.executionRouter, nativeRouterAddress: mapped.nativeRouter,
    splitOptimizerAddress: mapped.splitOptimizer, autoRouterAddress: mapped.autoRouter, gasCostOracleAddress: mapped.gasCostOracle,
    candleDataUrl, candleSignerAddress:candleSignerAddress?ethers.getAddress(candleSignerAddress):"", candleFinalityBlocks, dexes, tokens, reviewedPairs, deploymentFingerprint: ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(fingerprintPayload))) };
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
