// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "../interfaces/IERC20.sol";
import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";
import {ILQCStrategyAdapter} from "../vault/interfaces/ILQCStrategyAdapter.sol";

contract MockLossyStrategyAdapter is ILQCStrategyAdapter {
    using SafeTransferLib for address;

    address public immutable asset;
    address public immutable vault;
    uint256 public totalManagedAssets;
    uint256 public lossBps;

    error Forbidden();
    error InvalidLoss();
    error InsufficientAssets();

    modifier onlyVault() {
        if (msg.sender != vault) revert Forbidden();
        _;
    }

    constructor(address asset_, address vault_) {
        asset = asset_;
        vault = vault_;
    }

    function setLossBps(uint256 newLossBps) external {
        if (newLossBps > 10_000) revert InvalidLoss();
        lossBps = newLossBps;
    }

    function simulateReportedLoss(uint256 assets) external {
        if (assets > totalManagedAssets) revert InsufficientAssets();
        totalManagedAssets -= assets;
    }

    function deploy(uint256 assets) external onlyVault returns (uint256) {
        if (IERC20(asset).balanceOf(address(this)) < totalManagedAssets + assets) revert InsufficientAssets();
        totalManagedAssets += assets;
        return assets;
    }

    function withdraw(uint256 assets, address receiver) external onlyVault returns (uint256 returnedAssets) {
        if (assets > totalManagedAssets) revert InsufficientAssets();
        totalManagedAssets -= assets;
        returnedAssets = assets - (assets * lossBps / 10_000);
        asset.safeTransfer(receiver, returnedAssets);
    }
}
