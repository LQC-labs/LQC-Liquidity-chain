import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ethers } from "ethers";
import { assertBscTestnetChain, validateBscTestnet } from "./validate-bsc-testnet.mjs";

const REGISTRY_ABI = [
  "function getDex(bytes32) view returns(address adapter,bool enabled,uint32 priority)"
];
const ADAPTER_ABI = [
  "function quoteExactInput(address,address,uint256,bytes) view returns(uint256)"
];
const EXECUTION_ABI = [
  "function swapExactInput(bytes32,address,address,uint256,uint256,address,uint256,bytes) returns(uint256)"
];
const ERC20_ABI = [
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)"
];

export function parseRouteProbes(value) {
  const probes = JSON.parse(value);
  if (!Array.isArray(probes) || probes.length === 0) throw new Error("Route probes must be a non-empty array.");
  const seen = new Set();
  return probes.map((probe, index) => {
    if (!ethers.isHexString(probe?.dexId, 32)) throw new Error(`Probe ${index} has an invalid dexId.`);
    if (!ethers.isAddress(probe?.tokenIn) || !ethers.isAddress(probe?.tokenOut) ||
        ethers.getAddress(probe.tokenIn) === ethers.getAddress(probe.tokenOut)) {
      throw new Error(`Probe ${index} has invalid tokens.`);
    }
    const hasRouteData = ethers.isHexString(probe?.routeData) && probe.routeData !== "0x";
    const hasPath = Array.isArray(probe?.path);
    if (!hasRouteData && !hasPath) {
      throw new Error(`Probe ${index} must provide routeData or path.`);
    }
    if (probe?.routeData !== undefined && !hasRouteData) {
      throw new Error(`Probe ${index} has invalid routeData.`);
    }
    if (hasPath && (probe.path.length < 2 || probe.path.length > 4 ||
        probe.path.some(token => !ethers.isAddress(token)))) {
      throw new Error(`Probe ${index} has an invalid path.`);
    }
    let amountIn;
    try { amountIn = BigInt(probe.amountInRaw); } catch { throw new Error(`Probe ${index} amountInRaw must be an integer.`); }
    if (amountIn <= 0n) throw new Error(`Probe ${index} amountInRaw must be positive.`);
    if (amountIn > ethers.MaxUint256) throw new Error(`Probe ${index} amountInRaw exceeds uint256.`);
    const key = `${probe.dexId.toLowerCase()}:${ethers.getAddress(probe.tokenIn)}:${ethers.getAddress(probe.tokenOut)}`;
    if (seen.has(key)) throw new Error(`Probe ${index} duplicates a DEX/token route.`);
    seen.add(key);
    return { ...probe, amountInRaw: amountIn.toString() };
  });
}

const sameAddress = (a, b) => ethers.getAddress(a) === ethers.getAddress(b);
const poolKey = (tokenA, tokenB, fee) => {
  const [token0, token1] = [ethers.getAddress(tokenA), ethers.getAddress(tokenB)].sort();
  return `${token0}:${token1}:${Number(fee)}`;
};

export function resolveRouteData(probe, dex) {
  if (!probe.path) {
    if (dex.kind === "v3") throw new Error(`${probe.label || dex.name} V3 probes must provide a structured path and fees.`);
    return probe.routeData;
  }
  const path = probe.path.map(ethers.getAddress);
  if (!sameAddress(path[0], probe.tokenIn) || !sameAddress(path.at(-1), probe.tokenOut)) {
    throw new Error(`${probe.label || dex.name} path endpoints do not match tokenIn/tokenOut.`);
  }
  if (dex.kind !== "v3") {
    return ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [path]);
  }

  const fees = probe.fees;
  if (!Array.isArray(fees) || fees.length !== path.length - 1) {
    throw new Error(`${probe.label || dex.name} V3 fees must match the path hop count.`);
  }
  if (path.length - 1 > dex.maxHops) {
    throw new Error(`${probe.label || dex.name} V3 path exceeds the deployed maximum hop count.`);
  }
  const approvedFees = new Set((dex.feeTiers || []).map(Number));
  const approvedPools = new Set((dex.pools || []).map(pool => poolKey(pool.tokenA, pool.tokenB, pool.fee)));
  const types = [];
  const values = [];
  path.forEach((token, index) => {
    types.push("address");
    values.push(token);
    if (index < fees.length) {
      const fee = Number(fees[index]);
      if (!Number.isInteger(fee) || !approvedFees.has(fee)) {
        throw new Error(`${probe.label || dex.name} uses an unapproved V3 fee tier.`);
      }
      if (!approvedPools.has(poolKey(token, path[index + 1], fee))) {
        throw new Error(`${probe.label || dex.name} uses a V3 pool outside the deployment allowlist.`);
      }
      types.push("uint24");
      values.push(fee);
    }
  });
  return ethers.solidityPacked(types, values);
}

export function assertProbeMatchesDeployment(probe, deployment) {
  const dex = deployment.dexes.find(item => item.id.toLowerCase() === probe.dexId.toLowerCase());
  if (!dex) throw new Error(`${probe.label || probe.dexId} is not in the deployment record.`);
  if (!ethers.isAddress(dex.adapter)) throw new Error(`${dex.name || probe.dexId} has no recorded adapter.`);
  assertProbePairApproved(probe, deployment, dex);
  return dex;
}

const normalizedPair = (a, b) => [ethers.getAddress(a), ethers.getAddress(b)].sort().join(":");

export function assertProbePairApproved(probe, deployment, dex) {
  const builtInPairs = [];
  const lqc = deployment?.contracts?.lqc?.address;
  const wbnb = deployment?.contracts?.wbnb?.address;
  const usdt = deployment?.contracts?.mockUsdt?.address;
  if (ethers.isAddress(lqc) && ethers.isAddress(wbnb)) builtInPairs.push(normalizedPair(lqc, wbnb));
  if (ethers.isAddress(lqc) && ethers.isAddress(usdt)) builtInPairs.push(normalizedPair(lqc, usdt));
  const key = normalizedPair(probe.tokenIn, probe.tokenOut);
  if (builtInPairs.includes(key)) return;
  const approved = (deployment.reviewedPairs || []).some(pair =>
    ethers.isAddress(pair?.tokenA) && ethers.isAddress(pair?.tokenB) &&
    normalizedPair(pair.tokenA, pair.tokenB) === key && Array.isArray(pair.dexIds) &&
    pair.dexIds.some(id => String(id).toLowerCase() === probe.dexId.toLowerCase())
  );
  if (!approved) throw new Error(`${dex.name || probe.dexId} probe pair is outside the deployment approval registry.`);
}

export async function resolveCanonicalQuoteBlock(provider, finalityBlocks = 12) {
  if (!Number.isSafeInteger(finalityBlocks) || finalityBlocks < 2 || finalityBlocks > 200) {
    throw new Error("Quote finality must be between 2 and 200 blocks.");
  }
  const head = await provider.getBlockNumber();
  if (!Number.isSafeInteger(head) || head < finalityBlocks) throw new Error("RPC returned an invalid quote head block.");
  return head - finalityBlocks;
}

export async function probeRoutes({ provider, deployment, probes, finalityBlocks = 12 }) {
  assertBscTestnetChain((await provider.getNetwork()).chainId);
  const canonicalBlock = await resolveCanonicalQuoteBlock(provider, finalityBlocks);
  const registry = new ethers.Contract(deployment.contracts.dexRegistry.address, REGISTRY_ABI, provider);
  const results = [];
  for (const probe of probes) {
    const recorded = assertProbeMatchesDeployment(probe, deployment);
    const [adapterAddress, enabled] = await registry.getDex(probe.dexId, { blockTag: canonicalBlock });
    if (!enabled) throw new Error(`${recorded.name} is disabled.`);
    if (ethers.getAddress(adapterAddress) !== ethers.getAddress(recorded.adapter)) {
      throw new Error(`${recorded.name} adapter differs from the deployment record.`);
    }
    const routeData = resolveRouteData(probe, recorded);
    const adapter = new ethers.Contract(adapterAddress, ADAPTER_ABI, provider);
    const amountOut = await adapter.quoteExactInput(
      probe.tokenIn, probe.tokenOut, BigInt(probe.amountInRaw), routeData, { blockTag: canonicalBlock }
    );
    if (amountOut <= 0n) throw new Error(`${recorded.name} returned a zero quote.`);
    results.push({ ...probe, routeData, dexName: recorded.name, adapter: adapterAddress, amountOutRaw: amountOut.toString(), canonicalBlock });
  }
  return results;
}

async function executeProbe({ wallet, deployment, probe, quote, minimumOutputBps, maximumInputRaw }) {
  const amountIn = BigInt(probe.amountInRaw);
  if (amountIn > maximumInputRaw) throw new Error(`${quote.dexName} probe exceeds SMOKE_MAX_INPUT_RAW.`);
  const executionAddress = deployment.contracts.executionRouter.address;
  const execution = new ethers.Contract(executionAddress, EXECUTION_ABI, wallet);
  const tokenIn = new ethers.Contract(probe.tokenIn, ERC20_ABI, wallet);
  const tokenOut = new ethers.Contract(probe.tokenOut, ERC20_ABI, wallet);
  const recipient = wallet.address;
  if (await tokenIn.balanceOf(wallet.address) < amountIn) throw new Error(`Insufficient input balance for ${quote.dexName}.`);
  const minOut = BigInt(quote.amountOutRaw) * BigInt(minimumOutputBps) / 10_000n;
  if (minOut <= 0n) throw new Error(`${quote.dexName} minimum output rounded to zero.`);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  const existingAllowance = await tokenIn.allowance(wallet.address, executionAddress);
  if (existingAllowance !== 0n) await (await tokenIn.approve(executionAddress, 0)).wait();
  await (await tokenIn.approve(executionAddress, amountIn)).wait();
  try {
    await execution.swapExactInput.estimateGas(
      probe.dexId, probe.tokenIn, probe.tokenOut, amountIn, minOut, recipient, deadline, quote.routeData
    );
    await assertRejected(() => execution.swapExactInput.estimateGas(
      probe.dexId, probe.tokenIn, probe.tokenOut, amountIn, minOut, recipient, deadline - 3600n, quote.routeData
    ), `${quote.dexName} expired-swap recovery check unexpectedly succeeded.`);
    await assertRejected(() => execution.swapExactInput.estimateGas(
      probe.dexId, probe.tokenIn, probe.tokenOut, amountIn, ethers.MaxUint256, recipient, deadline, quote.routeData
    ), `${quote.dexName} minimum-output recovery check unexpectedly succeeded.`);

    const before = await tokenOut.balanceOf(recipient);
    const tx = await execution.swapExactInput(
      probe.dexId, probe.tokenIn, probe.tokenOut, amountIn, minOut, recipient, deadline, quote.routeData
    );
    await tx.wait();
    const received = (await tokenOut.balanceOf(recipient)) - before;
    const adapter = quote.adapter;
    if (received < minOut) throw new Error(`${quote.dexName} received less than the protected minimum.`);
    for (const token of [tokenIn, tokenOut]) {
      if (await token.balanceOf(executionAddress) !== 0n || await token.balanceOf(adapter) !== 0n) {
        throw new Error(`${quote.dexName} left token custody behind.`);
      }
    }
    if (await tokenIn.allowance(executionAddress, adapter) !== 0n) {
      throw new Error(`${quote.dexName} left an adapter allowance behind.`);
    }
    return { dexId: probe.dexId, dexName: quote.dexName, txHash: tx.hash, amountInRaw: amountIn.toString(), amountOutRaw: received.toString() };
  } finally {
    if (await tokenIn.allowance(wallet.address, executionAddress) !== 0n) {
      await (await tokenIn.approve(executionAddress, 0)).wait();
    }
  }
}

async function assertRejected(action, message) {
  try { await action(); } catch { return; }
  throw new Error(message);
}

async function main() {
  const rpcUrl = process.env.BSC_TESTNET_RPC_URL;
  const probesPath = process.env.ROUTE_PROBES_FILE;
  if (!rpcUrl || !probesPath) throw new Error("Set BSC_TESTNET_RPC_URL and ROUTE_PROBES_FILE.");
  const root = path.resolve(import.meta.dirname, "..");
  const deploymentPath = path.resolve(process.env.DEPLOYMENT_FILE || path.join(root, "deployments/bsc-testnet-97.json"));
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const probes = parseRouteProbes(fs.readFileSync(path.resolve(probesPath), "utf8"));
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  await validateBscTestnet({ provider, deployment });
  const quoteFinalityBlocks = Number(process.env.SMOKE_QUOTE_FINALITY_BLOCKS || deployment.ui?.candleFinalityBlocks || 12);
  const quotes = await probeRoutes({ provider, deployment, probes, finalityBlocks: quoteFinalityBlocks });

  const execute = process.env.EXECUTE_SMOKE_SWAP === "true";
  if (!execute) {
    console.log(JSON.stringify({ mode: "read-only", chainId: 97, quotes }, null, 2));
    return;
  }
  if (!process.env.DEPLOYER_PRIVATE_KEY) throw new Error("Set DEPLOYER_PRIVATE_KEY only in the runtime environment.");
  const minimumOutputBps = Number(process.env.SMOKE_MIN_OUTPUT_BPS || "9900");
  const maximumInputRaw = BigInt(process.env.SMOKE_MAX_INPUT_RAW || "1000000000000000000");
  if (!Number.isInteger(minimumOutputBps) || minimumOutputBps < 9500 || minimumOutputBps > 9999) {
    throw new Error("SMOKE_MIN_OUTPUT_BPS must be an integer from 9500 to 9999.");
  }
  if (maximumInputRaw <= 0n) throw new Error("SMOKE_MAX_INPUT_RAW must be positive.");
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  const swaps = [];
  for (let index = 0; index < probes.length; index++) {
    swaps.push(await executeProbe({ wallet, deployment, probe: probes[index], quote: quotes[index], minimumOutputBps, maximumInputRaw }));
  }
  console.log(JSON.stringify({ mode: "executed", chainId: 97, swaps }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
