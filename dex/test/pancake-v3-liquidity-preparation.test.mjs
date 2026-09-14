import assert from "node:assert/strict";
import fs from "node:fs";
import { ethers } from "ethers";
import {
  BSC_TESTNET_CHAIN_ID,
  SIGNER_1,
  PANCAKE_V3_POOL,
  POSITION_MANAGER,
  TLQC_AMOUNT,
  WBNB_AMOUNT,
  TICK_LOWER,
  TICK_UPPER,
  initialSqrtPriceX96,
  buildLiquidityPreparation,
} from "../scripts/prepare-pancake-v3-liquidity.mjs";

const deadline = 2_000_000_000;

describe("PancakeSwap V3 initial-liquidity preparation", function () {
  it("pins the recorded successful empty pool and approved testnet plan", function () {
    const record = JSON.parse(fs.readFileSync(new URL("../deployments/pancake-v3-pool-bsc-testnet-97.json", import.meta.url)));
    assert.equal(record.network.chainId, BSC_TESTNET_CHAIN_ID);
    assert.equal(record.contracts.pancakeV3Pool, PANCAKE_V3_POOL);
    assert.equal(record.creation.transactionHash, "0x273b2e9bba7e599764030571f81625ae121b1bc4d867ea3d9f929e7ca4b5cd29");
    assert.equal(record.initialLiquidityPlan.tLQC, "500000");
    assert.equal(record.initialLiquidityPlan.WBNB, "0.5");
    assert.equal(record.initialLiquidityPlan.status, "executed");
    assert.equal(record.initialLiquidityPlan.transactionHash, "0x85de5d094f5713eeddefc67a67cf4986899f607495a63229ec41c2083b72b985");
    assert.equal(record.initialLiquidityPlan.reportedPoolLiquidity, "500000000000000000000");
  });

  it("derives the exact 1e-6 WBNB-per-tLQC initial square-root price", function () {
    const sqrt = initialSqrtPriceX96();
    const ratioNumerator = WBNB_AMOUNT << 192n;
    const ratio = ratioNumerator / TLQC_AMOUNT;
    assert(sqrt * sqrt <= ratio);
    assert((sqrt + 1n) * (sqrt + 1n) > ratio);
    assert.equal(sqrt, 79228162514264337593543950n);
  });

  it("uses exact approvals, full-range ticks, Signer 1 NFT custody, and 1% minimums", function () {
    const bundle = buildLiquidityPreparation(deadline);
    assert.equal(bundle.transactions.wrap.value, WBNB_AMOUNT.toString());
    assert.equal(bundle.transactions.wrap.data, "0xd0e30db0");
    const erc20 = new ethers.Interface(["function approve(address,uint256) returns(bool)"]);
    for (const [transaction, expected] of [[bundle.transactions.approveTlqc, TLQC_AMOUNT], [bundle.transactions.approveWbnb, WBNB_AMOUNT]]) {
      const [spender, amount] = erc20.decodeFunctionData("approve", transaction.data);
      assert.equal(spender, POSITION_MANAGER);
      assert.equal(amount, expected);
      assert.notEqual(amount, ethers.MaxUint256);
    }
    const manager = new ethers.Interface([
      "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) payable returns(uint256,uint128,uint256,uint256)",
    ]);
    const [params] = manager.decodeFunctionData("mint", bundle.transactions.mint.data);
    assert.equal(params.tickLower, BigInt(TICK_LOWER));
    assert.equal(params.tickUpper, BigInt(TICK_UPPER));
    assert.equal(params.amount0Desired, TLQC_AMOUNT);
    assert.equal(params.amount1Desired, WBNB_AMOUNT);
    assert.equal(params.amount0Min, TLQC_AMOUNT * 99n / 100n);
    assert.equal(params.amount1Min, WBNB_AMOUNT * 99n / 100n);
    assert.equal(params.recipient, SIGNER_1);
    assert.equal(params.deadline, BigInt(deadline));
  });

  it("keeps every wallet action separate and blocks out-of-order execution", function () {
    const source = fs.readFileSync(new URL("../app/pancake-v3-liquidity-testnet.js", import.meta.url), "utf8");
    const bundle = buildLiquidityPreparation(deadline);
    const constant = (name) => source.match(new RegExp(`const ${name} = \"(0x[0-9a-f]+)\";`))?.[1];
    assert.equal(constant("APPROVE_TLQC_DATA"), bundle.transactions.approveTlqc.data);
    assert.equal(constant("APPROVE_WBNB_DATA"), bundle.transactions.approveWbnb.data);
    assert.equal(constant("INITIALIZE_DATA"), bundle.transactions.initialize.data);
    assert.match(source, /nextAction !== actionId/);
    assert.match(source, /기존 승인이 확정 수량보다 큽니다/);
    assert.match(source, /LP 포지션 NFT 발행 기록을 찾지 못했습니다/);
    assert.match(source, /transaction\.input\.toLowerCase\(\)\.startsWith\("0x88316456"\)/);
    assert.doesNotMatch(source, /ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff/);
  });

  it("shows the irreversible-price warning and six ordered steps", function () {
    const html = fs.readFileSync(new URL("../app/pancake-v3-liquidity-testnet.html", import.meta.url), "utf8");
    assert.match(html, /500,000 tLQC \+ 0\.5 WBNB/);
    assert.match(html, /버튼은 번호 순서대로 한 번씩만 누르세요/);
    assert.match(html, /5\. 초기 가격 설정/);
    assert.match(html, /6\. 전체 범위 유동성 공급/);
  });
});
