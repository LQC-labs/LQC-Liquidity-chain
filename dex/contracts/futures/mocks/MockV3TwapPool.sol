// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockV3TwapPool {
    address public immutable token0;
    address public immutable token1;
    uint128 public liquidity;
    uint160 public sqrtPriceX96;
    int24 public tick;
    uint16 public observationCardinality;
    bool public unlocked;
    uint32 public feeProtocol;
    bool public observationAvailable = true;
    int56 public pastTickCumulative;
    int56 public currentTickCumulative;

    error ObservationUnavailable();

    constructor(address token0_, address token1_) {
        token0 = token0_;
        token1 = token1_;
    }

    function setState(
        uint128 liquidity_,
        uint160 sqrtPriceX96_,
        int24 tick_,
        uint16 observationCardinality_,
        bool unlocked_,
        bool observationAvailable_,
        int56 pastTickCumulative_,
        int56 currentTickCumulative_
    ) external {
        liquidity = liquidity_;
        sqrtPriceX96 = sqrtPriceX96_;
        tick = tick_;
        observationCardinality = observationCardinality_;
        unlocked = unlocked_;
        observationAvailable = observationAvailable_;
        pastTickCumulative = pastTickCumulative_;
        currentTickCumulative = currentTickCumulative_;
    }

    function setFeeProtocol(uint32 feeProtocol_) external {
        feeProtocol = feeProtocol_;
    }

    function slot0()
        external
        view
        returns (uint160, int24, uint16, uint16, uint16, uint32, bool)
    {
        return (sqrtPriceX96, tick, 0, observationCardinality, observationCardinality, feeProtocol, unlocked);
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
    {
        if (!observationAvailable || secondsAgos.length != 2 || secondsAgos[0] == 0 || secondsAgos[1] != 0) {
            revert ObservationUnavailable();
        }
        tickCumulatives = new int56[](2);
        tickCumulatives[0] = pastTickCumulative;
        tickCumulatives[1] = currentTickCumulative;
        secondsPerLiquidityCumulativeX128s = new uint160[](2);
    }
}
