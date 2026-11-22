// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCFuturesM24CollateralRiskPreview} from "./LQCFuturesM24CollateralRiskPreview.sol";
import {LQCFuturesM25FxSettlementPreview} from "./LQCFuturesM25FxSettlementPreview.sol";
import {LQCFuturesVault} from "./LQCFuturesVault.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {IERC20} from "../interfaces/IERC20.sol";

/// @notice M26 read-only two-sided FX and Vault-surplus preview. NOT an executable payout.
contract LQCFuturesM26TwoSidedFxPreview {
    uint256 private constant USD18 = 1e18;

    LQCFuturesM24CollateralRiskPreview public immutable risk;
    LQCFuturesM25FxSettlementPreview public immutable lossPreview;
    LQCFuturesVault public immutable vault;

    error InvalidConfiguration();
    error InvalidQuote();
    error UnsupportedDecimals();
    error ArithmeticOutOfRange();
    error InsufficientUnreservedLiquidity();

    constructor(address risk_, address lossPreview_, address vault_) {
        if(risk_==address(0)||lossPreview_==address(0)||vault_==address(0)||
           risk_.code.length==0||lossPreview_.code.length==0||vault_.code.length==0)
            revert InvalidConfiguration();
        risk=LQCFuturesM24CollateralRiskPreview(risk_);
        lossPreview=LQCFuturesM25FxSettlementPreview(lossPreview_);
        vault=LQCFuturesVault(vault_);
        if(address(lossPreview.risk())!=risk_)revert InvalidConfiguration();
    }

    /// @notice Returns the fresh, consistent lower and upper USD18 collateral quotes.
    function collateralQuoteBounds() public view returns(uint256 low,uint256 high) {
        low=risk.collateralUsd18(); // checks both source freshness, validity, deviation
        uint256 a=_quote(risk.primary());
        uint256 b=_quote(risk.referenceFeed());
        high=a>b?a:b;
        if((a<b?a:b)!=low)revert InvalidQuote(); // do not mix snapshot observations
    }

    /// @notice Conservatively round losses UP using the lower quoted USD value.
    function previewLossTokens(uint256 lossUsd18,uint8 decimals) external view returns(uint256) {
        return lossPreview.lossToTokensCeil(lossUsd18,decimals);
    }

    /// @notice Conservatively round payout DOWN using the higher quoted USD value.
    function previewProfitTokens(uint256 profitUsd18,uint8 decimals) public view returns(uint256) {
        if(decimals!=6&&decimals!=18)revert UnsupportedDecimals();
        (,uint256 upper)=collateralQuoteBounds();
        uint256 unit=10**uint256(decimals);
        if(profitUsd18>type(uint256).max/unit)revert ArithmeticOutOfRange();
        return profitUsd18*unit/upper;
    }

    /// @notice Returns raw physical surplus after explicitly protected Vault liabilities.
    /// @dev This surplus is NOT necessarily economically distributable. Audit required.
    function unreservedVaultSurplus(address token) public view returns(uint256) {
        uint256 assets=IERC20(token).balanceOf(address(vault));
        uint256 accounted=vault.totalAccounted(token);
        uint256 funding=vault.fundingPoolBalance(token);
        uint256 insurance=vault.insuranceFeeReserve(token);
        uint256 treasury=vault.treasuryFeeReserve(token);
        if(accounted>type(uint256).max-funding)revert ArithmeticOutOfRange();
        uint256 reserved=accounted+funding;
        if(reserved>type(uint256).max-insurance)revert ArithmeticOutOfRange();
        reserved+=insurance;
        if(reserved>type(uint256).max-treasury)revert ArithmeticOutOfRange();
        reserved+=treasury;
        if(assets<reserved)revert InsufficientUnreservedLiquidity();
        return assets-reserved;
    }

    /// @notice Non-authoritative profit-payout simulation grounded in actual Vault ERC20 and ledgers.
    function previewBoundedProfit(
        address token,uint256 profitUsd18,uint8 decimals
    ) external view returns(uint256 tokens,uint256 excessBefore,uint256 excessAfter) {
        excessBefore=unreservedVaultSurplus(token);
        tokens=previewProfitTokens(profitUsd18,decimals);
        if(tokens>excessBefore)revert InsufficientUnreservedLiquidity();
        excessAfter=excessBefore-tokens;
    }

    function _quote(address feed) private view returns(uint256 normalized) {
        uint80 id;
        uint80 answered;
        int256 answer;
        uint256 updatedAt;
        try IAggregatorV3(feed).latestRoundData() returns(
            uint80 roundId,int256 price,uint256,uint256 timestamp,uint80 answeredInRound
        ) {id=roundId;answered=answeredInRound;answer=price;updatedAt=timestamp;}
        catch{revert InvalidQuote();}
        if(answer<=0||updatedAt==0||updatedAt>block.timestamp||
           block.timestamp-updatedAt>risk.MAX_FEED_AGE()||answered<id)revert InvalidQuote();
        uint8 decimals;
        try IAggregatorV3(feed).decimals() returns(uint8 d){decimals=d;}
        catch{revert InvalidQuote();}
        if(decimals>18)revert InvalidQuote();
        uint256 scale=10**uint256(18-decimals);
        if(uint256(answer)>type(uint256).max/scale)revert InvalidQuote();
        normalized=uint256(answer)*scale;
        if(normalized==0)revert InvalidQuote();
    }
}
