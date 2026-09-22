// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCFuturesMarketRegistry} from "./LQCFuturesMarketRegistry.sol";
import {LQCFuturesVault} from "./LQCFuturesVault.sol";
import {ILQCFuturesOracle} from "./ILQCFuturesOracle.sol";

/// @notice Isolated-margin perpetual engine for LQC Flow Futures.
/// @dev Master 7/5 substeps 1-5 add canonical reduction, conserved funding, segregated fees,
///      bounded Futures-only Insurance/residual-bad-debt accounting and bounded partial liquidation.
///      ADL remains the next 7/5 substep.
contract LQCPerpEngine {
    uint256 public constant BPS = 10_000;
    uint256 public constant PRICE_SCALE = 1e18;
    uint256 public constant FUNDING_RAY = 1e27;
    uint256 public constant MAX_FUNDING_DELTA_RAY = FUNDING_RAY;
    uint256 public constant MAX_ORACLE_DELAY = 5 minutes;

    struct Position {
        uint256 margin;
        uint256 sizeUsd;
        uint256 entryPrice;
        bool isLong;
        bool open;
    }

    struct FundingState {
        int256 cumulativeFundingPerUsdRay;
        uint256 maxAbsDeltaPerUpdateRay;
        bool configured;
    }

    LQCFuturesMarketRegistry public immutable registry;
    LQCFuturesVault public immutable vault;

    mapping(address => mapping(uint256 => Position)) public positions;
    mapping(uint256 => FundingState) public fundingStates;
    mapping(address => mapping(uint256 => int256)) public positionFundingEntryRay;
    mapping(uint256 => uint256) public tradingFeeBps;
    mapping(uint256 => uint256) public insuranceFeeShareBps;
    mapping(uint256 => uint256) public maxInsuranceCoverageBps;
    mapping(uint256 => uint256) public liquidationReductionBps;
    mapping(uint256 => uint256) public liquidationMinRemainingSizeUsd;

    event PositionOpened(
        address indexed account,
        uint256 indexed marketId,
        bool isLong,
        uint256 margin,
        uint256 sizeUsd,
        uint256 entryPrice
    );
    event PositionReduced(
        address indexed account,
        uint256 indexed marketId,
        uint256 reducedSizeUsd,
        uint256 releasedMargin,
        uint256 remainingSizeUsd,
        uint256 remainingMargin,
        uint256 exitPrice,
        int256 realizedPnl
    );
    event PositionClosed(address indexed account, uint256 indexed marketId, uint256 exitPrice, int256 pnl);
    event PositionLiquidated(
        address indexed account,
        uint256 indexed marketId,
        address indexed liquidator,
        uint256 price,
        int256 pnl
    );
    event FundingConfigured(uint256 indexed marketId, uint256 maxAbsDeltaPerUpdateRay);
    event TradingFeeConfigured(uint256 indexed marketId, uint256 feeBps, uint256 insuranceShareBps);
    event TradingFeeCharged(address indexed account, uint256 indexed marketId, uint256 notionalUsd, uint256 fee, uint256 insuranceAmount);
    event InsuranceCoverageConfigured(uint256 indexed marketId, uint256 maxCoverageBps);
    event PartialLiquidationConfigured(
        uint256 indexed marketId,
        uint256 reductionBps,
        uint256 minRemainingSizeUsd
    );
    event PositionPartiallyLiquidated(
        address indexed account,
        uint256 indexed marketId,
        address indexed liquidator,
        uint256 reducedSizeUsd,
        uint256 remainingSizeUsd,
        uint256 remainingMargin,
        uint256 price,
        int256 realizedPnl
    );
    event LiquidationFundingApplied(
        address indexed account,
        uint256 indexed marketId,
        int256 payment,
        uint256 marginCredit,
        uint256 marginDebit,
        uint256 insuranceCovered,
        uint256 residualBadDebt
    );
    event PositionDeficitRecorded(
        address indexed account,
        uint256 indexed marketId,
        uint256 deficit,
        uint256 insuranceCovered,
        uint256 residualBadDebt
    );
    event FundingIndexUpdated(
        uint256 indexed marketId,
        int256 previousIndexRay,
        int256 newIndexRay,
        int256 deltaRay
    );
    event FundingSettled(
        address indexed account,
        uint256 indexed marketId,
        int256 payment,
        int256 checkpointIndexRay
    );

    error Forbidden();
    error InvalidAmount();
    error InvalidReduction();
    error MarketInactive();
    error PositionExists();
    error PositionNotFound();
    error LeverageTooHigh();
    error InvalidOraclePrice();
    error StaleOraclePrice();
    error NotLiquidatable();
    error PartialReductionWouldCreateBadDebt();
    error FundingMarketNotFound();
    error FundingNotConfigured();
    error InvalidFundingBound();
    error InvalidFundingDelta();
    error FundingDeltaTooLarge();
    error FundingOverflow();
    error InvalidFeeConfiguration();
    error InvalidInsuranceConfiguration();
    error InvalidLiquidationConfiguration();

    modifier onlyRegistryOwner() {
        if (msg.sender != registry.owner()) revert Forbidden();
        _;
    }

    constructor(address registry_, address vault_) {
        if (registry_ == address(0) || vault_ == address(0)) revert InvalidAmount();
        registry = LQCFuturesMarketRegistry(registry_);
        vault = LQCFuturesVault(vault_);
    }

    /// @notice Configures the per-market Futures trading fee and its Insurance reserve share.
    /// @dev BPS values are bounded; Treasury receives the remainder. Reserve spending is deferred to later gates.
    function configureTradingFee(uint256 marketId, uint256 feeBps, uint256 insuranceShareBps_) external onlyRegistryOwner {
        if (marketId == 0 || marketId > registry.marketCount()) revert FundingMarketNotFound();
        if (feeBps > BPS || insuranceShareBps_ > BPS) revert InvalidFeeConfiguration();
        tradingFeeBps[marketId] = feeBps;
        insuranceFeeShareBps[marketId] = insuranceShareBps_;
        emit TradingFeeConfigured(marketId, feeBps, insuranceShareBps_);
    }

    /// @notice Configures the bounded partial-liquidation step for a market.
    /// @dev A zero stored reduction means legacy full liquidation. Governance may configure
    ///      1..10000 bps. minRemainingSizeUsd may be zero to disable dust promotion.
    function configurePartialLiquidation(
        uint256 marketId,
        uint256 reductionBps,
        uint256 minRemainingSizeUsd
    ) external onlyRegistryOwner {
        if (marketId == 0 || marketId > registry.marketCount()) revert FundingMarketNotFound();
        if (reductionBps == 0 || reductionBps > BPS) revert InvalidLiquidationConfiguration();

        liquidationReductionBps[marketId] = reductionBps;
        liquidationMinRemainingSizeUsd[marketId] = minRemainingSizeUsd;
        emit PartialLiquidationConfigured(marketId, reductionBps, minRemainingSizeUsd);
    }

    /// @notice Configures the maximum fraction of a realized deficit that Insurance may cover.
    /// @dev This is a Governance-supplied bound, not a hard-coded product value.
    ///      Available Insurance reserve remains the global physical coverage ceiling.
    function configureInsuranceCoverage(uint256 marketId, uint256 maxCoverageBps) external onlyRegistryOwner {
        if (marketId == 0 || marketId > registry.marketCount()) revert FundingMarketNotFound();
        if (maxCoverageBps > BPS) revert InvalidInsuranceConfiguration();
        maxInsuranceCoverageBps[marketId] = maxCoverageBps;
        emit InsuranceCoverageConfigured(marketId, maxCoverageBps);
    }

    /// @notice Sets the per-market maximum absolute funding-index change accepted per update.
    /// @dev No product funding rate is hard-coded here. Governance supplies a market-specific bound.
    ///      FUNDING_RAY is only a protocol safety ceiling of 100% per update, not an approved economic rate.
    function configureFunding(uint256 marketId, uint256 maxAbsDeltaPerUpdateRay) external onlyRegistryOwner {
        if (marketId == 0 || marketId > registry.marketCount()) revert FundingMarketNotFound();
        if (maxAbsDeltaPerUpdateRay == 0 || maxAbsDeltaPerUpdateRay > MAX_FUNDING_DELTA_RAY) {
            revert InvalidFundingBound();
        }

        FundingState storage state = fundingStates[marketId];
        state.maxAbsDeltaPerUpdateRay = maxAbsDeltaPerUpdateRay;
        state.configured = true;
        emit FundingConfigured(marketId, maxAbsDeltaPerUpdateRay);
    }

    /// @notice Advances the cumulative funding index after a fresh market-oracle check.
    /// @dev Positive delta means longs pay shorts; negative delta means shorts pay longs.
    function updateFundingIndex(uint256 marketId, int256 deltaRay) external onlyRegistryOwner {
        FundingState storage state = fundingStates[marketId];
        if (!state.configured) revert FundingNotConfigured();
        if (deltaRay == 0 || deltaRay == type(int256).min) revert InvalidFundingDelta();

        uint256 absDelta = uint256(deltaRay < 0 ? -deltaRay : deltaRay);
        if (absDelta > state.maxAbsDeltaPerUpdateRay) revert FundingDeltaTooLarge();

        (, address indexToken,, address oracle,,,) = registry.markets(marketId);
        _price(indexToken, oracle);

        int256 previous = state.cumulativeFundingPerUsdRay;
        int256 next = previous + deltaRay;
        state.cumulativeFundingPerUsdRay = next;
        emit FundingIndexUpdated(marketId, previous, next, deltaRay);
    }

    function openPosition(uint256 marketId, uint256 margin, uint256 sizeUsd, bool isLong) external {
        if (margin == 0 || sizeUsd == 0) revert InvalidAmount();
        Position storage existing = positions[msg.sender][marketId];
        if (existing.open) revert PositionExists();

        (
            ,
            address indexToken,
            address collateralToken,
            address oracle,
            uint32 maxLeverageBps,
            ,
            bool active
        ) = registry.markets(marketId);

        if (!active) revert MarketInactive();
        if (sizeUsd * BPS > margin * uint256(maxLeverageBps)) revert LeverageTooHigh();

        uint256 price = _price(indexToken, oracle);
        vault.lockCollateral(msg.sender, collateralToken, margin);
        _chargeTradingFee(msg.sender, marketId, collateralToken, sizeUsd);

        positions[msg.sender][marketId] =
            Position({margin: margin, sizeUsd: sizeUsd, entryPrice: price, isLong: isLong, open: true});
        positionFundingEntryRay[msg.sender][marketId] = fundingStates[marketId].cumulativeFundingPerUsdRay;

        emit PositionOpened(msg.sender, marketId, isLong, margin, sizeUsd, price);
    }

    /// @notice Settles the caller's funding cash against the dedicated Futures funding pool.
    /// @dev Negative payment debits available balance; positive payment consumes previously collected pool funds.
    function settleFunding(uint256 marketId) external returns (int256 payment) {
        Position memory position = positions[msg.sender][marketId];
        if (!position.open) revert PositionNotFound();
        (,, address collateralToken,,,,) = registry.markets(marketId);
        payment = _settleFundingCheckpoint(msg.sender, marketId, collateralToken, position);
    }

    function previewFundingPayment(address account, uint256 marketId) public view returns (int256 payment) {
        Position memory position = positions[account][marketId];
        if (!position.open) revert PositionNotFound();

        FundingState memory state = fundingStates[marketId];
        if (!state.configured) return 0;

        int256 deltaRay = state.cumulativeFundingPerUsdRay - positionFundingEntryRay[account][marketId];
        if (deltaRay == 0) return 0;
        if (deltaRay == type(int256).min) revert FundingOverflow();

        uint256 absDelta = uint256(deltaRay < 0 ? -deltaRay : deltaRay);
        if (position.sizeUsd != 0 && absDelta > type(uint256).max / position.sizeUsd) revert FundingOverflow();

        uint256 magnitude = position.sizeUsd * absDelta / FUNDING_RAY;
        if (magnitude > uint256(type(int256).max)) revert FundingOverflow();

        bool receives = (deltaRay > 0 && !position.isLong) || (deltaRay < 0 && position.isLong);
        payment = receives ? int256(magnitude) : -int256(magnitude);
    }

    /// @notice Reduces part or all of the caller's position at the current Oracle price.
    /// @dev Outstanding voluntary funding is settled before size changes, preventing funding evasion.
    function reducePosition(uint256 marketId, uint256 reduceSizeUsd)
        external
        returns (uint256 releasedMargin, int256 realizedPnl, uint256 exitPrice)
    {
        (releasedMargin, realizedPnl, exitPrice,) = _reducePosition(msg.sender, marketId, reduceSizeUsd);
    }

    function closePosition(uint256 marketId) external {
        Position memory position = positions[msg.sender][marketId];
        if (!position.open) revert PositionNotFound();

        (, int256 pnl, uint256 price, uint256 remainingSize) =
            _reducePosition(msg.sender, marketId, position.sizeUsd);

        if (remainingSize != 0) revert InvalidReduction();
        emit PositionClosed(msg.sender, marketId, price, pnl);
    }

    function liquidate(address account, uint256 marketId) external {
        Position storage stored = positions[account][marketId];
        if (!stored.open) revert PositionNotFound();

        (
            ,
            address indexToken,
            address collateralToken,
            address oracle,
            ,
            uint32 maintenanceMarginBps,
        ) = registry.markets(marketId);

        Position memory position = stored;
        position.margin = _settleLiquidationFundingCheckpoint(
            account,
            marketId,
            collateralToken,
            position
        );
        stored.margin = position.margin;

        uint256 price = _price(indexToken, oracle);
        int256 pnl = _pnl(position, price);
        int256 equity = int256(position.margin) + pnl;
        uint256 maintenance = (position.sizeUsd * uint256(maintenanceMarginBps)) / BPS;
        if (equity > int256(maintenance)) revert NotLiquidatable();

        uint256 reduceSizeUsd = _liquidationReductionSize(marketId, position.sizeUsd);
        bool fullLiquidation = reduceSizeUsd == position.sizeUsd || position.margin == 0;

        Position memory slice = Position({
            margin: 0,
            sizeUsd: reduceSizeUsd,
            entryPrice: position.entryPrice,
            isLong: position.isLong,
            open: true
        });
        int256 realizedPnl = _pnl(slice, price);

        if (!fullLiquidation && realizedPnl < 0 && uint256(-realizedPnl) >= position.margin) {
            fullLiquidation = true;
            reduceSizeUsd = position.sizeUsd;
            slice.sizeUsd = position.sizeUsd;
            realizedPnl = pnl;
        }

        if (fullLiquidation) {
            delete positions[account][marketId];
            delete positionFundingEntryRay[account][marketId];
            _settle(account, marketId, collateralToken, position.margin, pnl);
            emit PositionLiquidated(account, marketId, msg.sender, price, pnl);
            return;
        }

        uint256 remainingSizeUsd = position.sizeUsd - reduceSizeUsd;
        uint256 remainingMargin = position.margin;

        if (realizedPnl < 0) {
            uint256 realizedLoss = uint256(-realizedPnl);
            vault.settlePnL(account, collateralToken, -int256(realizedLoss));
            remainingMargin -= realizedLoss;
        } else if (realizedPnl > 0) {
            vault.settlePnL(account, collateralToken, realizedPnl);
        }

        stored.sizeUsd = remainingSizeUsd;
        stored.margin = remainingMargin;

        emit PositionReduced(
            account,
            marketId,
            reduceSizeUsd,
            0,
            remainingSizeUsd,
            remainingMargin,
            price,
            realizedPnl
        );
        emit PositionPartiallyLiquidated(
            account,
            marketId,
            msg.sender,
            reduceSizeUsd,
            remainingSizeUsd,
            remainingMargin,
            price,
            realizedPnl
        );
    }

    function getPositionPnl(address account, uint256 marketId)
        external
        view
        returns (int256 pnl, uint256 markPrice)
    {
        Position memory position = positions[account][marketId];
        if (!position.open) revert PositionNotFound();

        (, address indexToken,, address oracle,,,) = registry.markets(marketId);
        markPrice = _price(indexToken, oracle);
        pnl = _pnl(position, markPrice);
    }

    function _reducePosition(address account, uint256 marketId, uint256 reduceSizeUsd)
        private
        returns (uint256 releasedMargin, int256 realizedPnl, uint256 exitPrice, uint256 remainingSizeUsd)
    {
        Position storage stored = positions[account][marketId];
        if (!stored.open) revert PositionNotFound();

        Position memory beforePosition = stored;
        if (reduceSizeUsd == 0 || reduceSizeUsd > beforePosition.sizeUsd) revert InvalidReduction();

        (, address indexToken, address collateralToken, address oracle,,,) = registry.markets(marketId);

        _settleFundingCheckpoint(account, marketId, collateralToken, beforePosition);
        exitPrice = _price(indexToken, oracle);

        releasedMargin = beforePosition.margin * reduceSizeUsd / beforePosition.sizeUsd;
        if (releasedMargin == 0) revert InvalidReduction();

        Position memory reducedSlice = Position({
            margin: releasedMargin,
            sizeUsd: reduceSizeUsd,
            entryPrice: beforePosition.entryPrice,
            isLong: beforePosition.isLong,
            open: true
        });
        realizedPnl = _pnl(reducedSlice, exitPrice);

        bool fullReduction = reduceSizeUsd == beforePosition.sizeUsd;
        if (!fullReduction) {
            if (int256(releasedMargin) + realizedPnl <= 0) revert PartialReductionWouldCreateBadDebt();

            remainingSizeUsd = beforePosition.sizeUsd - reduceSizeUsd;
            uint256 remainingMargin = beforePosition.margin - releasedMargin;
            if (remainingSizeUsd == 0 || remainingMargin == 0) revert InvalidReduction();

            stored.sizeUsd = remainingSizeUsd;
            stored.margin = remainingMargin;

            _settle(account, marketId, collateralToken, releasedMargin, realizedPnl);
            _chargeTradingFee(account, marketId, collateralToken, reduceSizeUsd);

            emit PositionReduced(
                account,
                marketId,
                reduceSizeUsd,
                releasedMargin,
                remainingSizeUsd,
                remainingMargin,
                exitPrice,
                realizedPnl
            );
            return (releasedMargin, realizedPnl, exitPrice, remainingSizeUsd);
        }

        delete positions[account][marketId];
        delete positionFundingEntryRay[account][marketId];
        _settle(account, marketId, collateralToken, releasedMargin, realizedPnl);
        _chargeTradingFee(account, marketId, collateralToken, reduceSizeUsd);

        emit PositionReduced(
            account,
            marketId,
            reduceSizeUsd,
            releasedMargin,
            0,
            0,
            exitPrice,
            realizedPnl
        );
        return (releasedMargin, realizedPnl, exitPrice, 0);
    }

    function _liquidationReductionSize(uint256 marketId, uint256 positionSizeUsd)
        private
        view
        returns (uint256 reduceSizeUsd)
    {
        uint256 reductionBps = liquidationReductionBps[marketId];
        if (reductionBps == 0) return positionSizeUsd;

        if (positionSizeUsd > type(uint256).max / reductionBps) revert InvalidAmount();
        reduceSizeUsd = positionSizeUsd * reductionBps / BPS;
        if (reduceSizeUsd == 0 || reduceSizeUsd >= positionSizeUsd) return positionSizeUsd;

        uint256 remaining = positionSizeUsd - reduceSizeUsd;
        uint256 minimumRemaining = liquidationMinRemainingSizeUsd[marketId];
        if (minimumRemaining != 0 && remaining < minimumRemaining) return positionSizeUsd;
    }

    function _settleLiquidationFundingCheckpoint(
        address account,
        uint256 marketId,
        address collateralToken,
        Position memory position
    ) private returns (uint256 adjustedMargin) {
        FundingState memory state = fundingStates[marketId];
        adjustedMargin = position.margin;

        if (!state.configured) {
            positionFundingEntryRay[account][marketId] = state.cumulativeFundingPerUsdRay;
            return adjustedMargin;
        }

        int256 payment = previewFundingPayment(account, marketId);
        if (payment == 0) {
            positionFundingEntryRay[account][marketId] = state.cumulativeFundingPerUsdRay;
            emit FundingSettled(account, marketId, 0, state.cumulativeFundingPerUsdRay);
            return adjustedMargin;
        }

        uint256 maxCoverage;
        if (payment < 0) {
            uint256 debit = uint256(-payment);
            uint256 coverageBps = maxInsuranceCoverageBps[marketId];
            if (coverageBps != 0 && debit > type(uint256).max / coverageBps) revert InvalidAmount();
            maxCoverage = debit * coverageBps / BPS;
        }

        (
            uint256 marginCredit,
            uint256 marginDebit,
            uint256 insuranceCovered,
            uint256 residual
        ) = vault.settleLiquidationFunding(
            account,
            collateralToken,
            payment,
            position.margin,
            maxCoverage
        );

        adjustedMargin = position.margin + marginCredit - marginDebit;
        positionFundingEntryRay[account][marketId] = state.cumulativeFundingPerUsdRay;

        emit FundingSettled(account, marketId, payment, state.cumulativeFundingPerUsdRay);
        emit LiquidationFundingApplied(
            account,
            marketId,
            payment,
            marginCredit,
            marginDebit,
            insuranceCovered,
            residual
        );
    }

    function _chargeTradingFee(address account, uint256 marketId, address collateralToken, uint256 notionalUsd) private {
        uint256 feeBps = tradingFeeBps[marketId];
        if (feeBps == 0) return;
        if (notionalUsd > type(uint256).max / feeBps) revert InvalidAmount();
        uint256 fee = notionalUsd * feeBps / BPS;
        if (fee == 0) return;
        uint256 insuranceAmount = fee * insuranceFeeShareBps[marketId] / BPS;
        vault.collectTradingFee(account, collateralToken, fee, insuranceAmount);
        emit TradingFeeCharged(account, marketId, notionalUsd, fee, insuranceAmount);
    }

    function _settleFundingCheckpoint(
        address account,
        uint256 marketId,
        address collateralToken,
        Position memory position
    ) private returns (int256 payment) {
        FundingState memory state = fundingStates[marketId];
        if (!state.configured) {
            positionFundingEntryRay[account][marketId] = state.cumulativeFundingPerUsdRay;
            return 0;
        }

        payment = previewFundingPayment(account, marketId);
        if (payment != 0) vault.settleFunding(account, collateralToken, payment);

        positionFundingEntryRay[account][marketId] = state.cumulativeFundingPerUsdRay;
        emit FundingSettled(account, marketId, payment, state.cumulativeFundingPerUsdRay);
    }

    function _settle(address account, uint256 marketId, address collateralToken, uint256 margin, int256 pnl) private {
        if (pnl >= 0) {
            if (margin != 0) vault.unlockCollateral(account, collateralToken, margin);
            if (pnl > 0) vault.settlePnL(account, collateralToken, pnl);
            return;
        }

        uint256 loss = uint256(-pnl);
        if (loss < margin) {
            vault.settlePnL(account, collateralToken, -int256(loss));
            vault.unlockCollateral(account, collateralToken, margin - loss);
            return;
        }

        vault.settlePnL(account, collateralToken, -int256(margin));
        uint256 deficit = loss - margin;
        if (deficit == 0) return;

        uint256 coverageBps = maxInsuranceCoverageBps[marketId];
        if (coverageBps != 0 && deficit > type(uint256).max / coverageBps) revert InvalidAmount();
        uint256 maxCoverage = deficit * coverageBps / BPS;
        (uint256 covered, uint256 residual) = vault.coverBadDebt(collateralToken, deficit, maxCoverage);

        emit PositionDeficitRecorded(account, marketId, deficit, covered, residual);
    }

    function _pnl(Position memory position, uint256 price) private pure returns (int256) {
        if (position.isLong) {
            return (int256(price) - int256(position.entryPrice)) * int256(position.sizeUsd)
                / int256(position.entryPrice);
        }
        return (int256(position.entryPrice) - int256(price)) * int256(position.sizeUsd)
            / int256(position.entryPrice);
    }

    function _price(address indexToken, address oracle) private view returns (uint256 price) {
        uint256 updatedAt;
        (price, updatedAt) = ILQCFuturesOracle(oracle).getPrice(indexToken);
        if (price == 0 || updatedAt > block.timestamp) revert InvalidOraclePrice();
        if (block.timestamp - updatedAt > MAX_ORACLE_DELAY) revert StaleOraclePrice();
    }
}
