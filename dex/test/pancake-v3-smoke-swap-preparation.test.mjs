import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { TEST_LQC, TEST_WBNB, PILOT_FEE } from "../scripts/prepare-pancake-v3-pool.mjs";
import { SIGNER_1 } from "../scripts/prepare-pancake-v3-liquidity.mjs";
import { PANCAKE_BSC_TESTNET } from "../scripts/validate-bsc-testnet.mjs";
import {
  SWAP_AMOUNT_IN, MIN_EXPECTED_QUOTE, MAX_EXPECTED_QUOTE, quoteCallData, buildSmokeSwap,
} from "../scripts/prepare-pancake-v3-smoke-swap.mjs";

describe("PancakeSwap V3 first smoke-swap preparation", function () {
  const deadline = 2_000_000_000;
  const quote = 995000000000000n;

  it("records the verified LP NFT before preparing a swap", function () {
    const record = JSON.parse(fs.readFileSync(new URL("../deployments/pancake-v3-pool-bsc-testnet-97.json", import.meta.url)));
    assert.equal(record.initialLiquidityPlan.lpNftTokenId, "37418");
    assert.equal(record.initialLiquidityPlan.status, "executed");
  });

  it("quotes and approves exactly 1,000 tLQC through official endpoints", function () {
    const bundle = buildSmokeSwap(deadline, quote);
    assert.equal(bundle.router, PANCAKE_BSC_TESTNET.v3Router);
    assert.equal(bundle.quoter, PANCAKE_BSC_TESTNET.v3Quoter);
    assert.equal(bundle.quote.data, quoteCallData());
    const erc20 = new ethers.Interface(["function approve(address,uint256) returns(bool)"]);
    const [spender, amount] = erc20.decodeFunctionData("approve", bundle.transactions.approve.data);
    assert.equal(spender, PANCAKE_BSC_TESTNET.v3Router);
    assert.equal(amount, SWAP_AMOUNT_IN);
    assert.notEqual(amount, ethers.MaxUint256);
  });

  it("binds the swap to Signer 1, 1% quote protection, deadline, pair, and fee", function () {
    const bundle = buildSmokeSwap(deadline, quote);
    const router = new ethers.Interface([
      "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256)",
    ]);
    const [params] = router.decodeFunctionData("exactInputSingle", bundle.transactions.swap.data);
    assert.equal(params.tokenIn, TEST_LQC);
    assert.equal(params.tokenOut, TEST_WBNB);
    assert.equal(params.fee, BigInt(PILOT_FEE));
    assert.equal(params.recipient, SIGNER_1);
    assert.equal(params.deadline, BigInt(deadline));
    assert.equal(params.amountIn, SWAP_AMOUNT_IN);
    assert.equal(params.amountOutMinimum, quote * 99n / 100n);
    assert.equal(bundle.transactions.swap.value, "0");
  });

  it("rejects quotes outside the narrow reviewed live range", function () {
    assert.throws(() => buildSmokeSwap(deadline, MIN_EXPECTED_QUOTE - 1n), /outside/);
    assert.throws(() => buildSmokeSwap(deadline, MAX_EXPECTED_QUOTE + 1n), /outside/);
  });

  it("re-quotes before encoding and blocks duplicate or oversized approvals", function () {
    const source = fs.readFileSync(new URL("../app/pancake-v3-smoke-swap-testnet.js", import.meta.url), "utf8");
    const bundle = buildSmokeSwap(deadline, quote);
    const constant = (name) => source.match(new RegExp(`const ${name} = \"(0x[0-9a-f]+)\";`))?.[1];
    assert.equal(constant("APPROVE_DATA"), bundle.transactions.approve.data);
    assert.equal(constant("QUOTE_DATA"), bundle.quote.data);
    assert.match(source, /await refresh\(\);\s*if \(nextAction !== actionId\)/);
    assert.match(source, /typeof transaction === "function" \? transaction\(\) : transaction/);
    assert.match(source, /wbnbBalance >= MIN_QUOTE/);
    assert.match(source, /approved > AMOUNT_IN/);
  });

  it("shows the exact one-time smoke-test scope", function () {
    const html = fs.readFileSync(new URL("../app/pancake-v3-smoke-swap-testnet.html", import.meta.url), "utf8");
    assert.match(html, /1,000 tLQC → WBNB/);
    assert.match(html, /최소수령량 99%/);
    assert.match(html, /최초 소액 교환을 한 번만 실행합니다/);
  });
});
