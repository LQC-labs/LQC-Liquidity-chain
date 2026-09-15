// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LQCFuturesMarketRegistry} from "./LQCFuturesMarketRegistry.sol";
import {LQCFuturesVault} from "./LQCFuturesVault.sol";
import {ILQCFuturesOracle} from "./ILQCFuturesOracle.sol";

/// @notice MVP isolated-margin perpetual engine for LQC Flow Futures.
/// @dev Testnet/audit stage. Funding, fees, partial close and insurance are intentionally separate follow-up modules.
contract LQCPerpEngine {
    uint256 public constant BPS = 10_000;
    uint256 public constant PRICE_SCALE = 1e18;
    uint256 public constant MAX_ORACLE_DELAY = 5 minutes;

    struct Position {
        uint256 margin;
        uint256 sizeUsd;
        uint256 entryPrice;
        bool isLong;
        bool open;
    }

    LQCFuturesMarketRegistry public immutable registry;
    LQCFuturesVault public immutable vault;

    mapping(address => mapping(uint256 => Position)) public positions;

    event PositionOpened(address indexed account, uint256 indexed marketId, bool isLong, uint256 margin, uint256 sizeUsd, uint256 entryPrice);
    event PositionClosed(address indexed account, uint256 indexed marketId, uint256 exitPrice, int256 pnl);
    event PositionLiquidated(address indexed account, uint256 indexed marketId, address indexed liquidator, uint256 price, int256 pnl);

    error InvalidAmount();
    error MarketInactive();
    error PositionExists();
    error PositionNotFound();
    error LeverageTooHigh();
    error InvalidOraclePrice();
    error StaleOraclePrice();
    error NotLiquidatable();

    constructor(address registry_, address vault_) {
        if (registry_ == address(0) || vault_ == address(0)) revert InvalidAmount();
        registry = LQCFuturesMarketRegistry(registry_);
        vault = LQCFuturesVault(vault_);
    }

    function openPosition(uint256 marketId, uint256 margin, uint256 sizeUsd, bool isLong) external {
        if (margin == 0 || sizeUsd == 0) revert InvalidAmount();
        Position storage existing = positions[msg.sender][marketId];
        if (existing.open) revert PositionExists();

        (, address indexToken, address collateralToken, address oracle, uint32 maxLeverageBps,, bool active) = registry.markets(marketId);
        if (!active) revert MarketInactive();
        if (sizeUsd * BPS > margin * uint256(maxLeverageBps)) revert LeverageTooHigh();

        uint256 price = _price(indexToken, oracle);
        vault.lockCollateral(msg.sender, collateralToken, margin);
        positions[msg.sender][marketId] = Position({margin: margin, sizeUsd: sizeUsd, entryPrice: price, isLong: isLong, open: true});
        emit PositionOpened(msg.sender, marketId, isLong, margin, sizeUsd, price);
    }

    function closePosition(uint256 marketId) external {
        Position memory position = positions[msg.sender][marketId];
        if (!position.open) revert PositionNotFound();
        (, address indexToken, address collateralToken, address oracle,,,,) = registry.markets(marketId);
        uint256 price = _price(indexToken, oracle);
        int256 pnl = _pnl(position, price);
        delete positions[msg.sender][marketId];
        _settle(msg.sender, collateralToken, position.margin, pnl);
        emit PositionClosed(msg.sender, marketId, price, pnl);
    }

    function liquidate(address account, uint256 marketId) external {
        Position memory position = positions[account][marketId];
        if (!position.open) revert PositionNotFound();
        (, address indexToken, address collateralToken, address oracle,, uint32 maintenanceMarginBps,) = registry.markets(marketId);
        uint256 price = _price(indexToken, oracle);
        int256 pnl = _pnl(position, price);
        int256 equity = int256(position.margin) + pnl;
        uint256 maintenance = (position.sizeUsd * uint256(maintenanceMarginBps)) / BPS;
        if (equity > int256(maintenance)) revert NotLiquidatable();
        delete positions[account][marketId];
        _settle(account, collateralToken, position.margin, pnl);
        emit PositionLiquidated(account, marketId, msg.sender, price, pnl);
    }

    function getPositionPnl(address account, uint256 marketId) external view returns (int256 pnl, uint256 markPrice) {
        Position memory position = positions[account][marketId];
        if (!position.open) revert PositionNotFound();
        (, address indexToken,, address oracle,,,,) = registry.markets(marketId);
        markPrice = _price(indexToken, oracle);
        pnl = _pnl(position, markPrice);
    }

    function _settle(address account, address collateralToken, uint256 margin, int256 pnl) private {
        if (pnl >= 0) {
            vault.unlockCollateral(account, collateralToken, margin);
            if (pnl > 0) vault.settlePnL(account, collateralToken, pnl);
            return;
        }
        uint256 loss = uint256(-pnl);
        if (loss >= margin) {
            vault.settlePnL(account, collateralToken, -int256(margin));
        } else {
            vault.settlePnL(account, collateralToken, -int256(loss));
            vault.unlockCollateral(account, collateralToken, margin - loss);
        }
    }

    function _pnl(Position memory position, uint256 price) private pure returns (int256) {
        if (position.isLong) {
            return (int256(price) - int256(position.entryPrice)) * int256(position.sizeUsd) / int256(position.entryPrice);
        }
        return (int256(position.entryPrice) - int256(price)) * int256(position.sizeUsd) / int256(position.entryPrice);
    }

    function _price(address indexToken, address oracle) private view returns (uint256 price) {
        uint256 updatedAt;
        (price, updatedAt) = ILQCFuturesOracle(oracle).getPrice(indexToken);
        if (price == 0 || updatedAt > block.timestamp) revert InvalidOraclePrice();
        if (block.timestamp - updatedAt > MAX_ORACLE_DELAY) revert StaleOraclePrice();
    }
}
