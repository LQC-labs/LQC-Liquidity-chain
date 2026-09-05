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

export function createV2AdapterClient(provider, { id, address, estimateGasCostInOutput }) {
  const adapterAddress = assertAddress(address, `${id || "adapter"}.address`);
  const contract = new ethers.Contract(adapterAddress, adapterAbi, provider);
  return {
    id: id || adapterAddress,
    address: adapterAddress,
    encodeRouteData: encodeV2Path,
    estimateGasCostInOutput,
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
          const gasCostInOutput = typeof adapter.estimateGasCostInOutput === "function"
            ? BigInt(await adapter.estimateGasCostInOutput({ tokenIn: input, tokenOut: output, amountIn: amount, path, routeData }))
            : 0n;
          if (gasCostInOutput < 0n) throw new Error("Gas cost cannot be negative.");
          const netAmountOut = amountOut > gasCostInOutput ? amountOut - gasCostInOutput : 0n;
          return { adapterId: adapter.id || address, adapterAddress: address, path, routeData, amountOut, gasCostInOutput, netAmountOut };
        } catch {
          return null;
        }
      })());
    }
  }

  const viable = (await Promise.all(attempts)).filter(Boolean).sort((a, b) => {
    if (a.netAmountOut !== b.netAmountOut) return a.netAmountOut > b.netAmountOut ? -1 : 1;
    if (a.amountOut !== b.amountOut) return a.amountOut > b.amountOut ? -1 : 1;
    return a.path.length - b.path.length;
  });
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

export async function findOptimalTwoWaySplit({
  amountIn,
  routes,
  stepBps = 500,
  slippageBps = 50
}) {
  const amount = BigInt(amountIn);
  if (amount <= 0n) throw new Error("amountIn must be greater than zero.");
  if (!Array.isArray(routes) || routes.length < 2 || routes.length > 8) {
    throw new Error("Provide between 2 and 8 route candidates.");
  }
  if (!Number.isInteger(stepBps) || stepBps <= 0 || stepBps >= 10_000 || 10_000 % stepBps !== 0) {
    throw new Error("stepBps must evenly divide 10000 and be between 1 and 9999.");
  }
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps >= 10_000) {
    throw new Error("slippageBps must be an integer from 0 to 9999.");
  }

  for (const [index, route] of routes.entries()) {
    route.address = assertAddress(route.address, `routes[${index}].address`);
    if (typeof route.quoteExactInput !== "function") throw new Error(`routes[${index}] has no quoteExactInput function.`);
    if (typeof route.routeData !== "string") throw new Error(`routes[${index}].routeData must be encoded data.`);
  }

  const attempts = [];
  for (let first = 0; first < routes.length - 1; first += 1) {
    for (let second = first + 1; second < routes.length; second += 1) {
      for (let firstBps = stepBps; firstBps < 10_000; firstBps += stepBps) {
        attempts.push((async () => {
          const amountsIn = [
            amount * BigInt(firstBps) / 10_000n,
            amount - amount * BigInt(firstBps) / 10_000n
          ];
          if (amountsIn[0] === 0n || amountsIn[1] === 0n) return null;
          try {
            const amountsOut = await Promise.all([
              routes[first].quoteExactInput(amountsIn[0]),
              routes[second].quoteExactInput(amountsIn[1])
            ]).then((values) => values.map(BigInt));
            if (amountsOut.some((value) => value <= 0n)) return null;
            const totalOut = amountsOut[0] + amountsOut[1];
            const gasCosts = await Promise.all([routes[first], routes[second]].map(async (route, index) =>
              typeof route.estimateGasCostInOutput === "function"
                ? BigInt(await route.estimateGasCostInOutput(amountsIn[index]))
                : BigInt(route.gasCostInOutput || 0)
            ));
            const gasCostInOutput = gasCosts[0] + gasCosts[1];
            const netAmountOut = totalOut > gasCostInOutput ? totalOut - gasCostInOutput : 0n;
            return {
              routeIndexes: [first, second],
              adapters: [routes[first].address, routes[second].address],
              routeData: [routes[first].routeData, routes[second].routeData],
              allocationBps: [firstBps, 10_000 - firstBps],
              amountsIn,
              amountsOut,
              totalOut,
              gasCostInOutput,
              netAmountOut
            };
          } catch {
            return null;
          }
        })());
      }
    }
  }

  const viable = (await Promise.all(attempts)).filter(Boolean).sort((a, b) =>
    a.netAmountOut === b.netAmountOut ? 0 : a.netAmountOut > b.netAmountOut ? -1 : 1
  );
  if (viable.length === 0) throw new Error("No viable split route was found.");
  const best = viable[0];
  return {
    ...best,
    amountIn: amount,
    amountOutMin: best.totalOut * BigInt(10_000 - slippageBps) / 10_000n,
    slippageBps
  };
}
