import { ethers } from "ethers";

export const BSC_TESTNET_CHAIN_ID = 97n;
export const MAX_HEARTBEAT = 86_400;
export const MAX_DEVIATION_BPS = 5_000;
export const MAX_FEED_DECIMALS = 36;

const AGGREGATOR_ABI = [
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)",
];

function address(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  try {
    const normalized = ethers.getAddress(value);
    if (normalized === ethers.ZeroAddress) throw new Error();
    return normalized;
  } catch {
    throw new Error(`${label} must be a non-zero address.`);
  }
}

export function validateOracleActivationConfig(env) {
  const owner = address(env.FUTURES_ORACLE_OWNER, "FUTURES_ORACLE_OWNER");
  const indexToken = address(env.FUTURES_ORACLE_INDEX_TOKEN, "FUTURES_ORACLE_INDEX_TOKEN");
  const primaryFeed = address(env.FUTURES_ORACLE_PRIMARY_FEED, "FUTURES_ORACLE_PRIMARY_FEED");
  const referenceFeed = address(env.FUTURES_ORACLE_REFERENCE_FEED, "FUTURES_ORACLE_REFERENCE_FEED");
  if (primaryFeed === referenceFeed) throw new Error("Primary and reference feeds must be distinct.");

  const heartbeat = Number(env.FUTURES_ORACLE_HEARTBEAT);
  const maxDeviationBps = Number(env.FUTURES_ORACLE_MAX_DEVIATION_BPS);
  if (!Number.isInteger(heartbeat) || heartbeat < 1 || heartbeat > MAX_HEARTBEAT) {
    throw new Error("Heartbeat must be an integer between 1 and 86400 seconds.");
  }
  if (!Number.isInteger(maxDeviationBps) || maxDeviationBps < 1 || maxDeviationBps > MAX_DEVIATION_BPS) {
    throw new Error("Maximum deviation must be an integer between 1 and 5000 bps.");
  }
  return { owner, indexToken, primaryFeed, referenceFeed, heartbeat, maxDeviationBps };
}

export async function inspectAggregator(provider, feedAddress, heartbeat, now) {
  if ((await provider.getCode(feedAddress)) === "0x") throw new Error(`Feed ${feedAddress} has no runtime bytecode.`);
  const feed = new ethers.Contract(feedAddress, AGGREGATOR_ABI, provider);
  const [decimals, round] = await Promise.all([feed.decimals(), feed.latestRoundData()]);
  const [roundId, answer,, updatedAt, answeredInRound] = round;
  if (Number(decimals) > MAX_FEED_DECIMALS) throw new Error(`Feed ${feedAddress} decimals exceed 36.`);
  if (answer <= 0n) throw new Error(`Feed ${feedAddress} answer is not positive.`);
  if (updatedAt === 0n || updatedAt > now) throw new Error(`Feed ${feedAddress} timestamp is invalid.`);
  if (now - updatedAt > BigInt(heartbeat)) throw new Error(`Feed ${feedAddress} is stale.`);
  if (answeredInRound < roundId) throw new Error(`Feed ${feedAddress} round is incomplete.`);
  return { address: feedAddress, decimals: Number(decimals), roundId: roundId.toString(), answer: answer.toString(), updatedAt: updatedAt.toString() };
}

export async function preflightFuturesOracleTestnet(env, provider = new ethers.JsonRpcProvider(env.BSC_TESTNET_RPC_URL)) {
  const config = validateOracleActivationConfig(env);
  const network = await provider.getNetwork();
  if (network.chainId !== BSC_TESTNET_CHAIN_ID) throw new Error("Refusing oracle activation preflight: expected BSC Testnet chainId 97.");
  const latest = await provider.getBlock("latest");
  if (!latest) throw new Error("Unable to read the latest BSC Testnet block.");
  const now = BigInt(latest.timestamp);
  const [primary, reference] = await Promise.all([
    inspectAggregator(provider, config.primaryFeed, config.heartbeat, now),
    inspectAggregator(provider, config.referenceFeed, config.heartbeat, now),
  ]);
  return { status: "READ_ONLY_PREFLIGHT_PASS", chainId: 97, blockNumber: latest.number, config, feeds: { primary, reference } };
}

async function main() {
  const result = await preflightFuturesOracleTestnet(process.env);
  console.log(JSON.stringify(result, null, 2));
}
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
