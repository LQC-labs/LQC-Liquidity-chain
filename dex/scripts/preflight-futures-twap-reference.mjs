import { ethers } from "ethers";

export const BSC_TESTNET_CHAIN_ID = 97n;
export const MIN_WINDOW = 300;
export const MAX_WINDOW = 86_400;
export const MAX_TOKEN_DECIMALS = 36;

const POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function observe(uint32[]) view returns (int56[],uint160[])",
];
const TOKEN_ABI = ["function decimals() view returns (uint8)"];

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
function positiveInteger(value, label, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${label} must be an integer between 1 and ${maximum}.`);
  }
  return parsed;
}

export function validateTwapReferenceConfig(env) {
  const pool = address(env.FUTURES_TWAP_POOL, "FUTURES_TWAP_POOL");
  const indexToken = address(env.FUTURES_TWAP_INDEX_TOKEN, "FUTURES_TWAP_INDEX_TOKEN");
  const quoteToken = address(env.FUTURES_TWAP_QUOTE_TOKEN, "FUTURES_TWAP_QUOTE_TOKEN");
  if (indexToken === quoteToken) throw new Error("Index and quote tokens must be distinct.");
  const observationWindow = positiveInteger(env.FUTURES_TWAP_WINDOW, "TWAP window", MAX_WINDOW);
  if (observationWindow < MIN_WINDOW) throw new Error(`TWAP window must be at least ${MIN_WINDOW} seconds.`);
  let minimumLiquidity;
  try {
    minimumLiquidity = BigInt(env.FUTURES_TWAP_MIN_LIQUIDITY);
  } catch {
    throw new Error("Minimum liquidity must be a positive integer.");
  }
  if (minimumLiquidity < 1n) throw new Error("Minimum liquidity must be a positive integer.");
  return { pool, indexToken, quoteToken, observationWindow, minimumLiquidity };
}

async function requireCode(provider, target, label) {
  if ((await provider.getCode(target)) === "0x") throw new Error(`${label} has no runtime bytecode: ${target}`);
}

export async function preflightFuturesTwapReference(
  env,
  provider = new ethers.JsonRpcProvider(env.BSC_TESTNET_RPC_URL),
) {
  const config = validateTwapReferenceConfig(env);
  const network = await provider.getNetwork();
  if (network.chainId !== BSC_TESTNET_CHAIN_ID) {
    throw new Error("Refusing TWAP qualification: expected BSC Testnet chainId 97.");
  }
  await Promise.all([
    requireCode(provider, config.pool, "Pool"),
    requireCode(provider, config.indexToken, "Index token"),
    requireCode(provider, config.quoteToken, "Quote token"),
  ]);

  const pool = new ethers.Contract(config.pool, POOL_ABI, provider);
  const index = new ethers.Contract(config.indexToken, TOKEN_ABI, provider);
  const quote = new ethers.Contract(config.quoteToken, TOKEN_ABI, provider);
  const [token0, token1, liquidity, slot0, indexDecimals, quoteDecimals] = await Promise.all([
    pool.token0(), pool.token1(), pool.liquidity(), pool.slot0(), index.decimals(), quote.decimals(),
  ]);
  const actual = new Set([ethers.getAddress(token0), ethers.getAddress(token1)]);
  if (!actual.has(config.indexToken) || !actual.has(config.quoteToken) || actual.size !== 2) {
    throw new Error("Pool token pair does not exactly match the configured index/quote tokens.");
  }
  if (Number(indexDecimals) > MAX_TOKEN_DECIMALS || Number(quoteDecimals) > MAX_TOKEN_DECIMALS) {
    throw new Error("Token decimals exceed the supported maximum of 36.");
  }
  if (liquidity < config.minimumLiquidity) throw new Error("Pool liquidity is below the configured minimum.");
  const [sqrtPriceX96,, , observationCardinality,, , unlocked] = slot0;
  if (sqrtPriceX96 === 0n) throw new Error("Pool is not initialized.");
  if (!unlocked) throw new Error("Pool is locked.");
  if (observationCardinality < 2) throw new Error("Pool has insufficient observation cardinality.");

  let tickCumulatives;
  try {
    [tickCumulatives] = await pool.observe([config.observationWindow, 0]);
  } catch {
    throw new Error("Pool cannot supply the requested TWAP observation window.");
  }
  if (tickCumulatives.length !== 2) throw new Error("Pool returned malformed TWAP observations.");
  const delta = tickCumulatives[1] - tickCumulatives[0];
  const window = BigInt(config.observationWindow);
  let arithmeticMeanTick = delta / window;
  if (delta < 0n && delta % window !== 0n) arithmeticMeanTick -= 1n;

  return {
    status: "READ_ONLY_TWAP_SOURCE_QUALIFIED",
    activationAuthorized: false,
    chainId: 97,
    config: { ...config, minimumLiquidity: config.minimumLiquidity.toString() },
    pool: {
      token0: ethers.getAddress(token0),
      token1: ethers.getAddress(token1),
      liquidity: liquidity.toString(),
      observationCardinality: Number(observationCardinality),
      arithmeticMeanTick: arithmeticMeanTick.toString(),
    },
    warning: "Qualification does not authorize deployment or oracle activation; price conversion and governance review remain required.",
  };
}

async function main() {
  const result = await preflightFuturesTwapReference(process.env);
  console.log(JSON.stringify(result, null, 2));
}
if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
