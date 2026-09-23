import { ethers } from "ethers";
import { validateProductionOracleConfig } from "./verify-master7-7-4-production-oracle-config.mjs";

const FEED_ABI = [
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"
];
const POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)"
];

export async function preflightProductionOracleDeployment(env, provider = new ethers.JsonRpcProvider(env.BSC_TESTNET_RPC_URL)) {
  const config = validateProductionOracleConfig(env);
  const network = await provider.getNetwork();
  if (network.chainId !== 97n) throw new Error("Expected BSC Testnet chainId 97.");

  const [feedCode, poolCode] = await Promise.all([
    provider.getCode(config.primaryFeed),
    provider.getCode(config.twapPool)
  ]);
  if (feedCode === "0x") throw new Error("Primary feed has no runtime bytecode.");
  if (poolCode === "0x") throw new Error("TWAP pool has no runtime bytecode.");

  const feed = new ethers.Contract(config.primaryFeed, FEED_ABI, provider);
  const pool = new ethers.Contract(config.twapPool, POOL_ABI, provider);

  const [decimals, round, token0, token1, liquidity, slot0, latest] = await Promise.all([
    feed.decimals(),
    feed.latestRoundData(),
    pool.token0(),
    pool.token1(),
    pool.liquidity(),
    pool.slot0(),
    provider.getBlock("latest")
  ]);
  if (!latest) throw new Error("Latest block unavailable.");

  const [roundId, answer,, updatedAt, answeredInRound] = round;
  if (Number(decimals) > 36) throw new Error("Primary feed decimals exceed 36.");
  if (answer <= 0n) throw new Error("Primary feed answer is not positive.");
  if (updatedAt === 0n || updatedAt > BigInt(latest.timestamp)) throw new Error("Primary feed timestamp invalid.");
  if (BigInt(latest.timestamp) - updatedAt > BigInt(config.heartbeat)) throw new Error("Primary feed is stale.");
  if (answeredInRound < roundId) throw new Error("Primary feed round incomplete.");

  const t0 = ethers.getAddress(token0);
  const t1 = ethers.getAddress(token1);
  const expected = new Set([config.indexToken, config.quoteToken]);
  if (!expected.has(t0) || !expected.has(t1) || t0 === t1) throw new Error("TWAP pool token pair mismatch.");
  if (liquidity < BigInt(config.minimumLiquidity)) throw new Error("TWAP pool liquidity below configured minimum.");

  const sqrtPriceX96 = slot0[0];
  const observationCardinality = Number(slot0[3]);
  const unlocked = slot0[6];
  if (sqrtPriceX96 === 0n || !unlocked) throw new Error("TWAP pool is not ready.");
  if (observationCardinality < 2) throw new Error("TWAP pool observation cardinality is insufficient.");

  return {
    status: "READ_ONLY_LIVE_PREFLIGHT_PASS",
    chainId: 97,
    blockNumber: latest.number,
    transactionOccurred: false,
    deploymentAuthorized: false,
    config: {
      owner: config.owner,
      indexToken: config.indexToken,
      quoteToken: config.quoteToken,
      primaryFeed: config.primaryFeed,
      twapPool: config.twapPool,
      heartbeat: config.heartbeat,
      maxDeviationBps: config.maxDeviationBps,
      observationWindow: config.observationWindow,
      minimumLiquidity: config.minimumLiquidity
    },
    primaryFeed: {
      decimals: Number(decimals),
      roundId: roundId.toString(),
      answer: answer.toString(),
      updatedAt: updatedAt.toString()
    },
    twapPool: {
      token0: t0,
      token1: t1,
      liquidity: liquidity.toString(),
      observationCardinality,
      unlocked
    }
  };
}

if (import.meta.url === new URL("file://" + process.argv[1]).href) {
  preflightProductionOracleDeployment(process.env)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error("FINAL FAIL:", e.message); process.exitCode = 1; });
}
