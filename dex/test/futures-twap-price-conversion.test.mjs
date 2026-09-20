import assert from "node:assert/strict";
import { sqrtRatioAtTick, twapTickToScaledPrice, MIN_TICK, MAX_TICK, PRICE_SCALE } from "../scripts/futures-twap-price-conversion.mjs";

const A="0x0000000000000000000000000000000000000001";
const B="0x0000000000000000000000000000000000000002";

describe("Futures TWAP price conversion gate", function () {
  it("converts tick zero in both token directions", function () {
    assert.equal(twapTickToScaledPrice({tick:0,token0:A,token1:B,indexToken:A,quoteToken:B,token0Decimals:18,token1Decimals:18}), PRICE_SCALE);
    assert.equal(twapTickToScaledPrice({tick:0,token0:A,token1:B,indexToken:B,quoteToken:A,token0Decimals:18,token1Decimals:18}), PRICE_SCALE);
  });
  it("normalizes unequal token decimals", function () {
    assert.equal(twapTickToScaledPrice({tick:0,token0:A,token1:B,indexToken:A,quoteToken:B,token0Decimals:8,token1Decimals:6}), 100n*PRICE_SCALE);
    assert.equal(twapTickToScaledPrice({tick:0,token0:A,token1:B,indexToken:B,quoteToken:A,token0Decimals:8,token1Decimals:6}), PRICE_SCALE/100n);
  });
  it("rejects wrong pairs and unsupported decimals", function () {
    const C="0x0000000000000000000000000000000000000003";
    assert.throws(()=>twapTickToScaledPrice({tick:0,token0:A,token1:B,indexToken:C,quoteToken:B,token0Decimals:18,token1Decimals:18}),/do not match/);
    assert.throws(()=>twapTickToScaledPrice({tick:0,token0:A,token1:B,indexToken:A,quoteToken:B,token0Decimals:37,token1Decimals:18}),/between 0 and 36/);
  });
  it("enforces V3 tick boundaries and integer ticks", function () {
    assert.ok(sqrtRatioAtTick(MIN_TICK)>0n);
    assert.ok(sqrtRatioAtTick(MAX_TICK)>0n);
    assert.throws(()=>sqrtRatioAtTick(MIN_TICK-1),/outside/);
    assert.throws(()=>sqrtRatioAtTick(MAX_TICK+1),/outside/);
    assert.throws(()=>sqrtRatioAtTick(1.5),/outside/);
  });
  it("fails closed when extreme ratios cannot produce a safe nonzero scaled price", function () {
    assert.throws(()=>twapTickToScaledPrice({tick:MIN_TICK,token0:A,token1:B,indexToken:A,quoteToken:B,token0Decimals:18,token1Decimals:18}),/(zero|overflow)/);
    assert.throws(()=>twapTickToScaledPrice({tick:MAX_TICK,token0:A,token1:B,indexToken:B,quoteToken:A,token0Decimals:18,token1Decimals:18}),/(zero|overflow)/);
  });
});
