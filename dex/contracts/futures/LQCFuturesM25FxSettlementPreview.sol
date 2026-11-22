// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCFuturesM24CollateralRiskPreview} from "./LQCFuturesM24CollateralRiskPreview.sol";

/// @notice M25 READ-ONLY token-unit FX settlement model, NOT an authorized settlement engine.
/// @dev Quotes use the lower of two fresh collateral/USD feeds from M24. No asset transfer.
contract LQCFuturesM25FxSettlementPreview {
    uint256 public constant USD18 = 1e18;
    uint256 public constant BPS = 10000;
    LQCFuturesM24CollateralRiskPreview public immutable risk;

    error InvalidInput();
    error UnsupportedDecimals();
    error ArithmeticOutOfRange();
    error InadequateProfitLiquidity();

    struct LossResult {
        uint256 requiredTokens;
        uint256 consumedMargin;
        uint256 insuredTokens;
        uint256 residualBadDebt;
        uint256 marginRemaining;
        uint256 insuranceRemaining;
        uint256 treasuryUnchanged;
        uint256 fundingUnchanged;
    }

    constructor(address risk_) {
        if(risk_==address(0)||risk_.code.length==0)revert InvalidInput();
        risk=LQCFuturesM24CollateralRiskPreview(risk_);
    }

    function _unit(uint8 decimals) private pure returns(uint256) {
        if(decimals!=6&&decimals!=18)revert UnsupportedDecimals();
        return 10**uint256(decimals);
    }

    // USD18 -> native collateral units, conservatively ceiling losses.
    // A fractional token-base-unit liability must never be silently waived.
    function lossToTokensCeil(uint256 lossUsd18,uint8 decimals) public view returns(uint256) {
        uint256 unit=_unit(decimals);
        uint256 quote=risk.collateralUsd18(); // reverts on stale/deviant/bad sources
        if(quote==0||lossUsd18>type(uint256).max/unit)revert ArithmeticOutOfRange();
        uint256 numerator=lossUsd18*unit;
        uint256 q=numerator/quote;
        if(numerator%quote!=0) {
            if(q==type(uint256).max)revert ArithmeticOutOfRange();
            q+=1;
        }
        return q;
    }

    // USD18 -> native collateral units, conservatively flooring profits.
    function profitToTokensFloor(uint256 profitUsd18,uint8 decimals) public view returns(uint256) {
        uint256 unit=_unit(decimals);
        uint256 quote=risk.collateralUsd18();
        if(quote==0||profitUsd18>type(uint256).max/unit)revert ArithmeticOutOfRange();
        return profitUsd18*unit/quote;
    }

    /// @dev Model a deficit waterfall without touching the real Vault or assuming excess
    /// collateral is spendable. Insurance share cap is proportional to AFTER-margin deficit.
    /// Treasury and Funding ledgers are deliberately excluded from deficit coverage.
    function simulateLoss(
        uint256 lossUsd18,uint8 decimals,uint256 marginTokens,
        uint256 insuranceReserveTokens,uint256 treasuryReserveTokens,
        uint256 fundingPoolTokens,uint16 maxInsuranceCoverageBps
    ) external view returns(LossResult memory out) {
        if(maxInsuranceCoverageBps>BPS)revert InvalidInput();
        out.requiredTokens=lossToTokensCeil(lossUsd18,decimals);
        out.consumedMargin=out.requiredTokens<marginTokens?out.requiredTokens:marginTokens;
        out.marginRemaining=marginTokens-out.consumedMargin;
        uint256 deficit=out.requiredTokens-out.consumedMargin;
        if(deficit!=0 && maxInsuranceCoverageBps>type(uint256).max/deficit)
            revert ArithmeticOutOfRange();
        uint256 capped=deficit*maxInsuranceCoverageBps/BPS;
        out.insuredTokens=capped<insuranceReserveTokens?capped:insuranceReserveTokens;
        out.insuranceRemaining=insuranceReserveTokens-out.insuredTokens;
        out.residualBadDebt=deficit-out.insuredTokens;
        out.treasuryUnchanged=treasuryReserveTokens;
        out.fundingUnchanged=fundingPoolTokens;
        assert(out.requiredTokens==out.consumedMargin+out.insuredTokens+out.residualBadDebt);
    }

    /// @dev Only report a positive profit payout if explicitly available excess
    /// liquidity covers it without touching user, Funding, Insurance or Treasury.
    function simulateProfit(
        uint256 profitUsd18,uint8 decimals,uint256 availableUnreservedExcessTokens
    ) external view returns(uint256 paidTokens) {
        paidTokens=profitToTokensFloor(profitUsd18,decimals);
        if(paidTokens>availableUnreservedExcessTokens)revert InadequateProfitLiquidity();
    }
}
