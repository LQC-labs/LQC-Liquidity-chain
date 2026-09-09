// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

interface IReentrantVault {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
    function recallFromStrategy(uint256 assets) external returns (uint256 received, uint256 loss);
}

/// @notice Audit-only strategy that reenters the Vault during allocation or recall.
contract MockReentrantStrategyAdapter {
    using SafeTransferLib for address;

    address public immutable asset;
    address public immutable vault;
    uint256 public totalManagedAssets;
    uint8 public attackMode;

    error Forbidden();

    constructor(address asset_, address vault_) {
        asset = asset_;
        vault = vault_;
    }

    function setAttackMode(uint8 mode) external { attackMode = mode; }

    function deploy(uint256 assets) external returns (uint256) {
        if (msg.sender != vault) revert Forbidden();
        if (attackMode == 1) IReentrantVault(vault).deposit(1, address(this));
        totalManagedAssets += assets;
        return assets;
    }

    function withdraw(uint256 assets, address receiver) external returns (uint256) {
        if (msg.sender != vault) revert Forbidden();
        if (attackMode == 2) IReentrantVault(vault).recallFromStrategy(1);
        totalManagedAssets -= assets;
        asset.safeTransfer(receiver, assets);
        return assets;
    }
}
