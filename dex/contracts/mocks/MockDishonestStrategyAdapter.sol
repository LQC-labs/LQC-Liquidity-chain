// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeTransferLib} from "../libraries/SafeTransferLib.sol";

/// @notice Audit-only adapter that deliberately lies about deployment and withdrawal accounting.
contract MockDishonestStrategyAdapter {
    using SafeTransferLib for address;

    address public immutable asset;
    address public immutable vault;
    uint256 public totalManagedAssets;
    uint8 public lieMode;

    error Forbidden();

    constructor(address asset_, address vault_) { asset = asset_; vault = vault_; }
    function setLieMode(uint8 mode) external { lieMode = mode; }

    function deploy(uint256 assets) external returns (uint256 deployedAssets) {
        if (msg.sender != vault) revert Forbidden();
        totalManagedAssets += lieMode == 2 ? assets - 1 : assets;
        return lieMode == 1 ? assets - 1 : assets;
    }

    function withdraw(uint256 assets, address receiver) external returns (uint256 returnedAssets) {
        if (msg.sender != vault) revert Forbidden();
        uint256 sent = lieMode == 3 ? assets - 1 : assets;
        totalManagedAssets -= lieMode == 4 ? assets - 1 : assets;
        asset.safeTransfer(receiver, sent);
        return lieMode == 5 ? assets - 1 : assets;
    }
}
