// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";

interface ILQCV3TwapPool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function liquidity() external view returns (uint128);
    function slot0() external view returns (uint160,int24,uint16,uint16,uint16,uint8,bool);
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s);
}

interface ILQCTokenDecimals {
    function decimals() external view returns (uint8);
}

/// @notice Read-only V3 TWAP reference feed for the Futures primary/reference circuit breaker.
/// @dev Selectively rebuilt from historical PR #296 against current main.
///      It exposes a Chainlink-compatible read surface only and cannot activate Futures markets.
contract LQCV3TwapReferenceAdapter is IAggregatorV3 {
    uint8 public constant override decimals = 18;
    uint32 public constant MIN_WINDOW = 300;
    uint32 public constant MAX_WINDOW = 1 days;
    uint8 public constant MAX_TOKEN_DECIMALS = 36;

    int24 private constant MIN_TICK = -887272;
    int24 private constant MAX_TICK = 887272;
    uint256 private constant Q128 = 1 << 128;
    uint256 private constant Q192 = 1 << 192;
    uint256 private constant PRICE_SCALE = 1e18;

    address public immutable pool;
    address public immutable indexToken;
    address public immutable quoteToken;
    uint32 public immutable observationWindow;
    uint128 public immutable minimumLiquidity;
    uint8 public immutable indexTokenDecimals;
    uint8 public immutable quoteTokenDecimals;

    error InvalidAddress();
    error InvalidWindow();
    error InvalidLiquidity();
    error InvalidPair();
    error UnsupportedDecimals();
    error PoolNotReady();
    error InsufficientLiquidity();
    error ObservationUnavailable();
    error InvalidTick();
    error InvalidPrice();
    error MulDivOverflow();

    constructor(
        address pool_,
        address indexToken_,
        address quoteToken_,
        uint32 window_,
        uint128 minimumLiquidity_
    ) {
        if (pool_ == address(0) || indexToken_ == address(0) || quoteToken_ == address(0)) revert InvalidAddress();
        if (indexToken_ == quoteToken_) revert InvalidPair();
        if (window_ < MIN_WINDOW || window_ > MAX_WINDOW) revert InvalidWindow();
        if (minimumLiquidity_ == 0) revert InvalidLiquidity();

        address token0_ = ILQCV3TwapPool(pool_).token0();
        address token1_ = ILQCV3TwapPool(pool_).token1();
        if (
            !((indexToken_ == token0_ && quoteToken_ == token1_)
                || (indexToken_ == token1_ && quoteToken_ == token0_))
        ) revert InvalidPair();

        uint8 indexDecimals_ = ILQCTokenDecimals(indexToken_).decimals();
        uint8 quoteDecimals_ = ILQCTokenDecimals(quoteToken_).decimals();
        if (indexDecimals_ > MAX_TOKEN_DECIMALS || quoteDecimals_ > MAX_TOKEN_DECIMALS) {
            revert UnsupportedDecimals();
        }

        pool = pool_;
        indexToken = indexToken_;
        quoteToken = quoteToken_;
        observationWindow = window_;
        minimumLiquidity = minimumLiquidity_;
        indexTokenDecimals = indexDecimals_;
        quoteTokenDecimals = quoteDecimals_;
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        ILQCV3TwapPool p = ILQCV3TwapPool(pool);
        (uint160 sqrtPriceX96,,,uint16 observationCardinality,,,bool unlocked) = p.slot0();
        if (sqrtPriceX96 == 0 || !unlocked || observationCardinality < 2) revert PoolNotReady();
        if (p.liquidity() < minimumLiquidity) revert InsufficientLiquidity();

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = observationWindow;
        secondsAgos[1] = 0;

        int56[] memory cumulatives;
        try p.observe(secondsAgos) returns (int56[] memory ticks, uint160[] memory) {
            cumulatives = ticks;
        } catch {
            revert ObservationUnavailable();
        }
        if (cumulatives.length != 2) revert ObservationUnavailable();

        int56 delta = cumulatives[1] - cumulatives[0];
        int56 window = int56(uint56(observationWindow));
        int56 mean = delta / window;
        if (delta < 0 && delta % window != 0) mean -= 1;
        if (mean < MIN_TICK || mean > MAX_TICK) revert InvalidTick();

        uint256 price = _priceAtTick(int24(mean));
        if (price == 0 || price > uint256(type(int256).max)) revert InvalidPrice();

        roundId = uint80(block.number);
        answeredInRound = roundId;
        updatedAt = block.timestamp;
        startedAt = block.timestamp - observationWindow;
        answer = int256(price);
    }

    function _priceAtTick(int24 tick) private view returns (uint256 price) {
        uint160 sqrtRatioX96 = _sqrtRatioAtTick(tick);
        uint256 baseScaled = (10 ** uint256(indexTokenDecimals)) * PRICE_SCALE;
        uint256 quoteScale = 10 ** uint256(quoteTokenDecimals);
        address token0_ = ILQCV3TwapPool(pool).token0();

        uint256 quoteScaled;
        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96) * uint256(sqrtRatioX96);
            if (indexToken == token0_) quoteScaled = _mulDiv(ratioX192, baseScaled, Q192);
            else quoteScaled = _mulDiv(Q192, baseScaled, ratioX192);
        } else {
            uint256 ratioX128 = _mulDiv(uint256(sqrtRatioX96), uint256(sqrtRatioX96), 1 << 64);
            if (indexToken == token0_) quoteScaled = _mulDiv(ratioX128, baseScaled, Q128);
            else quoteScaled = _mulDiv(Q128, baseScaled, ratioX128);
        }

        price = quoteScaled / quoteScale;
        if (price == 0) revert InvalidPrice();
    }

    /// @dev Full-precision floor(a*b/denominator), adapted from the standard 512-bit mulDiv construction.
    function _mulDiv(uint256 a, uint256 b, uint256 denominator) private pure returns (uint256 result) {
        if (denominator == 0) revert InvalidPrice();

        uint256 prod0;
        uint256 prod1;
        assembly ("memory-safe") {
            let mm := mulmod(a, b, not(0))
            prod0 := mul(a, b)
            prod1 := sub(sub(mm, prod0), lt(mm, prod0))
        }

        if (prod1 == 0) return prod0 / denominator;
        if (denominator <= prod1) revert MulDivOverflow();

        uint256 remainder;
        assembly ("memory-safe") {
            remainder := mulmod(a, b, denominator)
            prod1 := sub(prod1, gt(remainder, prod0))
            prod0 := sub(prod0, remainder)
        }

        uint256 twos = denominator & (~denominator + 1);
        assembly ("memory-safe") {
            denominator := div(denominator, twos)
            prod0 := div(prod0, twos)
            twos := add(div(sub(0, twos), twos), 1)
        }
        prod0 |= prod1 * twos;

        uint256 inverse = (3 * denominator) ^ 2;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;
        inverse *= 2 - denominator * inverse;

        result = prod0 * inverse;
    }

    /// @dev Integer TickMath-compatible conversion retained locally so runtime reads do not
    ///      depend on off-chain qualification utilities.
    function _sqrtRatioAtTick(int24 tick) private pure returns (uint160) {
        uint256 absTick = uint256(int256(tick < 0 ? -tick : tick));
        if (absTick > uint256(uint24(MAX_TICK))) revert InvalidTick();

        uint256 ratio =
            absTick & 1 != 0
                ? 0xfffcb933bd6fad37aa2d162d1a594001
                : 0x100000000000000000000000000000000;
        if (absTick & 0x2 != 0) ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
        if (absTick & 0x4 != 0) ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
        if (absTick & 0x8 != 0) ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
        if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
        if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
        if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
        if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
        if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
        if (absTick & 0x200 != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
        if (absTick & 0x400 != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
        if (absTick & 0x800 != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
        if (absTick & 0x1000 != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
        if (absTick & 0x2000 != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
        if (absTick & 0x4000 != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
        if (absTick & 0x8000 != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
        if (absTick & 0x10000 != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677e54f3e99bc9) >> 128;
        if (absTick & 0x20000 != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
        if (absTick & 0x40000 != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
        if (absTick & 0x80000 != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;

        if (tick > 0) ratio = type(uint256).max / ratio;
        return uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
    }
}
