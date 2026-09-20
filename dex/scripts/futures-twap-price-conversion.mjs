import { ethers } from "ethers";

export const MIN_TICK = -887272;
export const MAX_TICK = 887272;
export const PRICE_SCALE = 10n ** 18n;
const Q192 = 1n << 192n;
const MAX_UINT256 = (1n << 256n) - 1n;

function checkedPow10(decimals) {
  const d = Number(decimals);
  if (!Number.isInteger(d) || d < 0 || d > 36) throw new Error("Token decimals must be between 0 and 36.");
  return 10n ** BigInt(d);
}

function mulDiv(a, b, denominator) {
  if (denominator <= 0n) throw new Error("Invalid price denominator.");
  const result = (a * b) / denominator;
  if (result > MAX_UINT256) throw new Error("Price conversion overflow.");
  return result;
}

// Mirrors Uniswap V3 TickMath.getSqrtRatioAtTick using integer-only arithmetic.
export function sqrtRatioAtTick(tickInput) {
  const tick = Number(tickInput);
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK) throw new Error("TWAP tick is outside the supported V3 range.");
  let absTick = tick < 0 ? -tick : tick;
  let ratio = (absTick & 1) !== 0 ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;
  const factors = [
    [0x2,0xfff97272373d413259a46990580e213an],[0x4,0xfff2e50f5f656932ef12357cf3c7fdccn],
    [0x8,0xffe5caca7e10e4e61c3624eaa0941cd0n],[0x10,0xffcb9843d60f6159c9db58835c926644n],
    [0x20,0xff973b41fa98c081472e6896dfb254c0n],[0x40,0xff2ea16466c96a3843ec78b326b52861n],
    [0x80,0xfe5dee046a99a2a811c461f1969c3053n],[0x100,0xfcbe86c7900a88aedcffc83b479aa3a4n],
    [0x200,0xf987a7253ac413176f2b074cf7815e54n],[0x400,0xf3392b0822b70005940c7a398e4b70f3n],
    [0x800,0xe7159475a2c29b7443b29c7fa6e889d9n],[0x1000,0xd097f3bdfd2022b8845ad8f792aa5825n],
    [0x2000,0xa9f746462d870fdf8a65dc1f90e061e5n],[0x4000,0x70d869a156d2a1b890bb3df62baf32f7n],
    [0x8000,0x31be135f97d08fd981231505542fcfa6n],[0x10000,0x9aa508b5b7a84e1c677de54f3e99bc9n],
    [0x20000,0x5d6af8dedb81196699c329225ee604n],[0x40000,0x2216e584f5fa1ea926041bedfe98n],
    [0x80000,0x48a170391f7dc42444e8fa2n],
  ];
  for (const [mask,factor] of factors) if ((absTick & mask) !== 0) ratio = (ratio * factor) >> 128n;
  if (tick > 0) ratio = MAX_UINT256 / ratio;
  const remainder = ratio & ((1n << 32n) - 1n);
  return (ratio >> 32n) + (remainder === 0n ? 0n : 1n);
}

export function twapTickToScaledPrice({ tick, token0, token1, indexToken, quoteToken, token0Decimals, token1Decimals }) {
  const t0 = ethers.getAddress(token0), t1 = ethers.getAddress(token1);
  const index = ethers.getAddress(indexToken), quote = ethers.getAddress(quoteToken);
  if (t0 === t1 || index === quote) throw new Error("Token identities must be distinct.");
  if (!((index === t0 && quote === t1) || (index === t1 && quote === t0))) throw new Error("Index/quote tokens do not match the pool.");
  const scale0 = checkedPow10(token0Decimals), scale1 = checkedPow10(token1Decimals);
  const sqrt = sqrtRatioAtTick(tick);
  const ratioX192 = sqrt * sqrt;
  let scaled;
  if (index === t0) {
    // quote token1 per whole index token0, scaled to 1e18.
    scaled = mulDiv(ratioX192, scale0 * PRICE_SCALE, Q192 * scale1);
  } else {
    // quote token0 per whole index token1, scaled to 1e18.
    scaled = mulDiv(Q192, scale1 * PRICE_SCALE, ratioX192 * scale0);
  }
  if (scaled <= 0n) throw new Error("TWAP price rounds to zero.");
  return scaled;
}
