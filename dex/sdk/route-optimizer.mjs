import { ethers } from "ethers";

const adapterAbi = [
  "function quoteExactInput(address tokenIn,address tokenOut,uint256 amountIn,bytes routeData) view returns (uint256 amountOut)"
];

const sameAddress = (a, b) => a.toLowerCase() === b.toLowerCase();

function assertAddress(value, label) {
  if (!ethers.isAddress(value)) throw new Error(`${label} must be a valid address.`);
  return ethers.getAddress(value);
}

export function encodeV2Path(path) {
  return ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [path]);
}

export function generateCandidatePaths({ tokenIn, tokenOut, connectorTokens = [], maxIntermediates = 2, maxPaths = 64 }) {
  const input = assertAddress(tokenIn, "tokenIn");
  const output = assertAddress(tokenOut, "tokenOut");
  if (sameAddress(input, output)) throw new Error("tokenIn and tokenOut must differ.");
  if (!Number.isInteger(maxIntermediates) || maxIntermediates < 0 || maxIntermediates > 2) {
    throw new Error("maxIntermediates must be an integer from 0 to 2.");
  }
  if (!Number.isInteger(maxPaths) || maxPaths < 1 || maxPaths > 256) {
    throw new Error("maxPaths must be an integer from 1 to 256.");
  }

  const connectors = [];
  const seen = new Set([input.toLowerCase(), output.toLowerCase()]);
  for (const [index, value] of connectorTokens.entries()) {
    const address = assertAddress(value, `connectorTokens[${index}]`);
    const key = address.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      connectors.push(address);
    }
  }

  const paths = [[input, output]];
  if (maxIntermediates >= 1) {
    for (const connector of connectors) paths.push([input, connector, output]);
  }
  if (maxIntermediates >= 2) {
    for (const first of connectors) {
      for (const second of connectors) {
        if (!sameAddress(first, second)) paths.push([input, first, second, output]);
      }
    }
  }
  if (paths.length > maxPaths) throw new Error(`Candidate path count ${paths.length} exceeds limit ${maxPaths}.`);
  return paths;
}

export function createV2AdapterClient(provider, { id, address }) {
  const adapterAddress = assertAddress(address, `${id || "adapter"}.address`);
  const contract = new ethers.Contract(adapterAddress, adapterAbi, provider);
  return {
    id: id || adapterAddress,
    address: adapterAddress,
    encodeRouteData: encodeV2Path,
    quoteExactInput: (tokenIn, tokenOut, amountIn, routeData) =>
      contract.quoteExactInput(tokenIn, tokenOut, amountIn, routeData)
  };
}

export async function findOptimalRoute({
  tokenIn,
  tokenOut,
  amountIn,
  adapters,
  connectorTokens = [],
  maxIntermediates = 2,
  slippageBps = 50,
  maxPaths = 64
}) {
  const input = assertAddress(tokenIn, "tokenIn");
  const output = assertAddress(tokenOut, "tokenOut");
  const amount = BigInt(amountIn);
  if (amount <= 0n) throw new Error("amountIn must be greater than zero.");
  if (!Array.isArray(adapters) || adapters.length === 0 || adapters.length > 16) {
    throw new Error("Provide between 1 and 16 adapters.");
  }
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new Error("slippageBps must be an integer from 0 to 9999.");
  }

  const paths = generateCandidatePaths({
    tokenIn: input, tokenOut: output, connectorTokens, maxIntermediates, maxPaths
  });
  const attempts = [];
  for (const adapter of adapters) {
    const address = assertAddress(adapter.address, `${adapter.id || "adapter"}.address`);
    if (typeof adapter.quoteExactInput !== "function") throw new Error(`${adapter.id || address} has no quoteExactInput function.`);
    for (const path of paths) {
      const routeData = (adapter.encodeRouteData || encodeV2Path)(path);
      attempts.push((async () => {
        try {
          const amountOut = BigInt(await adapter.quoteExactInput(input, output, amount, routeData, path));
          if (amountOut <= 0n) return null;
          return { adapterId: adapter.id || address, adapterAddress: address, path, routeData, amountOut };
        } catch {
          return null;
        }
      })());
    }
  }

  const viable = (await Promise.all(attempts)).filter(Boolean).sort((a, b) =>
    a.amountOut === b.amountOut ? 0 : a.amountOut > b.amountOut ? -1 : 1
  );
  if (viable.length === 0) throw new Error("No viable route has liquidity for this trade.");

  const best = viable[0];
  const amountOutMin = best.amountOut * BigInt(10_000 - slippageBps) / 10_000n;
  return {
    ...best,
    amountIn: amount,
    amountOutMin,
    slippageBps,
    alternatives: viable.slice(1, 6),
    execution: {
      adapters: [best.adapterAddress],
      routeData: [best.routeData]
    }
  };
}
