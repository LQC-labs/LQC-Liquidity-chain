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

  async function findOptimalRoute({ provider, tokenIn, tokenOut, amountIn, adapters, connectors, slippageBps }) {
    const attempts = [];
    for (const adapter of adapters.filter((item) => ethers.isAddress(item.address))) {
      const contract = new ethers.Contract(adapter.address, adapterAbi, provider);
      for (const path of pathsFor(tokenIn, tokenOut, connectors)) {
        const routeData = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [path]);
        attempts.push((async () => {
          try {
            const amountOut = await contract.quoteExactInput(tokenIn, tokenOut, amountIn, routeData);
            return amountOut > 0n ? { adapter, path, routeData, amountOut } : null;
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
    return {
      ...best,
      amountOutMin: best.amountOut * BigInt(10_000 - slippageBps) / 10_000n,
      alternatives: viable.slice(1, 4)
    };
  }

  window.LQCRouteOptimizer = Object.freeze({ findOptimalRoute });
})();
