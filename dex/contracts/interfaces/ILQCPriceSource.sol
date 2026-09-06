// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILQCPriceSource {
    /// @return price Normalized 18-decimal reference price.
    /// @return updatedAt Timestamp of the observation used for the price.
    function latestPrice(address token) external view returns (uint256 price, uint256 updatedAt);
}
