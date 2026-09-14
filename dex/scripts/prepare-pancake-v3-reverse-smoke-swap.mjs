import { ethers } from "ethers";
import { pathToFileURL } from "node:url";
import { TEST_LQC, TEST_WBNB, PILOT_FEE } from "./prepare-pancake-v3-pool.mjs";
import { SIGNER_1, PANCAKE_V3_POOL } from "./prepare-pancake-v3-liquidity.mjs";
import { PANCAKE_BSC_TESTNET } from "./validate-bsc-testnet.mjs";

export const REVERSE_AMOUNT_IN = ethers.parseEther("0.0005");
export const MIN_EXPECTED_TLQC = ethers.parseUnits("495", 18);
export const MAX_EXPECTED_TLQC = ethers.parseUnits("505", 18);
export const QUOTE_MINIMUM_BPS = 9900n;

const erc20 = new ethers.Interface(["function approve(address,uint256) returns(bool)"]);
const quoter = new ethers.Interface([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
const router = new ethers.Interface([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256 amountOut)",
]);

export function reverseQuoteCallData() {
  return quoter.encodeFunctionData("quoteExactInputSingle", [{
    tokenIn: TEST_WBNB, tokenOut: TEST_LQC, amountIn: REVERSE_AMOUNT_IN, fee: PILOT_FEE, sqrtPriceLimitX96: 0,
  }]);
}

export function buildReverseSmokeSwap(deadline, quotedAmountOut) {
  if (!Number.isSafeInteger(deadline) || deadline <= 0) throw new Error("deadline must be a positive safe integer");
  const quote = BigInt(quotedAmountOut);
  if (quote < MIN_EXPECTED_TLQC || quote > MAX_EXPECTED_TLQC) throw new Error("quote is outside the reviewed reverse-swap range");
  const amountOutMinimum = quote * QUOTE_MINIMUM_BPS / 10000n;
  const params = {
    tokenIn: TEST_WBNB, tokenOut: TEST_LQC, fee: PILOT_FEE, recipient: SIGNER_1,
    deadline, amountIn: REVERSE_AMOUNT_IN, amountOutMinimum, sqrtPriceLimitX96: 0,
  };
  return {
    schemaVersion: 1,
    network: { name: "BSC Testnet", chainId: 97 },
    pool: PANCAKE_V3_POOL,
    router: PANCAKE_BSC_TESTNET.v3Router,
    quoter: PANCAKE_BSC_TESTNET.v3Quoter,
    amountIn: REVERSE_AMOUNT_IN.toString(),
    quotedAmountOut: quote.toString(),
    amountOutMinimum: amountOutMinimum.toString(),
    transactions: {
      approve: { to: TEST_WBNB, value: "0", data: erc20.encodeFunctionData("approve", [PANCAKE_BSC_TESTNET.v3Router, REVERSE_AMOUNT_IN]) },
      swap: { to: PANCAKE_BSC_TESTNET.v3Router, value: "0", data: router.encodeFunctionData("exactInputSingle", [params]) },
    },
    quote: { to: PANCAKE_BSC_TESTNET.v3Quoter, data: reverseQuoteCallData() },
    safety: "Exact 0.0005 WBNB approval, live official Quoter check, 1% minimum-output protection, Signer 1 recipient, expected pre-balance gate, and no native value.",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(buildReverseSmokeSwap(Math.floor(Date.now() / 1000) + 1200, ethers.parseUnits("500", 18)), null, 2)}\n`);
}
