// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../../interfaces/IERC20.sol";
import {SafeTransferLib} from "../../libraries/SafeTransferLib.sol";
import {ILQCStrategyAdapter} from "../interfaces/ILQCStrategyAdapter.sol";

/// @notice Non-yielding reference adapter used to validate the Vault V1 strategy boundary.
/// @dev A reviewed protocol-specific adapter can replace this contract in a later release.
contract LQCIdleStrategyAdapter is ILQCStrategyAdapter {
    using SafeTransferLib for address;

    address public immutable asset;
    address public immutable vault;
    uint256 public totalManagedAssets;

    event AssetsDeployed(uint256 assets);
    event AssetsWithdrawn(address indexed receiver, uint256 assets);

    error Forbidden();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientAssets();
    error UnsupportedTokenBehavior();

    modifier onlyVault() {
        if (msg.sender != vault) revert Forbidden();
        _;
    }

    constructor(address asset_, address vault_) {
        if (asset_ == address(0) || vault_ == address(0)) revert ZeroAddress();
        asset = asset_;
        vault = vault_;
    }

    function deploy(uint256 assets) external onlyVault returns (uint256 deployedAssets) {
        if (assets == 0) revert ZeroAmount();
        if (IERC20(asset).balanceOf(address(this)) < totalManagedAssets + assets) {
            revert UnsupportedTokenBehavior();
        }
        totalManagedAssets += assets;
        emit AssetsDeployed(assets);
        return assets;
    }

    function withdraw(uint256 assets, address receiver) external onlyVault returns (uint256 returnedAssets) {
        if (receiver == address(0)) revert ZeroAddress();
        if (assets == 0) revert ZeroAmount();
        if (assets > totalManagedAssets) revert InsufficientAssets();

        uint256 receiverBefore = IERC20(asset).balanceOf(receiver);
        totalManagedAssets -= assets;
        asset.safeTransfer(receiver, assets);
        if (IERC20(asset).balanceOf(receiver) - receiverBefore != assets) revert UnsupportedTokenBehavior();

        emit AssetsWithdrawn(receiver, assets);
        return assets;
    }
}
