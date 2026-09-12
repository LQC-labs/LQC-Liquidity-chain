import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { assertBscTestnetChain, validateBscTestnet } from "./validate-bsc-testnet.mjs";
import { parseRouteProbes, probeRoutes } from "./smoke-test-bsc-routes.mjs";

export function parseTradePolicy(env = process.env) {
  const slippageBps = Number(env.TRADE_SLIPPAGE_BPS || "100");
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 1000) {
    throw new Error("TRADE_SLIPPAGE_BPS must be an integer from 1 to 1000.");
  }
  const minimumOutputBps = 10_000 - slippageBps;
  const maxGasPriceGwei = Number(env.TRADE_MAX_GAS_PRICE_GWEI || "50");
  if (!Number.isFinite(maxGasPriceGwei) || maxGasPriceGwei <= 0) {
    throw new Error("TRADE_MAX_GAS_PRICE_GWEI must be positive.");
  }
  return { slippageBps, minimumOutputBps, maxGasPriceGwei };
}

export function buildTradePreflightReport({ chainId, deploymentPath, policy, feeData, quotes }) {
  const gasPriceWei = feeData?.gasPrice ?? feeData?.maxFeePerGas ?? null;
  if (gasPriceWei === null) throw new Error("RPC did not return a usable gas price.");
  const gasPriceGwei = Number(ethers.formatUnits(gasPriceWei, "gwei"));
  if (!Number.isFinite(gasPriceGwei) || gasPriceGwei > policy.maxGasPriceGwei) {
    throw new Error("Current testnet gas price exceeds TRADE_MAX_GAS_PRICE_GWEI.");
  }
  const checkedQuotes = quotes.map(quote => {
    const amountOutRaw = BigInt(quote.amountOutRaw);
    const minimumOutputRaw = amountOutRaw * BigInt(policy.minimumOutputBps) / 10_000n;
    if (amountOutRaw <= 0n || minimumOutputRaw <= 0n) {
      throw new Error(`Quote for ${quote.dexName} is not usable under the configured slippage policy.`);
    }
    return { dexId: quote.dexId, dexName: quote.dexName, tokenIn: quote.tokenIn,
      tokenOut: quote.tokenOut, amountInRaw: quote.amountInRaw,
      amountOutRaw: amountOutRaw.toString(), minimumOutputRaw: minimumOutputRaw.toString() };
  });
  return { mode: "read-only", chainId, deploymentPath, policy,
    gasPriceWei: gasPriceWei.toString(), gasPriceGwei, quotes: checkedQuotes,
    transactionSubmitted: false };
}

async function main() {
  if (process.env.EXECUTE_SMOKE_SWAP === "true") {
    throw new Error("preflight:trade is read-only; use smoke:testnet only after separate operational approval.");
  }
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL;
  const probesPath = process.env.ROUTE_PROBES_FILE;
  if (!rpcUrl || !probesPath) throw new Error("Set BSC_TESTNET_RPC_URL and ROUTE_PROBES_FILE.");
  const root = path.resolve(import.meta.dirname, "..");
  const deploymentPath = path.resolve(process.env.DEPLOYMENT_FILE || path.join(root, "deployments/bsc-testnet-97.json"));
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  assertBscTestnetChain(network.chainId);
  const validation = await validateBscTestnet({ provider, deployment });
  if (!validation.safeForSmokeTest) throw new Error("Deployment is not marked safe for a bounded smoke test.");
  const probes = parseRouteProbes(fs.readFileSync(path.resolve(probesPath), "utf8"));
  const quotes = await probeRoutes({ provider, deployment, probes });
  console.log(JSON.stringify(buildTradePreflightReport({
    chainId: Number(network.chainId), deploymentPath, policy: parseTradePolicy(), feeData: await provider.getFeeData(), quotes
  }), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
