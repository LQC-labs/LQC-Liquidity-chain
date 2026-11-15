import assert from "node:assert/strict";
import { ethers } from "ethers";
import { preflightProductionOracleDeployment } from "../scripts/preflight-master7-7-6-production-oracle-live.mjs";

const env = {
  BSC_TESTNET_RPC_URL: "http://unused",
  FUTURES_OWNER_ADDRESS: "0x89d992f696B40ABbDB6610144faeF336911D8175",
  FUTURES_INDEX_TOKEN: "0x1111111111111111111111111111111111111111",
  FUTURES_QUOTE_TOKEN: "0x2222222222222222222222222222222222222222",
  FUTURES_PRIMARY_FEED: "0x3333333333333333333333333333333333333333",
  FUTURES_TWAP_POOL: "0x4444444444444444444444444444444444444444",
  FUTURES_FEED_HEARTBEAT: "3600",
  FUTURES_MAX_DEVIATION_BPS: "500",
  FUTURES_TWAP_WINDOW: "1800",
  FUTURES_TWAP_MIN_LIQUIDITY: "100"
};

describe("Master 7/7-6 production Oracle live preflight", () => {
  it("exports a read-only preflight function", () => {
    assert.equal(typeof preflightProductionOracleDeployment, "function");
  });

  it("fails closed on wrong chain before any contract reads or transaction", async () => {
    const provider = {
      getNetwork: async () => ({ chainId: 56n })
    };
    await assert.rejects(
      () => preflightProductionOracleDeployment(env, provider),
      /chainId 97/
    );
  });

  it("requires real TWAP observations for the configured window", async () => {
    const feed = new ethers.Interface([
      "function decimals() view returns (uint8)",
      "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"
    ]);
    const pool = new ethers.Interface([
      "function token0() view returns (address)",
      "function token1() view returns (address)",
      "function liquidity() view returns (uint128)",
      "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
      "function observe(uint32[]) view returns (int56[],uint160[])"
    ]);
    let observeCalls = 0;
    const provider = {
      getNetwork: async () => ({ chainId: 97n }),
      getCode: async () => "0x6000",
      getBlock: async () => ({ number: 123, timestamp: 2000 }),
      call: async ({ to, data }) => {
        const iface = to.toLowerCase() === env.FUTURES_PRIMARY_FEED.toLowerCase() ? feed : pool;
        const fragment = iface.getFunction(data.slice(0, 10));
        switch (fragment.name) {
          case "decimals": return iface.encodeFunctionResult(fragment, [8]);
          case "latestRoundData": return iface.encodeFunctionResult(fragment, [1n, 200000000n, 1900n, 1900n, 1n]);
          case "token0": return iface.encodeFunctionResult(fragment, [env.FUTURES_INDEX_TOKEN]);
          case "token1": return iface.encodeFunctionResult(fragment, [env.FUTURES_QUOTE_TOKEN]);
          case "liquidity": return iface.encodeFunctionResult(fragment, [1000n]);
          case "slot0": return iface.encodeFunctionResult(fragment, [1n, 0, 0, 1, 1, 0, true]);
          case "observe": {
            observeCalls++;
            assert.deepEqual([...pool.decodeFunctionData(fragment, data)[0]], [1800n, 0n]);
            return iface.encodeFunctionResult(fragment, [[0n, 1800n], [1n, 2n]]);
          }
        }
        throw new Error("Unexpected method");
      }
    };
    const result = await preflightProductionOracleDeployment(env, provider);
    assert.equal(result.status, "READ_ONLY_LIVE_PREFLIGHT_PASS");
    assert.equal(result.twapPool.observationWindowVerified, true);
    assert.equal(observeCalls, 1);

    const unavailable = { ...provider, call: async (request) => {
      if (request.data.startsWith(pool.getFunction("observe").selector)) throw new Error("history unavailable");
      return provider.call(request);
    } };
    await assert.rejects(() => preflightProductionOracleDeployment(env, unavailable), /cannot provide the requested observation window/);
  });
});
