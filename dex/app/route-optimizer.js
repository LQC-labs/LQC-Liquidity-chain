(function () {
  "use strict";

  const { ethers } = window;
  const adapterAbi = [
    "function quoteExactInput(address tokenIn,address tokenOut,uint256 amountIn,bytes routeData) view returns (uint256 amountOut)"
  ];

  function pathsFor(tokenIn, tokenOut, connectors) {
    const endpoints = new Set([tokenIn.toLowerCase(), tokenOut.toLowerCase()]);
    const unique = [];
    for (const address of connectors) {
      if (!ethers.isAddress(address) || endpoints.has(address.toLowerCase())) continue;
      endpoints.add(address.toLowerCase());
      unique.push(address);
    }
    return [[tokenIn, tokenOut], ...unique.map((connector) => [tokenIn, connector, tokenOut])];
  }

  async function findOptimalSplit(viable, amountIn) {
    const candidates = viable.slice(0, 3);
    const attempts = [];
    for (let left = 0; left < candidates.length; left += 1) {
      for (let right = left + 1; right < candidates.length; right += 1) {
        const first = candidates[left];
        const second = candidates[right];
        for (let firstBps = 1_000; firstBps <= 9_000; firstBps += 1_000) {
          attempts.push((async () => {
            const firstAmount = amountIn * BigInt(firstBps) / 10_000n;
            const secondAmount = amountIn - firstAmount;
            try {
              const [firstOut, secondOut] = await Promise.all([
                first.contract.quoteExactInput(first.path[0], first.path.at(-1), firstAmount, first.routeData),
                second.contract.quoteExactInput(second.path[0], second.path.at(-1), secondAmount, second.routeData)
              ]);
              return {
                routes: [first, second],
                allocationBps: [firstBps, 10_000 - firstBps],
                legOutputs: [firstOut, secondOut],
                amountOut: firstOut + secondOut
              };
            } catch {
              return null;
            }
          })());
        }
      }
    }
    const splits = (await Promise.all(attempts)).filter(Boolean);
    return splits.sort((a, b) => a.amountOut === b.amountOut ? 0 : a.amountOut > b.amountOut ? -1 : 1)[0] || null;
  }

  async function findOptimalRoute({ provider, tokenIn, tokenOut, amountIn, adapters, connectors, slippageBps, allowSplit = false }) {
    const attempts = [];
    for (const adapter of adapters.filter((item) => ethers.isAddress(item.address))) {
      const contract = new ethers.Contract(adapter.address, adapterAbi, provider);
      for (const path of pathsFor(tokenIn, tokenOut, connectors)) {
        const routeData = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [path]);
        attempts.push((async () => {
          try {
            const amountOut = await contract.quoteExactInput(tokenIn, tokenOut, amountIn, routeData);
            return amountOut > 0n ? { adapter, contract, path, routeData, amountOut } : null;
          } catch {
            return null;
          }
        })());
      }
    }
    const viable = (await Promise.all(attempts)).filter(Boolean).sort((a, b) =>
      a.amountOut === b.amountOut ? a.path.length - b.path.length : a.amountOut > b.amountOut ? -1 : 1
    );
    if (!viable.length) throw new Error("사용 가능한 Router 2.0 경로가 없습니다.");
    const best = viable[0];
    const split = allowSplit ? await findOptimalSplit(viable, amountIn) : null;
    const minimumImprovement = best.amountOut * 10n / 10_000n;
    if (split && split.amountOut > best.amountOut + minimumImprovement) {
      const improvementAmount = split.amountOut - best.amountOut;
      return {
        strategy: "split",
        amountOut: split.amountOut,
        amountOutMin: split.amountOut * BigInt(10_000 - slippageBps) / 10_000n,
        adapters: split.routes.map((route) => route.adapter.address),
        routeData: split.routes.map((route) => route.routeData),
        allocationBps: split.allocationBps,
        routes: split.routes,
        improvementAmount,
        improvementBps: Number(improvementAmount * 10_000n / best.amountOut),
        alternatives: viable.slice(0, 3),
        comparedRoutes: viable.length
      };
    }
    return {
      ...best,
      strategy: "single",
      amountOutMin: best.amountOut * BigInt(10_000 - slippageBps) / 10_000n,
      alternatives: viable.slice(1, 4),
      comparedRoutes: viable.length
    };
  }

  window.LQCRouteOptimizer = Object.freeze({ findOptimalRoute });
})();
