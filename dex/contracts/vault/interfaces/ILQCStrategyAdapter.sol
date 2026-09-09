// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface between the LQC vault and an approved asset strategy.
/// @dev Adapters are vault-specific. They must account for deployed assets without
///      including unsolicited token donations.
interface ILQCStrategyAdapter {
    function asset() external view returns (address);
    function vault() external view returns (address);
    function totalManagedAssets() external view returns (uint256);

    function deploy(uint256 assets) external returns (uint256 deployedAssets);
    /// @dev Must reduce `totalManagedAssets` by exactly `assets`. `returnedAssets` may be lower
    ///      only when the strategy realizes a loss that the vault explicitly accepts.
    function withdraw(uint256 assets, address receiver) external returns (uint256 returnedAssets);
}
