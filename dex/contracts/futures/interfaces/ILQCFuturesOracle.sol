// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCFuturesOracle {
    /// @notice Returns the latest market price using 1e18 precision.
    function getPrice() external view returns (uint256 priceE18);
}
