import { ethers } from "ethers";
import { pathToFileURL } from "node:url";
import { TEST_LQC, TEST_WBNB, PILOT_FEE } from "./prepare-pancake-v3-pool.mjs";
import { SIGNER_1, PANCAKE_V3_POOL } from "./prepare-pancake-v3-liquidity.mjs";
import { PANCAKE_BSC_TESTNET } from "./validate-bsc-testnet.mjs";

export const SWAP_AMOUNT_IN = ethers.parseUnits("1000", 18);
export const MIN_EXPECTED_QUOTE = ethers.parseEther("0.00098");
export const MAX_EXPECTED_QUOTE = ethers.parseEther("0.001");
export const QUOTE_MINIMUM_BPS = 9900n;

const erc20 = new ethers.Interface(["function approve(address,uint256) returns(bool)"]);
const quoter = new ethers.Interface([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
const router = new ethers.Interface([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256 amountOut)",
]);

export function quoteCallData() {
  return quoter.encodeFunctionData("quoteExactInputSingle", [{
    tokenIn: TEST_LQC, tokenOut: TEST_WBNB, amountIn: SWAP_AMOUNT_IN, fee: PILOT_FEE, sqrtPriceLimitX96: 0,
  }]);
}

export function buildSmokeSwap(deadline, quotedAmountOut) {
  if (!Number.isSafeInteger(deadline) || deadline <= 0) throw new Error("deadline must be a positive safe integer");
  const quote = BigInt(quotedAmountOut);
  if (quote < MIN_EXPECTED_QUOTE || quote > MAX_EXPECTED_QUOTE) throw new Error("quote is outside the reviewed testnet range");
  const amountOutMinimum = quote * QUOTE_MINIMUM_BPS / 10000n;
  const params = {
    tokenIn: TEST_LQC,
    tokenOut: TEST_WBNB,
    fee: PILOT_FEE,
    recipient: SIGNER_1,
    deadline,
    amountIn: SWAP_AMOUNT_IN,
    amountOutMinimum,
    sqrtPriceLimitX96: 0,
  };
  return {
    schemaVersion: 1,
    network: { name: "BSC Testnet", chainId: 97 },
    pool: PANCAKE_V3_POOL,
    router: PANCAKE_BSC_TESTNET.v3Router,
    quoter: PANCAKE_BSC_TESTNET.v3Quoter,
    amountIn: SWAP_AMOUNT_IN.toString(),
    quotedAmountOut: quote.toString(),
    amountOutMinimum: amountOutMinimum.toString(),
    transactions: {
      approve: { to: TEST_LQC, value: "0", data: erc20.encodeFunctionData("approve", [PANCAKE_BSC_TESTNET.v3Router, SWAP_AMOUNT_IN]) },
      swap: { to: PANCAKE_BSC_TESTNET.v3Router, value: "0", data: router.encodeFunctionData("exactInputSingle", [params]) },
    },
    quote: { to: PANCAKE_BSC_TESTNET.v3Quoter, data: quoteCallData() },
    safety: "Exact 1,000 tLQC approval, live official Quoter check, 1% minimum-output protection, Signer 1 recipient, and no native value.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const exampleQuote = 995000000000000n;
  process.stdout.write(`${JSON.stringify(buildSmokeSwap(Math.floor(Date.now() / 1000) + 1200, exampleQuote), null, 2)}\n`);
}
