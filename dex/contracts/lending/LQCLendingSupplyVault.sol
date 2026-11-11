// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {LQCLendingMarketRegistry} from "./LQCLendingMarketRegistry.sol";

interface ILQCLendingSupplyToken {
    function balanceOf(address account) external view returns (uint256);
}

/// @notice Stage-3 isolated-market collateral custody with exact-balance accounting.
/// @dev This contract deliberately creates no debt. Borrow/repay/liquidation are added in later stages.
contract LQCLendingSupplyVault {
    using SafeTransferLib for address;

    LQCLendingMarketRegistry public immutable registry;

    mapping(bytes32 marketId => uint256 amount) public totalSupplied;
    mapping(bytes32 marketId => mapping(address account => uint256 amount)) public supplied;

    uint256 private locked = 1;

    event Supplied(
        bytes32 indexed marketId,
        address indexed account,
        address indexed collateralAsset,
        uint256 amount,
        uint256 accountSupply,
        uint256 marketSupply
    );
    event Withdrawn(
        bytes32 indexed marketId,
        address indexed account,
        address indexed recipient,
        address collateralAsset,
        uint256 amount,
        uint256 accountSupply,
        uint256 marketSupply
    );

    error ZeroAddress();
    error ZeroAmount();
    error InsufficientSupply();
    error UnsupportedTokenBehavior();
    error Reentrancy();

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(address registry_) {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = LQCLendingMarketRegistry(registry_);
    }

    /// @notice Supplies the configured collateral asset for an isolated market.
    /// @dev Fee-on-transfer and rebasing deltas are rejected so accounting remains exact.
    function supply(bytes32 marketId, uint256 amount) external nonReentrant returns (uint256 accountSupply) {
        if (amount == 0) revert ZeroAmount();
        LQCLendingMarketRegistry.MarketConfig memory market = registry.getMarket(marketId);
        uint256 marketSupply = totalSupplied[marketId] + amount;
        registry.validateCaps(marketId, marketSupply, 0);

        address asset = market.collateralAsset;
        uint256 balanceBefore = ILQCLendingSupplyToken(asset).balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        uint256 balanceAfter = ILQCLendingSupplyToken(asset).balanceOf(address(this));
        if (balanceAfter < balanceBefore || balanceAfter - balanceBefore != amount) revert UnsupportedTokenBehavior();

        accountSupply = supplied[marketId][msg.sender] + amount;
        supplied[marketId][msg.sender] = accountSupply;
        totalSupplied[marketId] = marketSupply;
        emit Supplied(marketId, msg.sender, asset, amount, accountSupply, marketSupply);
    }

    /// @notice Withdraws collateral even when a market is disabled, preserving the safe user exit path.
    function withdraw(bytes32 marketId, uint256 amount, address recipient)
        external
        nonReentrant
        returns (uint256 accountSupply)
    {
        if (amount == 0) revert ZeroAmount();
        if (recipient == address(0)) revert ZeroAddress();

        uint256 previousSupply = supplied[marketId][msg.sender];
        if (amount > previousSupply) revert InsufficientSupply();
        LQCLendingMarketRegistry.MarketConfig memory market = registry.getMarket(marketId);

        accountSupply = previousSupply - amount;
        uint256 marketSupply = totalSupplied[marketId] - amount;
        supplied[marketId][msg.sender] = accountSupply;
        totalSupplied[marketId] = marketSupply;

        market.collateralAsset.safeTransfer(recipient, amount);
        emit Withdrawn(marketId, msg.sender, recipient, market.collateralAsset, amount, accountSupply, marketSupply);
    }
}
