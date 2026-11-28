// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
interface ILQCVaultRead {
    function asset() external view returns (address);
    function totalAssets() external view returns (uint256);
    function accountedAssets() external view returns (uint256);
    function strategyDebt() external view returns (uint256);
    function depositCap() external view returns (uint256);
    function depositsPaused() external view returns (bool);
    function allocationsPaused() external view returns (bool);
    function availableLiquidity() external view returns (uint256);
    function isInsolvent() external view returns (bool);
    function convertToShares(uint256 assets) external view returns (uint256);
    function convertToAssets(uint256 shares) external view returns (uint256);
}
