import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import { TEST_LQC, TEST_WBNB, PILOT_FEE } from "../scripts/prepare-pancake-v3-pool.mjs";
import { SIGNER_1 } from "../scripts/prepare-pancake-v3-liquidity.mjs";
import { PANCAKE_BSC_TESTNET } from "../scripts/validate-bsc-testnet.mjs";
import { REVERSE_AMOUNT_IN, MIN_EXPECTED_TLQC, MAX_EXPECTED_TLQC, reverseQuoteCallData, buildReverseSmokeSwap } from "../scripts/prepare-pancake-v3-reverse-smoke-swap.mjs";

describe("PancakeSwap V3 reverse smoke-swap preparation", function () {
  const deadline = 2_000_000_000;
  const quote = ethers.parseUnits("500", 18);

  it("records the successful forward swap before preparing the reverse", function () {
    const record = JSON.parse(fs.readFileSync(new URL("../deployments/pancake-v3-pool-bsc-testnet-97.json", import.meta.url)));
    assert.equal(record.firstSmokeSwap.direction, "tLQC-to-WBNB");
    assert.equal(record.firstSmokeSwap.status, "success");
  });

  it("quotes and approves exactly 0.0005 WBNB through official endpoints", function () {
    const bundle = buildReverseSmokeSwap(deadline, quote);
    assert.equal(bundle.router, PANCAKE_BSC_TESTNET.v3Router);
    assert.equal(bundle.quoter, PANCAKE_BSC_TESTNET.v3Quoter);
    assert.equal(bundle.quote.data, reverseQuoteCallData());
    const erc20 = new ethers.Interface(["function approve(address,uint256) returns(bool)"]);
    const [spender, amount] = erc20.decodeFunctionData("approve", bundle.transactions.approve.data);
    assert.equal(spender, PANCAKE_BSC_TESTNET.v3Router);
    assert.equal(amount, REVERSE_AMOUNT_IN);
    assert.notEqual(amount, ethers.MaxUint256);
  });

  it("binds the reverse swap to Signer 1, pair, fee, deadline and 1% protection", function () {
    const bundle = buildReverseSmokeSwap(deadline, quote);
    const router = new ethers.Interface(["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns(uint256)"]);
    const [params] = router.decodeFunctionData("exactInputSingle", bundle.transactions.swap.data);
    assert.equal(params.tokenIn, TEST_WBNB);
    assert.equal(params.tokenOut, TEST_LQC);
    assert.equal(params.fee, BigInt(PILOT_FEE));
    assert.equal(params.recipient, SIGNER_1);
    assert.equal(params.deadline, BigInt(deadline));
    assert.equal(params.amountIn, REVERSE_AMOUNT_IN);
    assert.equal(params.amountOutMinimum, quote * 99n / 100n);
    assert.equal(bundle.transactions.swap.value, "0");
  });

  it("rejects reverse quotes outside the reviewed range", function () {
    assert.throws(() => buildReverseSmokeSwap(deadline, MIN_EXPECTED_TLQC - 1n), /outside/);
    assert.throws(() => buildReverseSmokeSwap(deadline, MAX_EXPECTED_TLQC + 1n), /outside/);
  });

  it("re-quotes before encoding and enforces pre-balance and duplicate gates", function () {
    const source = fs.readFileSync(new URL("../app/pancake-v3-reverse-smoke-swap-testnet.js", import.meta.url), "utf8");
    const bundle = buildReverseSmokeSwap(deadline, quote);
    const constant = (name) => source.match(new RegExp(`const ${name} = "(0x[0-9a-f]+)";`))?.[1];
    assert.equal(constant("APPROVE_DATA"), bundle.transactions.approve.data);
    assert.equal(constant("QUOTE_DATA"), bundle.quote.data);
    assert.match(source, /await refresh\(\);\s*if \(nextAction !== actionId\)/);
    assert.match(source, /typeof transaction === "function" \? transaction\(\) : transaction/);
    assert.match(source, /wbnbBalance < EXPECTED_PRE_BALANCE_MIN \|\| wbnbBalance > EXPECTED_PRE_BALANCE_MAX/);
    assert.match(source, /savedHash \|\| wbnbBalance < AMOUNT_IN/);
    assert.match(source, /approved > AMOUNT_IN/);
  });

  it("shows the exact one-time reverse-test scope", function () {
    const html = fs.readFileSync(new URL("../app/pancake-v3-reverse-smoke-swap-testnet.html", import.meta.url), "utf8");
    assert.match(html, /0\.0005 WBNB → tLQC/);
    assert.match(html, /최소수령량 99%/);
    assert.match(html, /한 번 실행됩니다/);
  });
});
