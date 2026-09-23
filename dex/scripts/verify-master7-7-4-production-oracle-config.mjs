import { ethers } from "ethers";

export function validateProductionOracleConfig(env) {
  const owner = ethers.getAddress(env.FUTURES_OWNER_ADDRESS);
  const indexToken = ethers.getAddress(env.FUTURES_INDEX_TOKEN);
  const quoteToken = ethers.getAddress(env.FUTURES_QUOTE_TOKEN);
  const primaryFeed = ethers.getAddress(env.FUTURES_PRIMARY_FEED);
  const v3Pool = ethers.getAddress(env.FUTURES_TWAP_POOL);

  if (indexToken === quoteToken) throw new Error("indexToken and quoteToken must differ");
  if (primaryFeed === ethers.ZeroAddress) throw new Error("primary feed cannot be zero");
  if (v3Pool === ethers.ZeroAddress) throw new Error("TWAP pool cannot be zero");

  const heartbeat = Number(env.FUTURES_FEED_HEARTBEAT);
  const maxDeviationBps = Number(env.FUTURES_MAX_DEVIATION_BPS);
  const observationWindow = Number(env.FUTURES_TWAP_WINDOW);
  const minimumLiquidity = BigInt(env.FUTURES_TWAP_MIN_LIQUIDITY);

  if (!Number.isInteger(heartbeat) || heartbeat <= 0 || heartbeat > 86400) {
    throw new Error("heartbeat must be 1..86400 seconds");
  }
  if (!Number.isInteger(maxDeviationBps) || maxDeviationBps <= 0 || maxDeviationBps > 5000) {
    throw new Error("maxDeviationBps must be 1..5000");
  }
  if (!Number.isInteger(observationWindow) || observationWindow < 300 || observationWindow > 86400) {
    throw new Error("TWAP window must be 300..86400 seconds");
  }
  if (minimumLiquidity <= 0n) throw new Error("minimumLiquidity must be > 0");

  return {
    chainId: 97,
    owner,
    indexToken,
    quoteToken,
    primaryFeed,
    twapPool: v3Pool,
    heartbeat,
    maxDeviationBps,
    observationWindow,
    minimumLiquidity: minimumLiquidity.toString(),
    primaryAdapter: "LQCAggregatorOracleAdapter",
    referenceAdapter: "LQCV3TwapReferenceAdapter",
    transactionAuthorized: false
  };
}

if (import.meta.url === new URL("file://" + process.argv[1]).href) {
  try {
    const result = validateProductionOracleConfig(process.env);
    console.log(JSON.stringify({status:"READY_FOR_SEPARATELY_AUTHORIZED_ORACLE_DEPLOYMENT", ...result}, null, 2));
  } catch (e) {
    console.error("FINAL FAIL:", e.message);
    process.exit(1);
  }
}
