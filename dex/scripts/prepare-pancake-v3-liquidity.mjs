import { ethers } from "ethers";
import { pathToFileURL } from "node:url";
import { TEST_LQC, TEST_WBNB, PILOT_FEE } from "./prepare-pancake-v3-pool.mjs";

export const BSC_TESTNET_CHAIN_ID = 97;
export const SIGNER_1 = "0x7cf23bB16Ed0E1eaF58CD31c9F5a643be438C6aB";
export const PANCAKE_V3_POOL = "0x4bfbf746a675153e050f5fbc90eaa18d07014c95";
export const POSITION_MANAGER = "0x427bF5b37357632377eCbEC9de3626C71A5396c1";
export const TLQC_AMOUNT = ethers.parseUnits("500000", 18);
export const WBNB_AMOUNT = ethers.parseEther("0.5");
export const MIN_AMOUNT_BPS = 9900n;
export const TICK_LOWER = -887250;
export const TICK_UPPER = 887250;

const erc20 = new ethers.Interface(["function approve(address,uint256) returns(bool)"]);
const wbnb = new ethers.Interface(["function deposit() payable"]);
const pool = new ethers.Interface(["function initialize(uint160 sqrtPriceX96)"]);
const positionManager = new ethers.Interface([
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) payable returns(uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
]);

function integerSqrt(value) {
  if (value < 0n) throw new Error("square root input must be non-negative");
  if (value < 2n) return value;
  let x = 1n << (BigInt(value.toString(2).length) + 1n >> 1n);
  let y = (x + value / x) >> 1n;
  while (y < x) [x, y] = [y, (y + value / y) >> 1n];
  return x;
}

export function initialSqrtPriceX96() {
  return integerSqrt((WBNB_AMOUNT << 192n) / TLQC_AMOUNT);
}

export function buildLiquidityPreparation(deadline, recipient = SIGNER_1) {
  if (!Number.isSafeInteger(deadline) || deadline <= 0) throw new Error("deadline must be a positive safe integer");
  if (ethers.getAddress(recipient) !== SIGNER_1) throw new Error("recipient must be Signer 1");
  const minimum0 = TLQC_AMOUNT * MIN_AMOUNT_BPS / 10000n;
  const minimum1 = WBNB_AMOUNT * MIN_AMOUNT_BPS / 10000n;
  const sqrtPriceX96 = initialSqrtPriceX96();
  const mintParams = {
    token0: TEST_LQC,
    token1: TEST_WBNB,
    fee: PILOT_FEE,
    tickLower: TICK_LOWER,
    tickUpper: TICK_UPPER,
    amount0Desired: TLQC_AMOUNT,
    amount1Desired: WBNB_AMOUNT,
    amount0Min: minimum0,
    amount1Min: minimum1,
    recipient: SIGNER_1,
    deadline,
  };
  return {
    schemaVersion: 1,
    network: { name: "BSC Testnet", chainId: BSC_TESTNET_CHAIN_ID },
    pool: PANCAKE_V3_POOL,
    positionManager: POSITION_MANAGER,
    price: { tlqcPerWbnb: "1000000", wbnbPerTlqc: "0.000001", sqrtPriceX96: sqrtPriceX96.toString() },
    range: { tickLower: TICK_LOWER, tickUpper: TICK_UPPER, label: "full range" },
    amounts: { tlqc: TLQC_AMOUNT.toString(), wbnb: WBNB_AMOUNT.toString(), minimumBps: Number(MIN_AMOUNT_BPS) },
    transactions: {
      wrap: { to: TEST_WBNB, value: WBNB_AMOUNT.toString(), data: wbnb.encodeFunctionData("deposit") },
      approveTlqc: { to: TEST_LQC, value: "0", data: erc20.encodeFunctionData("approve", [POSITION_MANAGER, TLQC_AMOUNT]) },
      approveWbnb: { to: TEST_WBNB, value: "0", data: erc20.encodeFunctionData("approve", [POSITION_MANAGER, WBNB_AMOUNT]) },
      initialize: { to: PANCAKE_V3_POOL, value: "0", data: pool.encodeFunctionData("initialize", [sqrtPriceX96]) },
      mint: { to: POSITION_MANAGER, value: "0", data: positionManager.encodeFunctionData("mint", [mintParams]) },
    },
    safety: "Every transaction is separate. Exact approvals only; no unlimited approval. The position NFT is sent only to Signer 1.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const deadline = Math.floor(Date.now() / 1000) + 1800;
  process.stdout.write(`${JSON.stringify(buildLiquidityPreparation(deadline), null, 2)}\n`);
}
